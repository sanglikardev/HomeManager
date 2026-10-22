import { Minus, Plus, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { localDate } from '../lib/dates';
import { useStore } from '../store/store';
import type { Dish, Slot } from '../types';
import { useToast } from './toast';
import { inputCls, PrimaryButton, Segmented, Sheet } from './ui';

type Mode = 'dish' | 'out' | 'leftovers' | 'skipped';
// A dish (or typed name) chosen for this meal, with an optional amount for the cook.
interface Pick {
  key: string;
  dish: Dish | null;
  name: string;
  qty: string;
}

export function MealPickerSheet({ slot, date, onClose }: { slot: Slot; date: string; onClose: () => void }) {
  const future = date > localDate();
  const store = useStore();
  const toast = useToast();
  const [mode, setMode] = useState<Mode>('dish');
  const [q, setQ] = useState('');
  const [picks, setPicks] = useState<Pick[]>([]);
  const [text, setText] = useState('');
  const [servings, setServings] = useState(store.data.household.settings.people);

  const dishes = useMemo(() => {
    const term = q.trim().toLowerCase();
    return [...store.data.dishes]
      .filter((d) => !term || d.name.toLowerCase().includes(term))
      .sort((a, b) => Number(b.active) - Number(a.active) || Number(b.slots.includes(slot)) - Number(a.slots.includes(slot)) || a.name.localeCompare(b.name));
  }, [store.data.dishes, q, slot]);

  const toggle = (d: Dish) =>
    setPicks((p) => (p.some((x) => x.key === d.id) ? p.filter((x) => x.key !== d.id) : [...p, { key: d.id, dish: d, name: d.name, qty: '' }]));
  const addTyped = () => {
    const name = q.trim();
    if (!name) return;
    setPicks((p) => [...p, { key: `typed:${name}`, dish: null, name, qty: '' }]);
    setQ('');
  };
  const setQty = (key: string, qty: string) => setPicks((p) => p.map((x) => (x.key === key ? { ...x, qty } : x)));

  const save = () => {
    if (mode === 'dish') {
      const ids = picks.map((p) => store.logMeal({ date, slot, kind: 'cooked', dish: p.dish, label: p.name, servings, qty: p.qty.trim() }));
      toast(picks.length === 1 ? `${picks[0].name} ${future ? 'planned' : 'logged'}` : `${picks.length} dishes ${future ? 'planned' : 'logged'}`, {
        label: 'Undo',
        run: () => ids.forEach((id) => store.undoMeal(id)),
      });
    } else {
      const label = mode === 'out' ? text.trim() || 'Ate out' : mode === 'leftovers' ? text.trim() || 'Leftovers' : 'Skipped';
      const id = store.logMeal({ date, slot, kind: mode, dish: null, label, servings });
      toast(`${label} logged`, { label: 'Undo', run: () => store.undoMeal(id) });
    }
    onClose();
  };

  const canSave = mode !== 'dish' || picks.length > 0;

  return (
    <Sheet
      title={future ? `Plan ${slot}` : `What was ${slot}?`}
      onClose={onClose}
      footer={
        <PrimaryButton onClick={save} disabled={!canSave} className="w-full">
          {mode === 'dish' && picks.length > 1 ? `Save ${picks.length} dishes` : 'Save'}
        </PrimaryButton>
      }
    >
      <div className="mb-4">
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'dish', label: future ? 'Cook' : 'Cooked' },
            { value: 'out', label: 'Ordered' },
            { value: 'leftovers', label: 'Leftovers' },
            { value: 'skipped', label: 'Skipped' },
          ]}
        />
      </div>

      {mode === 'dish' && (
        <>
          <div className="relative mb-3">
            <Search size={18} className="absolute left-3 top-3 text-stone-400" />
            <input className={`${inputCls} pl-10`} placeholder="Search dishes" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="mb-4 max-h-72 space-y-1 overflow-y-auto">
            {dishes.map((d) => (
              <button
                key={d.id}
                onClick={() => toggle(d)}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left ${picks.some((x) => x.key === d.id) ? 'bg-teal-50 ring-2 ring-teal-600' : 'hover:bg-stone-50'}`}
              >
                <span className={d.active ? 'text-stone-900' : 'text-stone-500'}>{d.name}</span>
                {!d.active && <span className="text-xs text-stone-400">not in rotation</span>}
              </button>
            ))}
            {!dishes.length && (
              <button onClick={addTyped} className="w-full rounded-xl px-3 py-2.5 text-left text-sm text-teal-700">
                No dish called that. Add "{q.trim()}" as typed (the pantry is not updated).
              </button>
            )}
          </div>
          {picks.length > 0 && (
            <div className="mb-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">In this meal</p>
              {picks.map((p) => (
                <div key={p.key} className="flex items-center gap-2 rounded-2xl bg-stone-50 px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-stone-900">{p.name}</span>
                  <input
                    className={`${inputCls} !w-28 !py-1.5 text-sm`}
                    placeholder="How many?"
                    aria-label={`Amount of ${p.name}`}
                    value={p.qty}
                    onChange={(e) => setQty(p.key, e.target.value)}
                  />
                  <button onClick={() => setPicks((all) => all.filter((x) => x.key !== p.key))} aria-label={`Remove ${p.name}`} className="p-1 text-stone-400">
                    <X size={16} />
                  </button>
                </div>
              ))}
              <p className="text-xs text-stone-500">Amounts are optional, e.g. "12" for roti or "1 bowl". They go in the message to the cook.</p>
            </div>
          )}
          <div className="flex items-center justify-between rounded-2xl bg-stone-50 px-4 py-3">
            <span className="text-sm font-medium text-stone-700">{future ? 'Cooking for' : 'Cooked for'}</span>
            <div className="flex items-center gap-3">
              <button onClick={() => setServings((s) => Math.max(1, s - 1))} className="rounded-full bg-white p-1.5 ring-1 ring-stone-200" aria-label="Fewer people">
                <Minus size={16} />
              </button>
              <span className="w-6 text-center font-semibold">{servings}</span>
              <button onClick={() => setServings((s) => s + 1)} className="rounded-full bg-white p-1.5 ring-1 ring-stone-200" aria-label="More people">
                <Plus size={16} />
              </button>
            </div>
          </div>
        </>
      )}

      {(mode === 'out' || mode === 'leftovers') && (
        <input
          className={inputCls}
          autoFocus
          placeholder={mode === 'out' ? "What did you order? (optional)" : 'Leftovers of what? (optional)'}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      )}
      {mode !== 'dish' && <p className="mt-3 text-sm text-stone-500">The pantry is not changed for this meal.</p>}
    </Sheet>
  );
}
