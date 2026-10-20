import { Check, Copy, Plus, RefreshCw, Share2, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { WEEKDAYS } from '../lib/dates';
import { daysUntilWeeklyOrder } from '../lib/pantry';
import { useStore } from '../store/store';
import type { Bucket, ShoppingEntry } from '../types';
import { useToast } from './toast';
import { inputCls, Pill, Segmented } from './ui';

export function ShoppingView() {
  const store = useStore();
  const toast = useToast();
  const [name, setName] = useState('');
  const [bucket, setBucket] = useState<Bucket>('quick');
  const settings = store.data.household.settings;

  const { quick, weekly, bought } = useMemo(() => {
    const sorted = [...store.data.shopping].sort((a, b) => a.name.localeCompare(b.name));
    return {
      quick: sorted.filter((e) => e.status === 'needed' && e.bucket === 'quick'),
      weekly: sorted.filter((e) => e.status === 'needed' && e.bucket === 'weekly'),
      bought: sorted.filter((e) => e.status === 'bought').sort((a, b) => (b.boughtAt ?? '').localeCompare(a.boughtAt ?? '')),
    };
  }, [store.data.shopping]);

  const orderIn = daysUntilWeeklyOrder(settings);
  const orderWhen = orderIn === 0 ? 'today' : orderIn === 1 ? 'tomorrow' : `on ${WEEKDAYS[settings.weeklyOrderDay]}`;

  const add = () => {
    if (!name.trim()) return;
    store.addShopping(name, bucket);
    setName('');
  };

  const listText = () => {
    const line = (e: ShoppingEntry) => `- ${e.name}${e.note ? ` (${e.note})` : ''}`;
    const parts: string[] = [];
    if (quick.length) parts.push(`*Today*\n${quick.map(line).join('\n')}`);
    if (weekly.length) parts.push(`*Weekly order*\n${weekly.map(line).join('\n')}`);
    return `Shopping list\n\n${parts.join('\n\n')}`;
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(listText());
      toast('List copied');
    } catch {
      toast('Could not copy on this device');
    }
  };

  const itemNames = store.data.items.map((i) => i.name);
  const empty = !quick.length && !weekly.length;

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-stone-900">Shopping</h1>
        <button
          onClick={() => {
            store.refreshShopping();
            toast('List checked against the pantry');
          }}
          className="flex items-center gap-1 rounded-xl px-2 py-2 text-sm text-stone-600 hover:bg-stone-100"
        >
          <RefreshCw size={15} /> Refresh
        </button>
      </header>

      <div className="space-y-2 rounded-2xl bg-white p-3 ring-1 ring-stone-200">
        <div className="flex gap-2">
          <input
            className={inputCls}
            list="hm-items"
            placeholder="Add something"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
          />
          <datalist id="hm-items">
            {itemNames.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
          <button onClick={add} className="rounded-xl bg-teal-700 px-3 text-white" aria-label="Add to list">
            <Plus size={20} />
          </button>
        </div>
        <Segmented
          value={bucket}
          onChange={setBucket}
          options={[
            { value: 'quick', label: 'Need today' },
            { value: 'weekly', label: 'Weekly order' },
          ]}
        />
      </div>

      {!empty && (
        <div className="flex gap-2">
          <a
            href={`https://wa.me/?text=${encodeURIComponent(listText())}`}
            target="_blank"
            rel="noreferrer"
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-3 font-semibold text-white"
          >
            <Share2 size={18} /> Send on WhatsApp
          </a>
          <button onClick={copy} className="flex items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 font-medium text-stone-700 ring-1 ring-stone-200">
            <Copy size={18} /> Copy
          </button>
        </div>
      )}

      {empty && (
        <div className="rounded-2xl bg-white p-6 text-center ring-1 ring-stone-200">
          <p className="font-semibold text-stone-800">Nothing to buy right now</p>
          <p className="mt-1 text-sm text-stone-500">Things that run low show up here on their own.</p>
        </div>
      )}

      <ListSection title="Top up today" hint="Quick delivery or the corner shop" entries={quick} />
      <ListSection title="Weekly order" hint={`Next order ${orderWhen}`} entries={weekly} />

      {bought.length > 0 && (
        <section>
          <div className="mb-1.5 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-500">Bought</h2>
            <button onClick={store.clearBought} className="flex items-center gap-1 text-xs text-stone-500">
              <Trash2 size={12} /> Clear
            </button>
          </div>
          <div className="divide-y divide-stone-100 rounded-2xl bg-white ring-1 ring-stone-200">
            {bought.slice(0, 15).map((e) => (
              <button key={e.id} onClick={() => store.unmarkBought(e.id)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-white">
                  <Check size={14} />
                </span>
                <span className="flex-1 text-stone-400 line-through">{e.name}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ListSection({ title, hint, entries }: { title: string; hint: string; entries: ShoppingEntry[] }) {
  const store = useStore();
  const toast = useToast();
  if (!entries.length) return null;
  return (
    <section>
      <div className="mb-1.5 flex items-baseline justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-500">
          {title} · {entries.length}
        </h2>
        <span className="text-xs text-stone-500">{hint}</span>
      </div>
      <div className="divide-y divide-stone-100 rounded-2xl bg-white ring-1 ring-stone-200">
        {entries.map((e) => (
          <div key={e.id} className="flex items-center gap-3 px-4 py-3">
            <button
              onClick={() => {
                store.markBought(e.id);
                toast(`${e.name} bought${e.itemId ? ', pantry restocked' : ''}`, { label: 'Undo', run: () => store.unmarkBought(e.id) });
              }}
              className="h-6 w-6 shrink-0 rounded-full border-2 border-stone-300 hover:border-teal-600"
              aria-label={`Mark ${e.name} bought`}
            />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-stone-900">{e.name}</p>
              {(e.note || e.source === 'auto') && (
                <p className="flex items-center gap-1.5 text-xs text-stone-500">
                  {e.note}
                  {e.source === 'auto' && <Pill tone="violet">running low</Pill>}
                </p>
              )}
            </div>
            <button onClick={() => store.removeShopping(e.id)} className="p-1 text-stone-400" aria-label={`Remove ${e.name}`}>
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
