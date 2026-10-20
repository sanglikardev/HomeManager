import { ChevronDown, Pencil, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { confidence, effectiveLevel, levelName, LOW_AT, probablySpoiled, useSoon } from '../lib/pantry';
import { useStore } from '../store/store';
import { CATEGORIES, type Item } from '../types';
import { ItemSheet } from './ItemSheet';
import { inputCls, LevelDot, LevelPicker, Pill } from './ui';

type Filter = 'all' | 'low' | 'soon' | 'unsure';

export function PantryView() {
  const store = useStore();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<Item | 'new' | null>(null);
  const now = useMemo(() => new Date(), [store.data]);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return store.data.items
      .filter((i) => !term || i.name.toLowerCase().includes(term))
      .filter((i) => {
        if (filter === 'low') return effectiveLevel(i, now) < LOW_AT;
        if (filter === 'soon') return useSoon(i, now) || probablySpoiled(i, now);
        if (filter === 'unsure') return confidence(i, now) < 0.35 && effectiveLevel(i, now) >= 0.08;
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [store.data.items, q, filter, now]);

  const groups = CATEGORIES.map((c) => ({ category: c, items: rows.filter((i) => i.category === c) })).filter((g) => g.items.length);
  const counts = {
    low: store.data.items.filter((i) => effectiveLevel(i, now) < LOW_AT).length,
    soon: store.data.items.filter((i) => useSoon(i, now) || probablySpoiled(i, now)).length,
  };

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-stone-900">Pantry</h1>
        <button onClick={() => setEditing('new')} className="flex items-center gap-1 rounded-xl bg-teal-700 px-3 py-2 text-sm font-semibold text-white">
          <Plus size={16} /> Item
        </button>
      </header>

      <div className="relative">
        <Search size={18} className="absolute left-3 top-3 text-stone-400" />
        <input className={`${inputCls} pl-10`} placeholder="Search the pantry" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {(
          [
            ['all', 'All'],
            ['low', `Running low${counts.low ? ` (${counts.low})` : ''}`],
            ['soon', `Use soon${counts.soon ? ` (${counts.soon})` : ''}`],
            ['unsure', 'Not sure'],
          ] as [Filter, string][]
        ).map(([f, label]) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium ${filter === f ? 'bg-stone-900 text-white' : 'bg-white text-stone-600 ring-1 ring-stone-200'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {groups.map((g) => (
        <section key={g.category}>
          <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-stone-500">{g.category}</h2>
          <div className="divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200">
            {g.items.map((item) => {
              const eff = effectiveLevel(item, now);
              const unsure = confidence(item, now) < 0.35;
              const isOpen = open === item.id;
              return (
                <div key={item.id}>
                  <button onClick={() => setOpen(isOpen ? null : item.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                    <LevelDot level={eff} />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-stone-900">{item.name}</p>
                      <p className="flex flex-wrap items-center gap-1.5 text-xs text-stone-500">
                        <span>
                          {levelName(eff)}
                          {unsure ? '?' : ''} · {item.packLabel}
                        </span>
                        {probablySpoiled(item, now) ? <Pill tone="rose">May have spoiled</Pill> : useSoon(item, now) && <Pill tone="amber">Use soon</Pill>}
                        {item.essential && <Pill tone="sky">Always keep</Pill>}
                      </p>
                    </div>
                    <ChevronDown size={18} className={`text-stone-400 transition ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {isOpen && (
                    <div className="space-y-2 bg-stone-50 px-4 pb-3 pt-1">
                      <LevelPicker value={eff} unsure={unsure} onPick={(v) => store.setItemLevel(item.id, v, 'manual')} />
                      <div className="flex items-center justify-between">
                        <button onClick={() => store.setItemLevel(item.id, 1, 'purchase')} className="text-sm font-medium text-teal-700">
                          Just bought it
                        </button>
                        <button onClick={() => setEditing(item)} className="flex items-center gap-1 text-sm text-stone-600">
                          <Pencil size={14} /> Edit item
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
      {!groups.length && <p className="py-8 text-center text-sm text-stone-500">Nothing here.</p>}

      {editing && <ItemSheet item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
