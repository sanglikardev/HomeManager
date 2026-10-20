import { Check, Copy, Plus, RefreshCw, Share2, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { newItem } from '../data/seed';
import { TAB_STARTERS } from '../data/seedItems';
import { WEEKDAYS } from '../lib/dates';
import { daysUntilWeeklyOrder } from '../lib/pantry';
import { SHELF_TABS, shelfGroups, type ShopTab } from '../lib/shopTabs';
import { useStore } from '../store/store';
import { CATEGORIES, type Bucket, type Item, type ShoppingEntry } from '../types';
import { useToast } from './toast';
import { inputCls, Pill, Segmented } from './ui';

export function ShoppingView() {
  const store = useStore();
  const toast = useToast();
  const [name, setName] = useState('');
  const [bucket, setBucket] = useState<Bucket>('quick');
  const settings = store.data.household.settings;
  const [tab, setTab] = useState<ShopTab>('buy');

  // Households set up before the Washroom and Sink shelves existed get the starter items once.
  const hasWashroom = store.data.items.some((i) => i.category === 'Bathroom & Personal care');
  useEffect(() => {
    if (hasWashroom) return;
    const have = new Set(store.data.items.map((i) => i.name.toLowerCase()));
    const iso = new Date().toISOString();
    const fresh = TAB_STARTERS.filter((s) => !have.has(s.name.toLowerCase())).map((s) => newItem(s, iso, 1));
    if (fresh.length) store.saveItems(fresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasWashroom]);

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

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {[{ value: 'buy' as ShopTab, label: `Buy list${quick.length + weekly.length ? ` (${quick.length + weekly.length})` : ''}` }, ...SHELF_TABS].map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium ${tab === t.value ? 'bg-stone-900 text-white' : 'bg-white text-stone-600 ring-1 ring-stone-200'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab !== 'buy' && <Shelf tab={tab} items={store.data.items} needed={[...quick, ...weekly]} />}

      {tab === 'buy' && (<>
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
      </>)}
    </div>
  );
}

// One shelf tab: tap an item to put it on the Buy list, tap again to take it off.
function Shelf({ tab, items, needed }: { tab: Exclude<ShopTab, 'buy'>; items: Item[]; needed: ShoppingEntry[] }) {
  const store = useStore();
  const onList = new Map(needed.map((e) => [e.itemId ?? e.name.toLowerCase(), e]));
  const groups = shelfGroups(items, tab, CATEGORIES);
  if (!groups.length) return <p className="rounded-2xl bg-white p-6 text-center text-sm text-stone-500 ring-1 ring-stone-200">Nothing here yet. Add items from the Pantry.</p>;
  return (
    <>
      {groups.map((g) => (
        <section key={g.category}>
          <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-stone-500">{g.category}</h2>
          <div className="divide-y divide-stone-100 rounded-2xl bg-white ring-1 ring-stone-200">
            {g.items.map((i) => {
              const entry = onList.get(i.id) ?? onList.get(i.name.toLowerCase());
              return (
                <button
                  key={i.id}
                  onClick={() => (entry ? entry.source === 'manual' && store.removeShopping(entry.id) : store.addShopping(i.name, i.bucket))}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left"
                  aria-pressed={!!entry}
                >
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${entry ? 'border-teal-700 bg-teal-700 text-white' : 'border-stone-300'}`}>
                    {entry && <Check size={14} />}
                  </span>
                  <span className="flex-1 font-medium text-stone-900">{i.name}</span>
                  <span className="text-xs text-stone-500">{entry ? 'On the buy list' : i.packLabel}</span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </>
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
