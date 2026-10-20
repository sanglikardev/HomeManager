import { Minus, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useStore } from '../store/store';
import type { Dish, MealKind, Slot } from '../types';
import { useToast } from './toast';
import { inputCls, PrimaryButton, Segmented, Sheet } from './ui';

type Mode = 'dish' | 'out' | 'leftovers' | 'skipped';

export function MealPickerSheet({ slot, date, onClose }: { slot: Slot; date: string; onClose: () => void }) {
  const store = useStore();
  const toast = useToast();
  const [mode, setMode] = useState<Mode>('dish');
  const [q, setQ] = useState('');
  const [dish, setDish] = useState<Dish | null>(null);
  const [text, setText] = useState('');
  const [servings, setServings] = useState(store.data.household.settings.people);

  const dishes = useMemo(() => {
    const term = q.trim().toLowerCase();
    return [...store.data.dishes]
      .filter((d) => !term || d.name.toLowerCase().includes(term))
      .sort((a, b) => Number(b.active) - Number(a.active) || Number(b.slots.includes(slot)) - Number(a.slots.includes(slot)) || a.name.localeCompare(b.name));
  }, [store.data.dishes, q, slot]);

  const save = () => {
    const kind: MealKind = mode === 'dish' ? 'cooked' : mode;
    const label = mode === 'dish' ? (dish?.name ?? q.trim()) : mode === 'out' ? text.trim() || 'Ate out' : mode === 'leftovers' ? text.trim() || 'Leftovers' : 'Skipped';
    const id = store.logMeal({ date, slot, kind, dish: mode === 'dish' ? dish : null, label, servings });
    toast(`${label} logged`, { label: 'Undo', run: () => store.undoMeal(id) });
    onClose();
  };

  const canSave = mode !== 'dish' || dish || (q.trim() && !dishes.length);

  return (
    <Sheet
      title={`What was ${slot}?`}
      onClose={onClose}
      footer={
        <PrimaryButton onClick={save} disabled={!canSave} className="w-full">
          Save
        </PrimaryButton>
      }
    >
      <div className="mb-4">
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'dish', label: 'Cooked' },
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
                onClick={() => setDish(d)}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left ${dish?.id === d.id ? 'bg-teal-50 ring-2 ring-teal-600' : 'hover:bg-stone-50'}`}
              >
                <span className={d.active ? 'text-stone-900' : 'text-stone-500'}>{d.name}</span>
                {!d.active && <span className="text-xs text-stone-400">not in rotation</span>}
              </button>
            ))}
            {!dishes.length && (
              <p className="px-3 py-2 text-sm text-stone-500">No dish called that. It will be logged as typed, without updating the pantry.</p>
            )}
          </div>
          <div className="flex items-center justify-between rounded-2xl bg-stone-50 px-4 py-3">
            <span className="text-sm font-medium text-stone-700">Cooked for</span>
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
