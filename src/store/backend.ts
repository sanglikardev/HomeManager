import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AppData, Household } from '../types';

// The app keeps everything in memory and writes changes through a Backend.
// "local" keeps data in this browser (no setup needed, handy for trying it
// out). "cloud" is Supabase, shared by the whole family. All Supabase tables
// are prefixed hm_ because, for now, they live in the Samarth project.
// Cloud sign-in is HomeManager's own username + password (see
// supabase/migrations/0002_username_login.sql), not Supabase Auth.

export type TableName = 'items' | 'dishes' | 'meals' | 'shopping' | 'events' | 'upkeep' | 'plans' | 'expenses' | 'bills' | 'staff' | 'docs';

const TABLES: Record<TableName, string> = {
  items: 'hm_items',
  dishes: 'hm_dishes',
  meals: 'hm_meals',
  shopping: 'hm_shopping',
  events: 'hm_pantry_events',
  upkeep: 'hm_upkeep',
  plans: 'hm_plans',
  expenses: 'hm_expenses',
  bills: 'hm_bills',
  staff: 'hm_staff',
  docs: 'hm_docs',
};

export interface DocFile {
  id: string;
  docId: string;
  name: string;
  mime: string;
  data: string; // base64
}

export interface Backend {
  mode: 'local' | 'cloud';
  load(): Promise<AppData | null>; // null: signed in, but no household yet
  createHousehold(data: AppData): Promise<AppData>;
  joinHousehold(code: string): Promise<void>;
  saveHousehold(h: Household): Promise<void>;
  upsert(table: TableName, rows: object[]): Promise<void>;
  remove(table: TableName, ids: string[]): Promise<void>;
  subscribe(onRemoteChange: () => void): () => void;
  putDocFile(file: DocFile): Promise<void>;
  getDocFile(id: string): Promise<DocFile | null>;
  removeDocFiles(ids: string[]): Promise<void>;
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
      // Data saved before upkeep and plans existed.
      if (this.data) {
        this.data.upkeep ??= [];
        this.data.plans ??= [];
        this.data.expenses ??= [];
        this.data.bills ??= [];
        this.data.staff ??= [];
        this.data.docs ??= [];
      }
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
  // Files go in their own key so the main data stays small; big ones may not fit.
  async putDocFile(file: DocFile) {
    try {
      localStorage.setItem(`${LOCAL_KEY}_file_${file.id}`, JSON.stringify(file));
    } catch {
      throw new Error('Not enough space on this device for that file.');
    }
  }
  async getDocFile(id: string) {
    try {
      const raw = localStorage.getItem(`${LOCAL_KEY}_file_${id}`);
      return raw ? (JSON.parse(raw) as DocFile) : null;
    } catch {
      return null;
    }
  }
  async removeDocFiles(ids: string[]) {
    try {
      ids.forEach((id) => localStorage.removeItem(`${LOCAL_KEY}_file_${id}`));
    } catch {
      // ignore
    }
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

function rowToDb(row: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
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
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

// ---------- cloud session (username + password, token in this browser) ----------

const TOKEN_KEY = 'homemanager_token';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore: the session then lasts only while the page is open
  }
  window.dispatchEvent(new Event('homemanager-auth'));
}

// Signs in, or creates the account the first time a username is used.
export async function signIn(username: string, password: string): Promise<void> {
  const { data, error } = await supabase().rpc('hm_login', { p_username: username, p_password: password });
  if (error) throw new Error(error.message);
  setToken(data as string);
}

export async function signOut(): Promise<void> {
  const token = getToken();
  setToken(null);
  if (token) await supabase().rpc('hm_logout', { p_token: token });
}

// ---------- feedback (cloud only, owner home only) ----------

export interface FeedbackItem {
  id: string;
  kind: 'bug' | 'idea';
  body: string;
  status: 'new' | 'working' | 'done' | 'question' | 'declined';
  claudeNote: string;
  createdAt: string;
  updatedAt: string;
  by: string | null;
}

export async function listFeedback(): Promise<{ enabled: boolean; items: FeedbackItem[] }> {
  const { data, error } = await supabase().rpc('hm_feedback_list', { p_token: getToken() });
  if (error) throw new Error(error.message);
  return data as { enabled: boolean; items: FeedbackItem[] };
}

export async function addFeedback(kind: 'bug' | 'idea', body: string): Promise<void> {
  const { error } = await supabase().rpc('hm_feedback_add', { p_token: getToken(), p_kind: kind, p_body: body });
  if (error) throw new Error(error.message);
}

// Every read and write goes through hm_* database functions that check the
// session token, so the tables themselves stay closed to the public key.
export class CloudBackend implements Backend {
  mode = 'cloud' as const;

  private async call<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
    const { data, error } = await supabase().rpc(fn, { p_token: getToken(), ...args });
    if (error) {
      if (error.message.includes('sign in again')) setToken(null);
      throw new Error(error.message);
    }
    return data as T;
  }

  async load(): Promise<AppData | null> {
    const raw = await this.call<Record<string, unknown> | null>('hm_load');
    if (!raw) return null;
    const hh = raw.household as Record<string, unknown>;
    const list = <T,>(k: string) => ((raw[k] as Record<string, unknown>[]) ?? []).map((r) => rowFromDb<T>(r));
    return {
      household: { id: hh.id as string, name: hh.name as string, inviteCode: hh.invite_code as string, settings: hh.settings as Household['settings'] },
      items: list('items'),
      dishes: list('dishes'),
      meals: list('meals'),
      shopping: list('shopping'),
      events: list('events'),
      upkeep: list('upkeep'),
      plans: list('plans'),
      expenses: list('expenses'),
      bills: list('bills'),
      staff: list('staff'),
      docs: list('docs'),
    };
  }

  async createHousehold(data: AppData): Promise<AppData> {
    await this.call('hm_create_household', { p_name: data.household.name, p_settings: data.household.settings });
    await this.upsert('items', data.items);
    await this.upsert('dishes', data.dishes);
    const loaded = await this.load();
    if (!loaded) throw new Error('Household was created but could not be loaded');
    return loaded;
  }

  async joinHousehold(code: string) {
    await this.call('hm_join_household', { p_code: code.trim().toUpperCase() });
  }

  async saveHousehold(h: Household) {
    await this.call('hm_save_household', { p_name: h.name, p_settings: h.settings });
  }

  async upsert(table: TableName, rows: object[]) {
    for (let i = 0; i < rows.length; i += 200) {
      await this.call('hm_upsert', { p_table: TABLES[table], p_rows: rows.slice(i, i + 200).map((r) => rowToDb(r)) });
    }
  }

  async remove(table: TableName, ids: string[]) {
    if (!ids.length) return;
    await this.call('hm_delete', { p_table: TABLES[table], p_ids: ids });
  }

  async putDocFile(file: DocFile) {
    await this.call('hm_upsert', { p_table: 'hm_doc_files', p_rows: [rowToDb(file)] });
  }

  async getDocFile(id: string): Promise<DocFile | null> {
    const raw = await this.call<{ name: string; mime: string; data: string } | null>('hm_doc_file', { p_id: id });
    return raw ? { id, docId: '', ...raw } : null;
  }

  async removeDocFiles(ids: string[]) {
    if (ids.length) await this.call('hm_delete', { p_table: 'hm_doc_files', p_ids: ids });
  }

  // Other family members' changes: poll a cheap version string.
  subscribe(onRemoteChange: () => void) {
    let last: string | null = null;
    let stopped = false;
    const tick = async () => {
      if (stopped || document.visibilityState !== 'visible') return;
      try {
        const v = await this.call<string>('hm_version');
        if (last !== null && v !== last) onRemoteChange();
        last = v;
      } catch {
        // offline or signed out: try again next tick
      }
    };
    tick();
    const timer = setInterval(tick, 20000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }
}
