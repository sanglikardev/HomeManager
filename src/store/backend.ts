import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AppData, Household } from '../types';

// The app keeps everything in memory and writes changes through a Backend.
// "local" keeps data in this browser (no setup needed, handy for trying it
// out). "cloud" is Supabase, shared by the whole family. All Supabase tables
// are prefixed hm_ because, for now, they live in the Samarth project.

export type TableName = 'items' | 'dishes' | 'meals' | 'shopping' | 'events';

const TABLES: Record<TableName, string> = {
  items: 'hm_items',
  dishes: 'hm_dishes',
  meals: 'hm_meals',
  shopping: 'hm_shopping',
  events: 'hm_pantry_events',
};

export interface Backend {
  mode: 'local' | 'cloud';
  load(): Promise<AppData | null>; // null: signed in, but no household yet
  createHousehold(data: AppData): Promise<AppData>;
  joinHousehold(code: string): Promise<void>;
  saveHousehold(h: Household): Promise<void>;
  upsert(table: TableName, rows: object[]): Promise<void>;
  remove(table: TableName, ids: string[]): Promise<void>;
  subscribe(onRemoteChange: () => void): () => void;
}

// ---------- local ----------

const LOCAL_KEY = 'homemanager_data_v1';

export class LocalBackend implements Backend {
  mode = 'local' as const;
  private data: AppData | null = null;

  async load() {
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      this.data = raw ? (JSON.parse(raw) as AppData) : null;
    } catch {
      this.data = null;
    }
    return this.data ? structuredClone(this.data) : null;
  }
  private save() {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(this.data));
    } catch {
      // Storage full or blocked: the in-memory copy still works this session.
    }
  }
  async createHousehold(data: AppData) {
    this.data = structuredClone(data);
    this.save();
    return data;
  }
  async joinHousehold() {
    throw new Error('Joining a family needs the cloud version.');
  }
  async saveHousehold(h: Household) {
    if (!this.data) return;
    this.data.household = h;
    this.save();
  }
  async upsert(table: TableName, rows: object[]) {
    if (!this.data) return;
    const list = this.data[table] as unknown as { id: string }[];
    for (const row of rows as { id: string }[]) {
      const i = list.findIndex((r) => r.id === row.id);
      if (i >= 0) list[i] = row;
      else list.push(row);
    }
    this.save();
  }
  async remove(table: TableName, ids: string[]) {
    if (!this.data) return;
    const set = new Set(ids);
    (this.data[table] as unknown as { id: string }[]) = (this.data[table] as unknown as { id: string }[]).filter((r) => !set.has(r.id));
    this.save();
  }
  subscribe() {
    return () => {};
  }
}

export function resetLocalData() {
  try {
    localStorage.removeItem(LOCAL_KEY);
  } catch {
    // ignore
  }
}

// ---------- cloud (Supabase) ----------

const toSnake = (k: string) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const toCamel = (k: string) => k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

function rowToDb(row: object, householdId: string): Record<string, unknown> {
  const out: Record<string, unknown> = { household_id: householdId };
  for (const [k, v] of Object.entries(row)) out[toSnake(k)] = v;
  return out;
}

function rowFromDb<T>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (k === 'household_id' || k === 'updated_at') continue;
    out[toCamel(k)] = v;
  }
  return out as T;
}

export function supabaseConfigured(): boolean {
  return Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
}

let client: SupabaseClient | null = null;
export function supabase(): SupabaseClient {
  if (!client) {
    client = createClient(import.meta.env.VITE_SUPABASE_URL as string, import.meta.env.VITE_SUPABASE_ANON_KEY as string, {
      auth: { storageKey: 'homemanager-auth' },
    });
  }
  return client;
}

export class CloudBackend implements Backend {
  mode = 'cloud' as const;
  private householdId: string | null = null;

  private get db() {
    return supabase();
  }

  private hid(): string {
    if (!this.householdId) throw new Error('No household loaded');
    return this.householdId;
  }

  async load(): Promise<AppData | null> {
    const { data: hh, error } = await this.db.from('hm_households').select('*').limit(1).maybeSingle();
    if (error) throw error;
    if (!hh) return null;
    this.householdId = hh.id as string;
    const household: Household = { id: hh.id, name: hh.name, inviteCode: hh.invite_code, settings: hh.settings };

    const fetchAll = async <T,>(table: TableName, order: string): Promise<T[]> => {
      const rows: T[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error: e } = await this.db
          .from(TABLES[table])
          .select('*')
          .eq('household_id', household.id)
          .order(order)
          .range(from, from + 999);
        if (e) throw e;
        rows.push(...(data ?? []).map((r) => rowFromDb<T>(r)));
        if (!data || data.length < 1000) break;
      }
      return rows;
    };
    // Events only matter for undo and recent learning: keep the last 60 days.
    const since = new Date(Date.now() - 60 * 864e5).toISOString();
    const { data: ev, error: evErr } = await this.db
      .from(TABLES.events)
      .select('*')
      .eq('household_id', household.id)
      .gte('created_at', since)
      .order('created_at');
    if (evErr) throw evErr;

    const [items, dishes, meals, shopping] = await Promise.all([
      fetchAll<AppData['items'][number]>('items', 'name'),
      fetchAll<AppData['dishes'][number]>('dishes', 'name'),
      fetchAll<AppData['meals'][number]>('meals', 'created_at'),
      fetchAll<AppData['shopping'][number]>('shopping', 'created_at'),
    ]);
    return { household, items, dishes, meals, shopping, events: (ev ?? []).map((r) => rowFromDb(r)) };
  }

  async createHousehold(data: AppData): Promise<AppData> {
    const { data: hid, error } = await this.db.rpc('hm_create_household', {
      p_name: data.household.name,
      p_settings: data.household.settings,
    });
    if (error) throw error;
    this.householdId = hid as string;
    await this.upsert('items', data.items);
    await this.upsert('dishes', data.dishes);
    const loaded = await this.load();
    if (!loaded) throw new Error('Household was created but could not be loaded');
    return loaded;
  }

  async joinHousehold(code: string) {
    const { error } = await this.db.rpc('hm_join_household', { p_code: code.trim().toUpperCase() });
    if (error) throw error;
  }

  async saveHousehold(h: Household) {
    const { error } = await this.db.from('hm_households').update({ name: h.name, settings: h.settings }).eq('id', h.id);
    if (error) throw error;
  }

  async upsert(table: TableName, rows: object[]) {
    if (!rows.length) return;
    const hid = this.hid();
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await this.db.from(TABLES[table]).upsert(rows.slice(i, i + 500).map((r) => rowToDb(r, hid)));
      if (error) throw error;
    }
  }

  async remove(table: TableName, ids: string[]) {
    if (!ids.length) return;
    const { error } = await this.db.from(TABLES[table]).delete().in('id', ids);
    if (error) throw error;
  }

  subscribe(onRemoteChange: () => void) {
    if (!this.householdId) return () => {};
    const filter = `household_id=eq.${this.householdId}`;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const bump = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(onRemoteChange, 800);
    };
    const channel = this.db.channel(`hm-${this.householdId}`);
    for (const t of ['hm_items', 'hm_dishes', 'hm_meals', 'hm_shopping']) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table: t, filter }, bump);
    }
    channel.subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      this.db.removeChannel(channel);
    };
  }
}
