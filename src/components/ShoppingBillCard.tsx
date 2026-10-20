import { Receipt } from 'lucide-react';
import { useMemo, useState } from 'react';
import { localDate } from '../lib/dates';
import { uid } from '../lib/id';
import { formatINR, parseAmount } from '../lib/money';
import { useStore } from '../store/store';
import { useToast } from './toast';

const SKIPPED_KEY = 'homemanager_bill_skipped_at';

function skippedAt(): string {
  try {
    return localStorage.getItem(SKIPPED_KEY) ?? '';
  } catch {
    return '';
  }
}

// After items are ticked off as bought: "How much was the bill?", saved as a Groceries expense.
export function ShoppingBillCard() {
  const store = useStore();
  const toast = useToast();
  const [amount, setAmount] = useState('');
  const [skipped, setSkipped] = useState(skippedAt);
  const { shopping, expenses } = store.data;

  const unlogged = useMemo(() => {
    const lastLogged = expenses.filter((e) => e.source === 'shopping').reduce((m, e) => (e.createdAt > m ? e.createdAt : m), '');
    const since = [lastLogged, skipped, new Date(Date.now() - 2 * 86400000).toISOString()].reduce((a, b) => (a > b ? a : b));
    return shopping.filter((e) => e.status === 'bought' && e.boughtAt && e.boughtAt > since);
  }, [shopping, expenses, skipped]);

  if (!unlogged.length) return null;
  const value = parseAmount(amount);
  const names = unlogged.map((e) => e.name);
  const note = `Shopping: ${names.slice(0, 4).join(', ')}${names.length > 4 ? ` +${names.length - 4} more` : ''}`;

  const save = () => {
    if (!value) return;
    const id = uid();
    store.saveExpense({ id, date: localDate(), amount: value, category: 'Groceries', note, paidBy: '', billId: null, source: 'shopping', createdAt: new Date().toISOString() });
    setAmount('');
    toast(`${formatINR(value)} on groceries saved`, { label: 'Undo', run: () => store.deleteExpense(id) });
  };

  const skip = () => {
    const now = new Date().toISOString();
    try {
      localStorage.setItem(SKIPPED_KEY, now);
    } catch {
      // the card just comes back next time
    }
    setSkipped(now);
  };

  return (
    <section className="rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
      <p className="flex items-center gap-2 font-semibold text-amber-900">
        <Receipt size={18} /> How much was the bill?
      </p>
      <p className="mb-3 text-sm text-amber-800">
        For the {unlogged.length} thing{unlogged.length === 1 ? '' : 's'} you ticked off ({names.slice(0, 3).join(', ')}
        {names.length > 3 ? '…' : ''}).
      </p>
      <div className="flex gap-2">
        <div className="flex flex-1 items-center gap-1 rounded-xl bg-white px-3 ring-1 ring-amber-200">
          <span className="text-stone-400">₹</span>
          <input
            id="shopping-bill"
            inputMode="decimal"
            className="w-full bg-transparent py-2.5 text-base outline-none"
            placeholder="Amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))}
            onKeyDown={(e) => e.key === 'Enter' && save()}
          />
        </div>
        <button onClick={save} disabled={!value} className="rounded-xl bg-teal-700 px-4 font-semibold text-white disabled:opacity-40">
          Save
        </button>
      </div>
      <button onClick={skip} className="mt-2 text-sm text-amber-800">
        Skip
      </button>
    </section>
  );
}
