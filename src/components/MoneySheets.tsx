import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { localDate } from '../lib/dates';
import { uid } from '../lib/id';
import { categoriesFor, formatINR, parseAmount } from '../lib/money';
import { useStore } from '../store/store';
import type { Bill, BillFrequency, Expense } from '../types';
import { useToast } from './toast';
import { ConfirmButton, Field, inputCls, PrimaryButton, Segmented, Sheet } from './ui';

const LAST_PAID_BY = 'homemanager_paid_by';

function lastPaidBy(): string {
  try {
    return localStorage.getItem(LAST_PAID_BY) ?? '';
  } catch {
    return '';
  }
}

export function AmountInput({ value, onChange, autoFocus }: { value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl bg-stone-50 px-4 py-3 ring-1 ring-stone-200 focus-within:ring-2 focus-within:ring-teal-600/40">
      <span className="text-3xl font-semibold text-stone-400">₹</span>
      <input
        id="expense-amount"
        inputMode="decimal"
        autoComplete="off"
        placeholder="0"
        className="w-full bg-transparent text-3xl font-semibold text-stone-900 outline-none"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ''))}
        autoFocus={autoFocus}
      />
    </div>
  );
}

export function CategoryChips({ categories, value, onChange }: { categories: string[]; value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {categories.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={`rounded-full px-3 py-1.5 text-sm ${value === c ? 'bg-teal-700 text-white' : 'bg-stone-100 text-stone-700'}`}
        >
          {c}
        </button>
      ))}
    </div>
  );
}

// Add or edit one expense. Amount + category is all it needs.
export function ExpenseSheet({ expense, defaults, onClose }: { expense: Expense | null; defaults?: Partial<Expense>; onClose: () => void }) {
  const store = useStore();
  const toast = useToast();
  const categories = categoriesFor(store.data.household.settings);
  const [amount, setAmount] = useState(expense ? String(expense.amount) : defaults?.amount ? String(defaults.amount) : '');
  const [category, setCategory] = useState(expense?.category ?? defaults?.category ?? '');
  const [date, setDate] = useState(expense?.date ?? defaults?.date ?? localDate());
  const [note, setNote] = useState(expense?.note ?? defaults?.note ?? '');
  const [paidBy, setPaidBy] = useState(expense?.paidBy ?? lastPaidBy());
  const value = parseAmount(amount);

  const save = () => {
    if (!value || !category) return;
    const row: Expense = {
      id: expense?.id ?? uid(),
      date,
      amount: value,
      category,
      note: note.trim(),
      paidBy: paidBy.trim(),
      billId: expense?.billId ?? defaults?.billId ?? null,
      source: expense?.source ?? defaults?.source ?? 'manual',
      createdAt: expense?.createdAt ?? new Date().toISOString(),
    };
    store.saveExpense(row);
    try {
      localStorage.setItem(LAST_PAID_BY, row.paidBy);
    } catch {
      // only a convenience
    }
    if (expense) toast('Expense updated');
    else toast(`${formatINR(value)} on ${category.toLowerCase()} saved`, { label: 'Undo', run: () => store.deleteExpense(row.id) });
    onClose();
  };

  return (
    <Sheet
      title={expense ? 'Edit expense' : 'Add expense'}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          {expense && (
            <ConfirmButton
              label="Delete expense"
              armedLabel="Tap again to delete"
              onConfirm={() => {
                store.deleteExpense(expense.id);
                onClose();
              }}
              className="rounded-2xl border border-rose-200 px-4 text-rose-600"
            >
              <Trash2 size={18} />
            </ConfirmButton>
          )}
          <PrimaryButton className="flex-1" disabled={!value || !category} onClick={save}>
            {!value ? 'Enter the amount' : !category ? 'Pick a category' : `Save ${formatINR(value)}`}
          </PrimaryButton>
        </div>
      }
    >
      <div className="mb-4">
        <AmountInput value={amount} onChange={setAmount} autoFocus={!expense} />
      </div>
      <div className="mb-4">
        <CategoryChips categories={categories.includes(category) || !category ? categories : [...categories, category]} value={category} onChange={setCategory} />
      </div>
      <Field label="What for (optional)">
        <input id="expense-note" className={inputCls} placeholder="e.g. Electricity bill, Swiggy" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date">
          <input id="expense-date" type="date" className={inputCls} value={date} max={localDate()} onChange={(e) => setDate(e.target.value || localDate())} />
        </Field>
        <Field label="Paid by (optional)">
          <input id="expense-paid-by" className={inputCls} placeholder="Name" value={paidBy} onChange={(e) => setPaidBy(e.target.value)} />
        </Field>
      </div>
    </Sheet>
  );
}

const FREQUENCIES: { value: BillFrequency; label: string }[] = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Every 3 months' },
  { value: 'yearly', label: 'Yearly' },
];

export function BillSheet({ bill, onClose }: { bill: Bill | null; onClose: () => void }) {
  const store = useStore();
  const categories = categoriesFor(store.data.household.settings);
  const [draft, setDraft] = useState<Bill>(
    bill ?? { id: uid(), name: '', category: 'Utilities', amount: 0, frequency: 'monthly', nextDue: localDate(), remindDays: 3, lastPaid: null, active: true, notes: '' },
  );
  const [amount, setAmount] = useState(bill?.amount ? String(bill.amount) : '');
  const set = (patch: Partial<Bill>) => setDraft((d) => ({ ...d, ...patch }));

  return (
    <Sheet
      title={bill ? draft.name || 'Edit bill' : 'New recurring bill'}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          {bill && (
            <ConfirmButton
              label="Delete bill"
              armedLabel="Tap again to delete"
              onConfirm={() => {
                store.deleteBill(bill.id);
                onClose();
              }}
              className="rounded-2xl border border-rose-200 px-4 text-rose-600"
            >
              <Trash2 size={18} />
            </ConfirmButton>
          )}
          <PrimaryButton
            className="flex-1"
            disabled={!draft.name.trim() || !draft.nextDue}
            onClick={() => {
              store.saveBill({ ...draft, name: draft.name.trim(), amount: parseAmount(amount) ?? 0 });
              onClose();
            }}
          >
            Save
          </PrimaryButton>
        </div>
      }
    >
      <Field label="Name">
        <input id="bill-name" className={inputCls} placeholder="Rent, Electricity, Maid salary, Internet…" value={draft.name} onChange={(e) => set({ name: e.target.value })} autoFocus={!bill} />
      </Field>
      <Field label="Usual amount (optional)">
        <AmountInput value={amount} onChange={setAmount} />
      </Field>
      <Field label="Category">
        <CategoryChips categories={categories} value={draft.category} onChange={(category) => set({ category })} />
      </Field>
      <Field label="How often">
        <Segmented value={draft.frequency} onChange={(frequency) => set({ frequency })} options={FREQUENCIES} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Next due">
          <input id="bill-due" type="date" className={inputCls} value={draft.nextDue} onChange={(e) => set({ nextDue: e.target.value })} />
        </Field>
        <Field label="Remind days before">
          <input id="bill-remind" className={inputCls} inputMode="numeric" value={draft.remindDays} onChange={(e) => set({ remindDays: Number(e.target.value.replace(/\D/g, '')) || 0 })} />
        </Field>
      </div>
    </Sheet>
  );
}

// "Paid": confirm the amount (defaults to the usual one), logs it and moves the due date on.
export function PayBillSheet({ bill, onClose }: { bill: Bill; onClose: () => void }) {
  const store = useStore();
  const toast = useToast();
  const [amount, setAmount] = useState(bill.amount ? String(bill.amount) : '');
  const [date, setDate] = useState(localDate());
  const value = parseAmount(amount);
  return (
    <Sheet
      title={`Paid ${bill.name.toLowerCase()}`}
      onClose={onClose}
      footer={
        <PrimaryButton
          className="w-full"
          disabled={!value}
          onClick={() => {
            if (!value) return;
            const before = bill;
            const expenseId = store.payBill(bill.id, value, date);
            onClose();
            toast(`${bill.name} paid: ${formatINR(value)}`, expenseId ? { label: 'Undo', run: () => store.unpayBill(before, expenseId) } : undefined);
          }}
        >
          {value ? `Mark paid · ${formatINR(value)}` : 'Enter the amount'}
        </PrimaryButton>
      }
    >
      <div className="mb-4">
        <AmountInput value={amount} onChange={setAmount} autoFocus />
      </div>
      <Field label="Paid on">
        <input id="bill-paid-on" type="date" className={inputCls} value={date} max={localDate()} onChange={(e) => setDate(e.target.value || localDate())} />
      </Field>
    </Sheet>
  );
}
