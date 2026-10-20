import { ChevronLeft, ChevronRight, Plus, Receipt, Repeat, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { friendlyDate, localDate } from '../lib/dates';
import { billDueLabel, billStatus, categoriesFor, changePct, formatINR, monthLabel, monthOf, shiftMonth, summarize } from '../lib/money';
import { useStore } from '../store/store';
import type { Bill, Expense } from '../types';
import { BillSheet, ExpenseSheet, PayBillSheet } from './MoneySheets';
import { inputCls, Sheet } from './ui';

const BILL_STYLE = {
  overdue: 'text-rose-700',
  soon: 'text-amber-700',
  ok: 'text-stone-500',
};

export function MoneyView() {
  const store = useStore();
  const today = localDate();
  const [month, setMonth] = useState(monthOf(today));
  const [editing, setEditing] = useState<Expense | 'new' | null>(null);
  const [billEditing, setBillEditing] = useState<Bill | 'new' | null>(null);
  const [paying, setPaying] = useState<Bill | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [editCats, setEditCats] = useState(false);

  const { expenses, bills } = store.data;
  const summary = useMemo(() => summarize(expenses, month), [expenses, month]);
  const prev = useMemo(() => summarize(expenses, shiftMonth(month, -1)), [expenses, month]);
  const change = changePct(summary.total, prev.total);
  const activeBills = useMemo(() => bills.filter((b) => b.active).sort((a, b) => a.nextDue.localeCompare(b.nextDue)), [bills]);
  const isCurrent = month === monthOf(today);
  const maxCat = summary.byCategory[0]?.total ?? 0;
  const list = showAll ? summary.expenses : summary.expenses.slice(0, 10);

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-stone-900">Money</h1>
        <button onClick={() => setEditing('new')} className="flex items-center gap-1 rounded-xl bg-teal-700 px-3 py-2 text-sm font-semibold text-white">
          <Plus size={16} /> Expense
        </button>
      </header>

      <section className="rounded-3xl bg-gradient-to-br from-teal-700 to-teal-600 px-5 py-4 text-white">
        <div className="flex items-center justify-between">
          <button onClick={() => setMonth((m) => shiftMonth(m, -1))} aria-label="Previous month" className="rounded-lg p-1 hover:bg-white/10">
            <ChevronLeft size={20} />
          </button>
          <p className="text-sm font-medium text-teal-100">{monthLabel(month)}</p>
          <button onClick={() => setMonth((m) => shiftMonth(m, 1))} disabled={isCurrent} aria-label="Next month" className="rounded-lg p-1 hover:bg-white/10 disabled:opacity-30">
            <ChevronRight size={20} />
          </button>
        </div>
        <p className="mt-2 text-center text-4xl font-bold">{formatINR(summary.total)}</p>
        <p className="mt-1 text-center text-sm text-teal-100">
          {summary.count} expense{summary.count === 1 ? '' : 's'}
          {change !== null && ` · ${change > 0 ? '▲' : change < 0 ? '▼' : ''} ${Math.abs(change)}% vs ${monthLabel(shiftMonth(month, -1)).split(' ')[0]} (${formatINR(prev.total)})`}
        </p>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Recurring bills</h2>
          <button onClick={() => setBillEditing('new')} className="flex items-center gap-1 text-sm font-medium text-teal-700">
            <Plus size={14} /> Add bill
          </button>
        </div>
        {activeBills.length ? (
          <div className="divide-y divide-stone-100 rounded-2xl bg-white ring-1 ring-stone-200">
            {activeBills.map((b) => {
              const status = billStatus(b, today);
              return (
                <div key={b.id} className="flex items-center gap-3 px-4 py-3">
                  <button onClick={() => setBillEditing(b)} className="min-w-0 flex-1 text-left">
                    <p className="font-medium text-stone-900">
                      {b.name}
                      {b.amount > 0 && <span className="font-normal text-stone-500"> · {formatINR(b.amount)}</span>}
                    </p>
                    <p className={`text-xs ${BILL_STYLE[status]}`}>
                      {status === 'ok' ? `Next ${friendlyDate(b.nextDue).toLowerCase()}` : billDueLabel(b, today)}
                    </p>
                  </button>
                  <button
                    onClick={() => setPaying(b)}
                    className={`rounded-xl px-3 py-2 text-sm font-semibold ${status === 'ok' ? 'bg-stone-100 text-stone-700' : 'bg-teal-700 text-white'}`}
                  >
                    Paid
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <button onClick={() => setBillEditing('new')} className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-stone-300 p-4 text-left text-sm text-stone-600">
            <Repeat size={18} className="text-stone-400" />
            Add rent, electricity, maid salary, internet or school fees once. You get a reminder before each is due.
          </button>
        )}
      </section>

      {summary.byCategory.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-500">Where it went</h2>
          <div className="space-y-2.5 rounded-2xl bg-white p-4 ring-1 ring-stone-200">
            {summary.byCategory.map((c) => (
              <div key={c.category}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="text-stone-800">{c.category}</span>
                  <span className="font-medium text-stone-900">
                    {formatINR(c.total)} <span className="font-normal text-stone-400">· {Math.round((c.total / summary.total) * 100)}%</span>
                  </span>
                </div>
                <div className="h-2 rounded-full bg-stone-100">
                  <div className="h-2 rounded-full bg-teal-600" style={{ width: `${Math.max(2, (c.total / maxCat) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {summary.top.length > 1 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-500">Biggest expenses</h2>
          <ExpenseList expenses={summary.top} today={today} onOpen={setEditing} />
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-500">All expenses</h2>
        {summary.expenses.length ? (
          <>
            <ExpenseList expenses={list} today={today} onOpen={setEditing} />
            {summary.expenses.length > list.length && (
              <button onClick={() => setShowAll(true)} className="mt-2 w-full text-center text-sm font-medium text-teal-700">
                Show all {summary.expenses.length}
              </button>
            )}
          </>
        ) : (
          <div className="rounded-2xl bg-white p-6 text-center ring-1 ring-stone-200">
            <Receipt className="mx-auto mb-2 text-teal-700" />
            <p className="font-semibold text-stone-800">Nothing logged {isCurrent ? 'this month yet' : 'this month'}</p>
            <p className="mt-1 text-sm text-stone-500">Tap + or "Expense" above. Amount and category is all it needs.</p>
          </div>
        )}
      </section>

      <button onClick={() => setEditCats(true)} className="w-full text-center text-sm text-stone-500">
        Edit categories
      </button>

      {editCats && <CategoriesSheet onClose={() => setEditCats(false)} />}
      {editing && <ExpenseSheet expense={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {billEditing && <BillSheet bill={billEditing === 'new' ? null : billEditing} onClose={() => setBillEditing(null)} />}
      {paying && <PayBillSheet bill={paying} onClose={() => setPaying(null)} />}
    </div>
  );
}

function ExpenseList({ expenses, today, onOpen }: { expenses: Expense[]; today: string; onOpen: (e: Expense) => void }) {
  return (
    <div className="divide-y divide-stone-100 rounded-2xl bg-white ring-1 ring-stone-200">
      {expenses.map((e) => (
        <button key={e.id} onClick={() => onOpen(e)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-stone-900">{e.note || e.category}</p>
            <p className="text-xs text-stone-500">
              {friendlyDate(e.date, today)}
              {e.note ? ` · ${e.category}` : ''}
              {e.paidBy ? ` · ${e.paidBy}` : ''}
            </p>
          </div>
          <span className="font-semibold text-stone-900">{formatINR(e.amount)}</span>
        </button>
      ))}
    </div>
  );
}

function CategoriesSheet({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const categories = categoriesFor(store.data.household.settings);
  const [name, setName] = useState('');
  const save = (list: string[]) => store.updateHousehold({ settings: { expenseCategories: list } });
  const add = () => {
    const n = name.trim();
    if (!n || categories.some((c) => c.toLowerCase() === n.toLowerCase())) return;
    save([...categories, n]);
    setName('');
  };
  return (
    <Sheet title="Expense categories" onClose={onClose}>
      <div className="mb-3 divide-y divide-stone-100 rounded-2xl bg-white ring-1 ring-stone-200">
        {categories.map((c) => (
          <div key={c} className="flex items-center justify-between px-4 py-2.5">
            <span className="text-stone-800">{c}</span>
            {categories.length > 1 && (
              <button onClick={() => save(categories.filter((x) => x !== c))} className="p-1 text-stone-400" aria-label={`Remove ${c}`}>
                <X size={16} />
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input id="new-category" className={inputCls} placeholder="New category" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button onClick={add} className="rounded-xl bg-teal-700 px-3 text-white" aria-label="Add category">
          <Plus size={18} />
        </button>
      </div>
      <p className="mt-2 text-xs text-stone-500">Removing a category keeps past expenses as they are.</p>
    </Sheet>
  );
}
