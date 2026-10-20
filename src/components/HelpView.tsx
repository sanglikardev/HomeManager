import { ChevronDown, ChevronLeft, ChevronRight, HandCoins, Pencil, Phone, Plus, Trash2, UserRound } from 'lucide-react';
import { useState } from 'react';
import { monthGrid } from '../lib/calendar';
import { localDate, parseLocalDate, WEEKDAYS, WEEKDAYS_SHORT } from '../lib/dates';
import { uid } from '../lib/id';
import { formatINR, monthLabel, monthOf, parseAmount, shiftMonth } from '../lib/money';
import { cycleLeave, daysInMonth, giveAdvance, isWeeklyOff, paymentFor, payStaff, salaryFor, unpayStaff } from '../lib/staff';
import { useStore } from '../store/store';
import type { Staff } from '../types';
import { AmountInput } from './MoneySheets';
import { useToast } from './toast';
import { ConfirmButton, Field, inputCls, PrimaryButton, Sheet, Toggle } from './ui';

const ROLES = ['Cook', 'Cleaning', 'Driver', 'Nanny', 'Gardener', 'Security'];
const MON_FIRST = [1, 2, 3, 4, 5, 6, 0];

export function HelpView() {
  const store = useStore();
  const today = localDate();
  const [month, setMonth] = useState(monthOf(today));
  const [editing, setEditing] = useState<Staff | 'new' | null>(null);
  const staff = store.data.staff.filter((s) => s.active);
  const inactive = store.data.staff.filter((s) => !s.active);
  const [showOld, setShowOld] = useState(false);

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-stone-900">Household help</h1>
        <button onClick={() => setEditing('new')} className="flex items-center gap-1 rounded-xl bg-teal-700 px-3 py-2 text-sm font-semibold text-white">
          <Plus size={16} /> Person
        </button>
      </header>

      {!staff.length ? (
        <button onClick={() => setEditing('new')} className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-stone-300 p-4 text-left text-sm text-stone-600">
          <UserRound size={20} className="shrink-0 text-teal-700" />
          Add your cook, cleaner or driver. You only mark the days they take off (full or half day), and the month's salary works itself out.
        </button>
      ) : (
        <>
          <div className="flex items-center justify-between rounded-2xl bg-white px-2 py-1 ring-1 ring-stone-200">
            <button onClick={() => setMonth((m) => shiftMonth(m, -1))} aria-label="Previous month" className="rounded-lg p-2 text-stone-600">
              <ChevronLeft size={20} />
            </button>
            <p className="font-medium text-stone-800">{monthLabel(month)}</p>
            <button onClick={() => setMonth((m) => shiftMonth(m, 1))} disabled={month >= monthOf(today)} aria-label="Next month" className="rounded-lg p-2 text-stone-600 disabled:opacity-30">
              <ChevronRight size={20} />
            </button>
          </div>
          {staff.map((s) => (
            <StaffCard key={s.id} staff={s} month={month} today={today} startOpen={staff.length === 1} onEdit={() => setEditing(s)} />
          ))}
          <p className="text-center text-xs text-stone-500">Tap a day once for a day off, twice for a half day, three times to clear it.</p>
        </>
      )}

      {inactive.length > 0 && (
        <section>
          <button onClick={() => setShowOld((v) => !v)} className="text-sm font-medium text-stone-500">
            {showOld ? 'Hide' : 'Show'} people who left ({inactive.length})
          </button>
          {showOld && (
            <div className="mt-2 space-y-2">
              {inactive.map((s) => (
                <button key={s.id} onClick={() => setEditing(s)} className="flex w-full justify-between rounded-xl bg-white px-4 py-3 text-left text-sm ring-1 ring-stone-200">
                  <span className="text-stone-700">{s.name}</span>
                  <span className="text-stone-400">{s.role}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {editing && <StaffSheet staff={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function StaffCard({ staff, month, today, startOpen, onEdit }: { staff: Staff; month: string; today: string; startOpen: boolean; onEdit: () => void }) {
  const store = useStore();
  const toast = useToast();
  const [open, setOpen] = useState(startOpen);
  const [paying, setPaying] = useState(false);
  const [advance, setAdvance] = useState(false);
  const calc = salaryFor(staff, month);
  const paid = paymentFor(staff, month);
  const [y, m] = month.split('-').map(Number);
  const grid = monthGrid(y, m - 1);

  const unpay = () => {
    const { staff: next, expenseId } = unpayStaff(staff, month);
    store.saveStaff(next, [], expenseId ? [expenseId] : []);
    toast('Payment removed');
  };

  return (
    <section className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-stone-200">
      <div className="flex items-start gap-3 px-4 pt-4">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-stone-900">
            {staff.name}
            {staff.role && <span className="font-normal text-stone-500"> · {staff.role}</span>}
          </p>
          <p className="text-sm text-stone-600">
            {calc.leaveDays ? `${calc.leaveDays} day${calc.leaveDays === 1 ? '' : 's'} off` : 'No days off'}
            {calc.deduction > 0 && ` · ${formatINR(calc.deduction)} cut`}
            {calc.advances > 0 && ` · ${formatINR(calc.advances)} advance`}
          </p>
        </div>
        {staff.phone && (
          <a href={`tel:${staff.phone}`} aria-label={`Call ${staff.name}`} className="rounded-xl p-2 text-teal-700">
            <Phone size={18} />
          </a>
        )}
        <button onClick={onEdit} aria-label={`Edit ${staff.name}`} className="rounded-xl p-2 text-stone-500">
          <Pencil size={18} />
        </button>
      </div>

      <div className="flex items-center gap-2 px-4 py-3">
        {paid ? (
          <div className="flex flex-1 items-center justify-between rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            <span>Paid {formatINR(paid.amount)}</span>
            <button onClick={unpay} className="text-xs text-emerald-800 underline">
              Undo
            </button>
          </div>
        ) : (
          <button onClick={() => setPaying(true)} className="flex-1 rounded-xl bg-teal-700 py-2 text-sm font-semibold text-white">
            Pay {formatINR(calc.due)}
          </button>
        )}
        <button onClick={() => setAdvance(true)} className="flex items-center gap-1 rounded-xl bg-stone-100 px-3 py-2 text-sm font-medium text-stone-700">
          <HandCoins size={15} /> Advance
        </button>
      </div>

      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between border-t border-stone-100 px-4 py-2.5 text-sm font-medium text-teal-700">
        {open ? 'Hide days' : 'Mark days off'}
        <ChevronDown size={16} className={`transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-3 pb-4">
          <div className="grid grid-cols-7 text-center text-xs text-stone-400">
            {MON_FIRST.map((i) => (
              <span key={i}>{WEEKDAYS_SHORT[i][0]}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {grid.flat().map((date, i) => {
              if (!date) return <span key={i} />;
              const off = isWeeklyOff(staff, date);
              const kind = staff.leaves[date];
              const future = date > today;
              const cls = kind === 'full' ? 'bg-rose-500 text-white' : kind === 'half' ? 'bg-amber-400 text-white' : off ? 'bg-stone-100 text-stone-300' : future ? 'text-stone-300' : 'text-stone-800';
              return (
                <button
                  key={date}
                  disabled={off}
                  onClick={() => store.saveStaff(cycleLeave(staff, date))}
                  aria-label={`${parseLocalDate(date).getDate()}: ${kind === 'full' ? 'day off' : kind === 'half' ? 'half day' : off ? 'weekly off' : 'working'}`}
                  className={`relative h-10 rounded-xl text-sm ${cls} ${date === today && !kind ? 'ring-2 ring-teal-600' : ''}`}
                >
                  {parseLocalDate(date).getDate()}
                  {kind === 'half' && <span className="absolute inset-x-0 bottom-0.5 text-[9px] leading-none">½</span>}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex justify-center gap-4 text-xs text-stone-500">
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-500" /> Day off
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400" /> Half day
            </span>
            {staff.weeklyOff.length > 0 && (
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-stone-200" /> Weekly off
              </span>
            )}
          </div>
          <p className="mt-2 text-center text-xs text-stone-500">
            {staff.paidLeaves ? `${staff.paidLeaves} day${staff.paidLeaves === 1 ? '' : 's'} a month are free. ` : ''}
            {calc.unpaidDays > 0 ? `${calc.unpaidDays} unpaid at ${formatINR(Math.round(staff.monthlySalary / daysInMonth(month)))} a day.` : 'Nothing to cut this month.'}
          </p>
        </div>
      )}

      {paying && <PaySalarySheet staff={staff} month={month} onClose={() => setPaying(false)} />}
      {advance && <AdvanceSheet staff={staff} onClose={() => setAdvance(false)} />}
    </section>
  );
}

function PaySalarySheet({ staff, month, onClose }: { staff: Staff; month: string; onClose: () => void }) {
  const store = useStore();
  const toast = useToast();
  const calc = salaryFor(staff, month);
  const [amount, setAmount] = useState(String(calc.due));
  const [date, setDate] = useState(localDate());
  const value = parseAmount(amount) ?? 0;
  const monthName = monthLabel(month).split(' ')[0];
  const pay = () => {
    const before = staff;
    const res = payStaff(staff, month, value, date, monthName);
    store.saveStaff(res.staff, res.expense ? [res.expense] : []);
    toast(`${staff.name}'s ${monthName} salary saved in Money`, { label: 'Undo', run: () => store.saveStaff(before, [], res.expense ? [res.expense.id] : []) });
    onClose();
  };
  return (
    <Sheet
      title={`Pay ${staff.name}`}
      onClose={onClose}
      footer={
        <PrimaryButton className="w-full" onClick={pay}>
          Mark {formatINR(value)} paid
        </PrimaryButton>
      }
    >
      <div className="mb-4 space-y-1 rounded-2xl bg-stone-50 p-4 text-sm ring-1 ring-stone-200">
        <Line label={`${monthName} salary`} value={formatINR(staff.monthlySalary)} />
        <Line label={`Days off: ${calc.leaveDays} (${staff.paidLeaves} free)`} value={calc.deduction ? `− ${formatINR(calc.deduction)}` : '—'} />
        {calc.advances > 0 && <Line label="Advance taken" value={`− ${formatINR(calc.advances)}`} />}
        <div className="border-t border-stone-200 pt-1">
          <Line label="To pay" value={formatINR(calc.due)} bold />
        </div>
      </div>
      <Field label="Amount paid">
        <AmountInput value={amount} onChange={setAmount} />
      </Field>
      <Field label="Date">
        <input id="salary-date" type="date" className={inputCls} value={date} max={localDate()} onChange={(e) => setDate(e.target.value || localDate())} />
      </Field>
      <p className="text-xs text-stone-500">This adds an expense under Household help in Money.</p>
    </Sheet>
  );
}

function Line({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? 'font-semibold text-stone-900' : 'text-stone-600'}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function AdvanceSheet({ staff, onClose }: { staff: Staff; onClose: () => void }) {
  const store = useStore();
  const toast = useToast();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const value = parseAmount(amount);
  const save = () => {
    if (!value) return;
    const before = staff;
    const res = giveAdvance(staff, value, localDate(), note.trim());
    store.saveStaff(res.staff, [res.expense]);
    toast(`${formatINR(value)} advance noted. It comes off the next salary.`, { label: 'Undo', run: () => store.saveStaff(before, [], [res.expense.id]) });
    onClose();
  };
  return (
    <Sheet
      title={`Advance to ${staff.name}`}
      onClose={onClose}
      footer={
        <PrimaryButton className="w-full" disabled={!value} onClick={save}>
          {value ? `Give ${formatINR(value)}` : 'Enter the amount'}
        </PrimaryButton>
      }
    >
      <div className="mb-4">
        <AmountInput value={amount} onChange={setAmount} autoFocus />
      </div>
      <Field label="Reason (optional)">
        <input id="advance-note" className={inputCls} placeholder="e.g. Festival, medical" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
    </Sheet>
  );
}

export function StaffSheet({ staff, onClose }: { staff: Staff | null; onClose: () => void }) {
  const store = useStore();
  const [draft, setDraft] = useState<Staff>(
    staff ?? {
      id: uid(),
      name: '',
      role: '',
      monthlySalary: 0,
      paidLeaves: 2,
      weeklyOff: [],
      phone: '',
      notes: '',
      active: true,
      startDate: null,
      leaves: {},
      advances: [],
      payments: [],
      createdAt: new Date().toISOString(),
    },
  );
  const [salary, setSalary] = useState(staff?.monthlySalary ? String(staff.monthlySalary) : '');
  const set = (patch: Partial<Staff>) => setDraft((d) => ({ ...d, ...patch }));
  const valid = draft.name.trim().length > 0;
  const save = () => {
    store.saveStaff({ ...draft, name: draft.name.trim(), role: draft.role.trim(), phone: draft.phone.trim(), monthlySalary: parseAmount(salary) ?? 0 });
    onClose();
  };
  return (
    <Sheet
      title={staff ? `Edit ${staff.name}` : 'Add household help'}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          {staff && (
            <ConfirmButton
              label="Delete"
              armedLabel="Tap again to delete"
              onConfirm={() => {
                store.deleteStaff(staff.id);
                onClose();
              }}
              className="rounded-2xl border border-rose-200 px-4 text-rose-600"
            >
              <Trash2 size={18} />
            </ConfirmButton>
          )}
          <PrimaryButton className="flex-1" disabled={!valid} onClick={save}>
            Save
          </PrimaryButton>
        </div>
      }
    >
      <Field label="Name">
        <input id="staff-name" className={inputCls} placeholder="e.g. Asha" value={draft.name} onChange={(e) => set({ name: e.target.value })} autoFocus={!staff} />
      </Field>
      <Field label="Work">
        <div className="flex flex-wrap gap-1.5">
          {ROLES.map((r) => (
            <button key={r} type="button" onClick={() => set({ role: draft.role === r ? '' : r })} className={`rounded-full px-3 py-1.5 text-sm ${draft.role === r ? 'bg-teal-700 text-white' : 'bg-stone-100 text-stone-700'}`}>
              {r}
            </button>
          ))}
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Monthly salary">
          <input id="staff-salary" inputMode="numeric" className={inputCls} placeholder="₹" value={salary} onChange={(e) => setSalary(e.target.value.replace(/[^\d.,]/g, ''))} />
        </Field>
        <Field label="Free leaves a month">
          <input
            id="staff-free"
            inputMode="decimal"
            className={inputCls}
            value={String(draft.paidLeaves)}
            onChange={(e) => set({ paidLeaves: Math.max(0, Number(e.target.value.replace(/[^\d.]/g, '')) || 0) })}
          />
        </Field>
      </div>
      <Field label="Weekly off">
        <div className="flex gap-1">
          {MON_FIRST.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => set({ weeklyOff: draft.weeklyOff.includes(d) ? draft.weeklyOff.filter((x) => x !== d) : [...draft.weeklyOff, d] })}
              aria-label={WEEKDAYS[d]}
              className={`flex-1 rounded-lg py-2 text-xs font-medium ${draft.weeklyOff.includes(d) ? 'bg-teal-700 text-white' : 'bg-stone-100 text-stone-600'}`}
            >
              {WEEKDAYS_SHORT[d].slice(0, 2)}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Phone (optional)">
        <input id="staff-phone" type="tel" className={inputCls} value={draft.phone} onChange={(e) => set({ phone: e.target.value })} />
      </Field>
      <Field label="Notes (optional)">
        <textarea id="staff-notes" className={inputCls} rows={2} placeholder="Timings, ID details, address" value={draft.notes} onChange={(e) => set({ notes: e.target.value })} />
      </Field>
      {staff && <Toggle on={!draft.active} onChange={(v) => set({ active: !v })} label="No longer works here" />}
    </Sheet>
  );
}

// From the + button: mark today (or another day) off for one person.
export function QuickLeaveSheet({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const toast = useToast();
  const staff = store.data.staff.filter((s) => s.active);
  const [who, setWho] = useState(staff[0]?.id ?? '');
  const [date, setDate] = useState(localDate());
  const person = staff.find((s) => s.id === who);
  const mark = (kind: 'full' | 'half' | null) => {
    if (!person) return;
    const leaves = { ...person.leaves };
    if (kind) leaves[date] = kind;
    else delete leaves[date];
    store.saveStaff({ ...person, leaves });
    toast(kind ? `${person.name}: ${kind === 'full' ? 'day off' : 'half day'} noted` : `${person.name} marked working`, { label: 'Undo', run: () => store.saveStaff(person) });
    onClose();
  };
  if (!staff.length)
    return (
      <Sheet title="Day off" onClose={onClose}>
        <p className="text-sm text-stone-600">Add your household help first, under Home, Help.</p>
      </Sheet>
    );
  return (
    <Sheet title="Day off" onClose={onClose}>
      <Field label="Who">
        <div className="flex flex-wrap gap-1.5">
          {staff.map((s) => (
            <button key={s.id} onClick={() => setWho(s.id)} className={`rounded-full px-3 py-1.5 text-sm ${who === s.id ? 'bg-teal-700 text-white' : 'bg-stone-100 text-stone-700'}`}>
              {s.name}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Day">
        <input id="leave-date" type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value || localDate())} />
      </Field>
      <div className="grid grid-cols-3 gap-2">
        <button onClick={() => mark('full')} className="rounded-xl bg-rose-500 py-3 text-sm font-semibold text-white">
          Day off
        </button>
        <button onClick={() => mark('half')} className="rounded-xl bg-amber-400 py-3 text-sm font-semibold text-white">
          Half day
        </button>
        <button onClick={() => mark(null)} className="rounded-xl bg-stone-100 py-3 text-sm font-medium text-stone-700">
          Was working
        </button>
      </div>
    </Sheet>
  );
}
