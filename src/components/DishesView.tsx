import { Plus, Search, Star } from 'lucide-react';
import { useMemo, useState } from 'react';
import { friendlyDate } from '../lib/dates';
import { lastCooked } from '../lib/suggest';
import { useStore } from '../store/store';
import type { Dish } from '../types';
import { DishSheet } from './DishSheet';
import { inputCls, Segmented } from './ui';

export function DishesView() {
  const store = useStore();
  const [q, setQ] = useState('');
  const [show, setShow] = useState<'active' | 'all'>('active');
  const [editing, setEditing] = useState<Dish | 'new' | null>(null);

  const dishes = useMemo(() => {
    const term = q.trim().toLowerCase();
    return store.data.dishes
      .filter((d) => (show === 'all' || d.active) && (!term || d.name.toLowerCase().includes(term)))
      .sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name));
  }, [store.data.dishes, q, show]);

  const activeCount = store.data.dishes.filter((d) => d.active).length;

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">Dishes</h1>
          <p className="text-sm text-stone-500">{activeCount} in rotation</p>
        </div>
        <button onClick={() => setEditing('new')} className="flex items-center gap-1 rounded-xl bg-teal-700 px-3 py-2 text-sm font-semibold text-white">
          <Plus size={16} /> Dish
        </button>
      </header>

      <div className="relative">
        <Search size={18} className="absolute left-3 top-3 text-stone-400" />
        <input className={`${inputCls} pl-10`} placeholder="Search dishes" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <Segmented
        value={show}
        onChange={setShow}
        options={[
          { value: 'active', label: 'In rotation' },
          { value: 'all', label: 'All dishes' },
        ]}
      />

      <div className="divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200">
        {dishes.map((d) => {
          const last = lastCooked(d.id, store.data.meals);
          return (
            <div key={d.id} className="flex items-center gap-2 px-3 py-2.5">
              <button
                onClick={() => store.saveDish({ ...d, favorite: !d.favorite })}
                className={`p-1.5 ${d.favorite ? 'text-amber-500' : 'text-stone-300'}`}
                aria-label={d.favorite ? `Unfavourite ${d.name}` : `Favourite ${d.name}`}
              >
                <Star size={18} fill={d.favorite ? 'currentColor' : 'none'} />
              </button>
              <button onClick={() => setEditing(d)} className="min-w-0 flex-1 text-left">
                <p className={`font-medium ${d.active ? 'text-stone-900' : 'text-stone-400'}`}>{d.name}</p>
                <p className="truncate text-xs text-stone-500">
                  {d.slots.join(', ')} · {d.cookMinutes} min{last ? ` · last ${friendlyDate(last).toLowerCase()}` : ''}
                </p>
              </button>
              <button
                onClick={() => store.saveDish({ ...d, active: !d.active })}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${d.active ? 'bg-teal-50 text-teal-800 ring-1 ring-teal-200' : 'bg-stone-100 text-stone-500'}`}
              >
                {d.active ? 'In rotation' : 'Add'}
              </button>
            </div>
          );
        })}
        {!dishes.length && <p className="px-4 py-6 text-center text-sm text-stone-500">No dishes match.</p>}
      </div>

      {editing && <DishSheet dish={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
