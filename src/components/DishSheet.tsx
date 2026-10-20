import { Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { uid } from '../lib/id';
import { useStore } from '../store/store';
import { SLOTS, type Dish, type DishTag } from '../types';
import { Field, inputCls, PrimaryButton, Sheet, Toggle } from './ui';

const TAG_CHOICES: DishTag[] = ['dal', 'sabzi', 'rice', 'roti', 'paneer', 'egg', 'chicken', 'fish', 'mutton', 'light', 'heavy', 'quick', 'special', 'fasting', 'south-indian', 'chinese', 'continental'];

const AMOUNTS = [
  { label: 'A little', value: 0.05 },
  { label: 'Some', value: 0.15 },
  { label: 'A lot', value: 0.35 },
  { label: 'All', value: 1 },
];

function nearestAmount(v: number) {
  return AMOUNTS.reduce((b, a) => (Math.abs(a.value - v) < Math.abs(b.value - v) ? a : b));
}

export function DishSheet({ dish, onClose }: { dish: Dish | null; onClose: () => void }) {
  const store = useStore();
  const items = store.data.items;
  const [draft, setDraft] = useState<Dish>(dish ?? { id: uid(), name: '', slots: ['lunch', 'dinner'], tags: [], cookMinutes: 30, ingredients: [], active: true, favorite: false });
  const [adding, setAdding] = useState('');
  const set = (patch: Partial<Dish>) => setDraft((d) => ({ ...d, ...patch }));
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const addIngredient = (name: string) => {
    const item = items.find((i) => i.name.toLowerCase() === name.trim().toLowerCase());
    if (!item || draft.ingredients.some((i) => i.itemId === item.id)) return;
    set({ ingredients: [...draft.ingredients, { itemId: item.id, use: 0.15 }] });
    setAdding('');
  };

  return (
    <Sheet
      title={dish ? 'Edit dish' : 'New dish'}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          {dish && (
            <button
              onClick={() => {
                if (confirm(`Delete ${dish.name}?`)) {
                  store.deleteDish(dish.id);
                  onClose();
                }
              }}
              className="rounded-2xl border border-rose-200 px-4 text-rose-600"
              aria-label="Delete dish"
            >
              <Trash2 size={18} />
            </button>
          )}
          <PrimaryButton
            onClick={() => {
              store.saveDish({ ...draft, name: draft.name.trim() });
              onClose();
            }}
            disabled={!draft.name.trim() || !draft.slots.length}
            className="flex-1"
          >
            Save
          </PrimaryButton>
        </div>
      }
    >
      <Field label="Name">
        <input className={inputCls} value={draft.name} onChange={(e) => set({ name: e.target.value })} autoFocus={!dish} />
      </Field>
      <Field label="Good for">
        <div className="flex gap-1.5">
          {SLOTS.map((s) => (
            <button key={s} onClick={() => set({ slots: toggle(draft.slots, s) })} className={`flex-1 rounded-xl py-2 text-sm font-medium capitalize ${draft.slots.includes(s) ? 'bg-teal-700 text-white' : 'bg-stone-100 text-stone-600'}`}>
              {s}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Cooking time (minutes)">
        <input className={inputCls} inputMode="numeric" value={draft.cookMinutes} onChange={(e) => set({ cookMinutes: Number(e.target.value.replace(/\D/g, '')) || 0 })} />
      </Field>
      <Field label="Type" hint="Used to keep meals varied and to respect veg days.">
        <div className="flex flex-wrap gap-1.5">
          {TAG_CHOICES.map((t) => (
            <button key={t} onClick={() => set({ tags: toggle(draft.tags, t) })} className={`rounded-full px-3 py-1 text-sm ${draft.tags.includes(t) ? 'bg-teal-700 text-white' : 'bg-stone-100 text-stone-600'}`}>
              {t}
            </button>
          ))}
        </div>
      </Field>

      <div className="mb-4">
        <p className="mb-1.5 text-sm font-medium text-stone-700">Ingredients</p>
        <p className="mb-2 text-xs text-stone-500">How much of what you keep at home one meal uses. Optional ones never block a suggestion.</p>
        <div className="space-y-2">
          {draft.ingredients.map((ing, n) => {
            const item = items.find((i) => i.id === ing.itemId);
            if (!item) return null;
            const amt = nearestAmount(ing.use);
            const update = (patch: Partial<typeof ing>) => set({ ingredients: draft.ingredients.map((x, i) => (i === n ? { ...x, ...patch } : x)) });
            return (
              <div key={ing.itemId} className="rounded-xl bg-stone-50 p-2.5">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-sm font-medium">
                    {item.name} <span className="font-normal text-stone-500">of {item.packLabel}</span>
                  </span>
                  <button onClick={() => set({ ingredients: draft.ingredients.filter((_, i) => i !== n) })} className="p-1 text-stone-400" aria-label={`Remove ${item.name}`}>
                    <X size={16} />
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  {AMOUNTS.map((a) => (
                    <button key={a.label} onClick={() => update({ use: a.value })} className={`rounded-lg px-2 py-1 text-xs ${amt.label === a.label ? 'bg-stone-800 text-white' : 'bg-white text-stone-600 ring-1 ring-stone-200'}`}>
                      {a.label}
                    </button>
                  ))}
                  <button onClick={() => update({ optional: !ing.optional })} className={`ml-auto rounded-lg px-2 py-1 text-xs ${ing.optional ? 'bg-violet-100 text-violet-800' : 'text-stone-500'}`}>
                    {ing.optional ? 'Optional' : 'Needed'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-2">
          <input
            className={inputCls}
            list="hm-dish-items"
            placeholder="Add an ingredient"
            value={adding}
            onChange={(e) => {
              setAdding(e.target.value);
              if (items.some((i) => i.name.toLowerCase() === e.target.value.toLowerCase())) addIngredient(e.target.value);
            }}
          />
          <datalist id="hm-dish-items">
            {items.map((i) => (
              <option key={i.id} value={i.name} />
            ))}
          </datalist>
          <p className="mt-1 text-xs text-stone-500">Not in the list? Add it in the Pantry tab first.</p>
        </div>
      </div>
      <Toggle on={draft.active} onChange={(v) => set({ active: v })} label="In rotation (suggest it)" />
    </Sheet>
  );
}
