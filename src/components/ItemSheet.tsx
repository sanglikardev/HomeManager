import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { uid } from '../lib/id';
import { useStore } from '../store/store';
import { CATEGORIES, type Category, type Item } from '../types';
import { ConfirmButton, Field, inputCls, PrimaryButton, Segmented, Sheet, Toggle } from './ui';

// Daily use presets, in plain words. Values are the share of a full pack per day.
const USE_PRESETS: { label: string; value: number }[] = [
  { label: 'Only in meals', value: 0 },
  { label: 'Lasts ~2 days', value: 0.4 },
  { label: '~1 week', value: 0.12 },
  { label: '~2 weeks', value: 0.06 },
  { label: '~1 month', value: 0.03 },
];

export function ItemSheet({ item, onClose }: { item: Item | null; onClose: () => void }) {
  const store = useStore();
  const [draft, setDraft] = useState<Item>(
    item ?? {
      id: uid(),
      name: '',
      category: 'Vegetables',
      packLabel: '',
      bucket: 'quick',
      essential: false,
      shelfLifeDays: null,
      dailyUse: 0,
      level: 1,
      levelAt: new Date().toISOString(),
      confirmedAt: new Date().toISOString(),
      purchasedAt: new Date().toISOString(),
      askedAt: null,
    },
  );
  const set = (patch: Partial<Item>) => setDraft((d) => ({ ...d, ...patch }));
  const usedIn = item ? store.data.dishes.filter((d) => d.ingredients.some((i) => i.itemId === item.id)).length : 0;
  const preset = USE_PRESETS.reduce((best, p) => (Math.abs(p.value - draft.dailyUse) < Math.abs(best.value - draft.dailyUse) ? p : best));

  const save = () => {
    store.saveItem({ ...draft, name: draft.name.trim() });
    onClose();
  };

  return (
    <Sheet
      title={item ? 'Edit item' : 'New item'}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          {item && (
            <ConfirmButton
              label="Delete item"
              armedLabel={usedIn ? `Remove from ${usedIn} dishes too?` : 'Tap again to remove'}
              onConfirm={() => {
                store.deleteItem(item.id);
                onClose();
              }}
              className="rounded-2xl border border-rose-200 px-4 text-rose-600"
            >
              <Trash2 size={18} />
            </ConfirmButton>
          )}
          <PrimaryButton onClick={save} disabled={!draft.name.trim()} className="flex-1">
            Save
          </PrimaryButton>
        </div>
      }
    >
      <Field label="Name">
        <input className={inputCls} value={draft.name} onChange={(e) => set({ name: e.target.value })} autoFocus={!item} />
      </Field>
      <Field label="Category">
        <select className={inputCls} value={draft.category} onChange={(e) => set({ category: e.target.value as Category })}>
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </Field>
      <Field label="What counts as full?" hint="The amount you usually buy, like 1 kg or 2 L.">
        <input className={inputCls} value={draft.packLabel} onChange={(e) => set({ packLabel: e.target.value })} />
      </Field>
      <Field label="Usually bought">
        <Segmented
          value={draft.bucket}
          onChange={(v) => set({ bucket: v })}
          options={[
            { value: 'quick', label: 'Same day (quick)' },
            { value: 'weekly', label: 'Weekly order' },
          ]}
        />
      </Field>
      <Field label="Goes bad after" hint="Leave empty for things that keep for months.">
        <div className="flex items-center gap-2">
          <input
            className={inputCls}
            inputMode="numeric"
            value={draft.shelfLifeDays ?? ''}
            onChange={(e) => set({ shelfLifeDays: e.target.value ? Math.max(1, Number(e.target.value.replace(/\D/g, ''))) : null })}
          />
          <span className="text-sm text-stone-500">days</span>
        </div>
      </Field>
      <Field label="Used up on its own (outside meals)" hint="Milk in tea, fruit, bread. The app fine-tunes this from your answers.">
        <div className="flex flex-wrap gap-1.5">
          {USE_PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => set({ dailyUse: p.value })}
              className={`rounded-full px-3 py-1.5 text-sm ${preset.label === p.label ? 'bg-teal-700 text-white' : 'bg-stone-100 text-stone-700'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </Field>
      <Toggle on={draft.essential} onChange={(v) => set({ essential: v })} label="Always keep in stock (reorder early)" />
      {usedIn > 0 && <p className="mt-3 text-xs text-stone-500">Used in {usedIn} dishes.</p>}
    </Sheet>
  );
}
