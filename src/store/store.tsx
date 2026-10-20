import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { localDate } from '../lib/dates';
import { uid } from '../lib/id';
import { effectiveLevel, setLevel, syncShoppingList } from '../lib/pantry';
import type {
  AppData,
  Bucket,
  Dish,
  Household,
  HouseholdSettings,
  Item,
  MealKind,
  MealLog,
  PantryEvent,
  ShoppingEntry,
  Slot,
} from '../types';
import type { Backend, TableName } from './backend';

// A batch of changes: rows to write and ids to delete, per table.
interface Change {
  items?: Item[];
  dishes?: Dish[];
  meals?: MealLog[];
  shopping?: ShoppingEntry[];
  events?: PantryEvent[];
  removed?: Partial<Record<TableName, string[]>>;
}

function applyChange(data: AppData, c: Change): AppData {
  const next = { ...data };
  const merge = <T extends { id: string }>(list: T[], rows: T[] | undefined, removed: string[] | undefined): T[] => {
    if (!rows?.length && !removed?.length) return list;
    const map = new Map(list.map((r) => [r.id, r]));
    rows?.forEach((r) => map.set(r.id, r));
    removed?.forEach((id) => map.delete(id));
    return [...map.values()];
  };
  next.items = merge(data.items, c.items, c.removed?.items);
  next.dishes = merge(data.dishes, c.dishes, c.removed?.dishes);
  next.meals = merge(data.meals, c.meals, c.removed?.meals);
  next.shopping = merge(data.shopping, c.shopping, c.removed?.shopping);
  next.events = merge(data.events, c.events, c.removed?.events);
  return next;
}

// Folds the shopping list sync into a change, against the state after it.
function withShoppingSync(data: AppData, c: Change, now: Date): Change {
  const after = applyChange(data, c);
  const { add, remove } = syncShoppingList(after.items, after.shopping, data.household.settings, now);
  if (!add.length && !remove.length) return c;
  return {
    ...c,
    shopping: [...(c.shopping ?? []), ...add],
    removed: { ...c.removed, shopping: [...(c.removed?.shopping ?? []), ...remove] },
  };
}

export interface Store {
  data: AppData;
  backend: Backend;
  saving: boolean;
  error: string | null;
  clearError(): void;
  reload(): Promise<void>;

  logMeal(opts: { date: string; slot: Slot; kind: MealKind; dish?: Dish | null; label?: string; servings?: number }): string;
  undoMeal(mealId: string): void;
  setItemLevel(itemId: string, level: number, reason?: 'correction' | 'manual' | 'spoiled' | 'purchase'): void;
  skipQuestion(itemId: string): void;
  markBought(entryId: string): void;
  unmarkBought(entryId: string): void;
  addShopping(name: string, bucket: Bucket): void;
  removeShopping(id: string): void;
  clearBought(): void;
  refreshShopping(): void;
  saveItem(item: Item): void;
  deleteItem(id: string): void;
  saveDish(dish: Dish): void;
  deleteDish(id: string): void;
  updateHousehold(patch: Partial<Omit<Household, 'settings'>> & { settings?: Partial<HouseholdSettings> }): void;
}

const Ctx = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside StoreProvider');
  return s;
}

export function StoreProvider({ backend, initial, children }: { backend: Backend; initial: AppData; children: ReactNode }) {
  const [data, setData] = useState<AppData>(initial);
  const dataRef = useRef(data);
  dataRef.current = data;
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const lastWrite = useRef(0);
  const queue = useRef<Promise<void>>(Promise.resolve());

  const persist = useCallback(
    (c: Change) => {
      lastWrite.current = Date.now();
      setPending((p) => p + 1);
      // Writes go out one batch at a time, in order.
      queue.current = queue.current
        .then(async () => {
          const tables: TableName[] = ['items', 'dishes', 'meals', 'shopping', 'events'];
          for (const t of tables) {
            const rows = c[t] as object[] | undefined;
            if (rows?.length) await backend.upsert(t, rows);
          }
          for (const t of [...tables].reverse()) {
            const ids = c.removed?.[t];
            if (ids?.length) await backend.remove(t, ids);
          }
        })
        .catch((e: unknown) => {
          setError(`Could not save: ${e instanceof Error ? e.message : String(e)}`);
        })
        .finally(() => {
          lastWrite.current = Date.now();
          setPending((p) => p - 1);
        });
    },
    [backend],
  );

  const commit = useCallback(
    (build: (d: AppData, now: Date) => Change, syncList = true) => {
      const now = new Date();
      const d = dataRef.current;
      let c = build(d, now);
      if (syncList) c = withShoppingSync(d, c, now);
      const next = applyChange(d, c);
      dataRef.current = next;
      setData(next);
      persist(c);
    },
    [persist],
  );

  const reload = useCallback(async () => {
    const fresh = await backend.load();
    if (fresh) setData(fresh);
  }, [backend]);

  // Another family member changed something: reload, but not while our own
  // writes are still landing (their echoes would arrive mid-flight).
  useEffect(() => {
    return backend.subscribe(() => {
      const tryReload = () => {
        if (Date.now() - lastWrite.current < 2500) setTimeout(tryReload, 1500);
        else reload().catch(() => {});
      };
      tryReload();
    });
  }, [backend, reload]);

  // Refresh when the app comes back to the foreground (phone unlocked).
  useEffect(() => {
    if (backend.mode !== 'cloud') return;
    const onVis = () => {
      if (document.visibilityState === 'visible') reload().catch(() => {});
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [backend, reload]);

  const store = useMemo<Store>(() => {
    const itemById = (d: AppData, id: string) => d.items.find((i) => i.id === id);

    return {
      data,
      backend,
      saving: pending > 0,
      error,
      clearError: () => setError(null),
      reload,

      logMeal: ({ date, slot, kind, dish, label, servings }) => {
        const mealId = uid();
        commit((d, now) => {
          const people = d.household.settings.people || 1;
          const meal: MealLog = {
            id: mealId,
            date,
            slot,
            kind,
            dishId: dish?.id ?? null,
            label: label ?? dish?.name ?? '',
            servings: servings ?? people,
            createdAt: now.toISOString(),
          };
          const items: Item[] = [];
          const events: PantryEvent[] = [];
          if (kind === 'cooked' && dish) {
            const factor = meal.servings / people;
            for (const ing of dish.ingredients) {
              const item = itemById(d, ing.itemId);
              if (!item) continue;
              const eff = effectiveLevel(item, now);
              if (ing.optional && eff < 0.08) continue; // skipped an optional ingredient we did not have
              const ch = setLevel(item, eff - ing.use * factor, 'meal', now, meal.id);
              items.push(ch.item);
              events.push(ch.event);
            }
          }
          return { meals: [meal], items, events };
        });
        return mealId;
      },

      undoMeal: (mealId) =>
        commit((d, now) => {
          const items: Item[] = [];
          const events: PantryEvent[] = [];
          for (const ev of d.events.filter((e) => e.mealId === mealId && e.reason === 'meal')) {
            const item = items.find((i) => i.id === ev.itemId) ?? itemById(d, ev.itemId);
            if (!item) continue;
            const ch = setLevel(item, effectiveLevel(item, now) + (ev.before - ev.after), 'undo', now, mealId);
            const at = items.findIndex((i) => i.id === item.id);
            if (at >= 0) items[at] = ch.item;
            else items.push(ch.item);
            events.push(ch.event);
          }
          return { items, events, removed: { meals: [mealId] } };
        }),

      setItemLevel: (itemId, level, reason = 'correction') =>
        commit((d, now) => {
          const item = itemById(d, itemId);
          if (!item) return {};
          const ch = setLevel(item, level, reason, now);
          ch.item.askedAt = now.toISOString();
          return { items: [ch.item], events: [ch.event] };
        }),

      skipQuestion: (itemId) =>
        commit((d, now) => {
          const item = itemById(d, itemId);
          return item ? { items: [{ ...item, askedAt: now.toISOString() }] } : {};
        }, false),

      markBought: (entryId) =>
        commit((d, now) => {
          const entry = d.shopping.find((e) => e.id === entryId);
          if (!entry) return {};
          const c: Change = { shopping: [{ ...entry, status: 'bought', boughtAt: now.toISOString() }] };
          const item = entry.itemId ? itemById(d, entry.itemId) : undefined;
          if (item) {
            const ch = setLevel(item, 1, 'purchase', now);
            c.items = [ch.item];
            c.events = [ch.event];
          }
          return c;
        }),

      unmarkBought: (entryId) =>
        commit((d) => {
          const entry = d.shopping.find((e) => e.id === entryId);
          if (!entry) return {};
          // Put the item back to where it was before the purchase.
          const ev = [...d.events].reverse().find((e) => e.itemId === entry.itemId && e.reason === 'purchase');
          const item = entry.itemId ? itemById(d, entry.itemId) : undefined;
          const c: Change = { shopping: [{ ...entry, status: 'needed', boughtAt: null }] };
          if (item && ev) {
            const ch = setLevel(item, ev.before, 'undo', new Date());
            c.items = [ch.item];
            c.events = [ch.event];
          }
          return c;
        }, false),

      addShopping: (name, bucket) =>
        commit((d, now) => {
          const item = d.items.find((i) => i.name.toLowerCase() === name.trim().toLowerCase());
          const existing = d.shopping.find((e) => e.status === 'needed' && (item ? e.itemId === item.id : e.name.toLowerCase() === name.trim().toLowerCase()));
          if (existing) return {};
          return {
            shopping: [
              {
                id: uid(),
                itemId: item?.id ?? null,
                name: item?.name ?? name.trim(),
                note: item?.packLabel ?? '',
                bucket: item?.bucket ?? bucket,
                status: 'needed',
                source: 'manual',
                createdAt: now.toISOString(),
                boughtAt: null,
              },
            ],
          };
        }, false),

      // Removing an auto-added entry means "we have enough", so the pantry
      // is corrected too; otherwise the next sync would add it straight back.
      removeShopping: (id) =>
        commit((d, now) => {
          const entry = d.shopping.find((e) => e.id === id);
          const item = entry?.source === 'auto' && entry.itemId ? itemById(d, entry.itemId) : undefined;
          if (!item) return { removed: { shopping: [id] } };
          const ch = setLevel(item, Math.max(effectiveLevel(item, now), 0.6), 'correction', now);
          return { items: [ch.item], events: [ch.event], removed: { shopping: [id] } };
        }, false),

      clearBought: () => commit((d) => ({ removed: { shopping: d.shopping.filter((e) => e.status === 'bought').map((e) => e.id) } }), false),

      refreshShopping: () => commit(() => ({})),

      saveItem: (item) => commit(() => ({ items: [item] })),

      deleteItem: (id) =>
        commit((d) => ({
          // Drop it from recipes too, so dishes do not wait on a missing item.
          dishes: d.dishes
            .filter((x) => x.ingredients.some((i) => i.itemId === id))
            .map((x) => ({ ...x, ingredients: x.ingredients.filter((i) => i.itemId !== id) })),
          removed: {
            items: [id],
            events: d.events.filter((e) => e.itemId === id).map((e) => e.id),
            shopping: d.shopping.filter((e) => e.itemId === id).map((e) => e.id),
          },
        }), false),

      saveDish: (dish) => commit(() => ({ dishes: [dish] }), false),

      deleteDish: (id) => commit(() => ({ removed: { dishes: [id] } }), false),

      updateHousehold: (patch) => {
        const d = dataRef.current;
        const household: Household = {
          ...d.household,
          ...patch,
          settings: { ...d.household.settings, ...patch.settings },
        };
        const next = { ...d, household };
        dataRef.current = next;
        setData(next);
        lastWrite.current = Date.now();
        backend.saveHousehold(household).catch((e: unknown) => setError(`Could not save: ${e instanceof Error ? e.message : String(e)}`));
      },

    };
  }, [data, backend, pending, error, reload, commit]);

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function today(): string {
  return localDate();
}
