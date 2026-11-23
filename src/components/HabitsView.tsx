import { Bell, Check, ChevronRight, Flame, NotebookPen, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { addDays, friendlyDate, localDate, WEEKDAYS_SHORT } from '../lib/dates';
import {
  dayAmount,
  doneRate,
  habitsOn,
  habitSummary,
  HABIT_IDEAS,
  hourLabel,
  newHabit,
  notedLogs,
  num,
  progressLabel,
  recentDays,
  scheduleLabel,
  streak,
  streakLabel,
  tapLog,
  weekDoneDays,
  weekStart,
  type HabitToday,
} from '../lib/habits';
import { uid } from '../lib/id';
import { useStore } from '../store/store';
import type { Habit, HabitLog } from '../types';
import { useToast } from './toast';
import { ConfirmButton, Field, inputCls, PrimaryButton, Segmented, Sheet, Toggle } from './ui';

// ---------- quick logging (shared by the Habits tab, Today and the + button) ----------

function useHabitTap() {
  const store = useStore();
  const toast = useToast();
  return (h: Habit, date: string) => {
    const logs = store.data.habitLogs;
    const amount = dayAmount(logs, h.id, date);
    if (h.kind === 'check' && amount >= h.target) {
      // Tapping a ticked habit unticks the day.
      const day = logs.filter((l) => l.habitId === h.id && l.date === date);
      store.deleteHabitLogs(day.map((l) => l.id));
      toast(`${h.name}: not done`, { label: 'Undo', run: () => store.saveHabitLogs(day) });
      return;
    }
    const row = tapLog(h, date, uid(), new Date());
    store.saveHabitLogs([row]);
    const msg = h.kind === 'check' ? `${h.name} done` : `${h.name}: ${progressLabel(h, amount + row.amount)}`;
    toast(msg, { label: 'Undo', run: () => store.deleteHabitLogs([row.id]) });
  };
}

export function HabitIcon({ h, done }: { h: Habit; done?: boolean }) {
  return (
    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg ${done ? 'bg-emerald-100' : 'bg-stone-100'}`}>
      {h.emoji || <span className="text-sm font-semibold text-stone-600">{h.name.slice(0, 1).toUpperCase()}</span>}
    </span>
  );
}

// One habit with its one-tap button. Tapping the name opens the details.
export function HabitRow({ item, date, onOpen, onNote }: { item: HabitToday; date: string; onOpen: () => void; onNote?: () => void }) {
  const store = useStore();
  const tap = useHabitTap();
  const { habit: h, amount, done } = item;
  const s = streak(h, store.data.habitLogs, date);
  const pct = Math.min(1, amount / (h.target || 1));
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <button onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <HabitIcon h={h} done={done} />
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-sm font-medium ${done ? 'text-stone-500' : 'text-stone-900'}`}>{h.name}</span>
          <span className="flex items-center gap-2 text-xs text-stone-500">
            {h.kind === 'count' && <span>{progressLabel(h, amount)}</span>}
            {h.schedule === 'weekly' && <span>{weekDoneDays(h, store.data.habitLogs, date)} of {h.perWeek} this week</span>}
            {s.count > 0 && (
              <span className="flex items-center gap-0.5 text-orange-600">
                <Flame size={12} /> {streakLabel(s)}
              </span>
            )}
          </span>
          {h.kind === 'count' && (
            <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-stone-100">
              <span className={`block h-full rounded-full ${done ? 'bg-emerald-500' : 'bg-teal-500'}`} style={{ width: `${pct * 100}%` }} />
            </span>
          )}
        </span>
      </button>
      {onNote && (
        <button onClick={onNote} aria-label={`Add a note for ${h.name}`} className="rounded-xl p-2 text-stone-400">
          <NotebookPen size={18} />
        </button>
      )}
      {h.kind === 'check' ? (
        <button onClick={() => tap(h, date)} aria-label={done ? `Not done: ${h.name}` : `Done: ${h.name}`} className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 ${done ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-stone-300 text-stone-300'}`}>
          <Check size={22} />
        </button>
      ) : (
        <button onClick={() => tap(h, date)} aria-label={`Add ${num(h.step || 1)} ${h.unit} to ${h.name}`} className={`flex h-11 min-w-11 shrink-0 items-center justify-center rounded-full px-3 text-sm font-semibold ${done ? 'bg-emerald-100 text-emerald-800' : 'bg-teal-700 text-white'}`}>
          +{num(h.step || 1)}
        </button>
      )}
    </div>
  );
}

// ---------- Today ----------

export function HabitsCard({ onGo }: { onGo: () => void }) {
  const store = useStore();
  const today = localDate();
  const items = useMemo(() => habitsOn(store.data.habits, store.data.habitLogs, today), [store.data.habits, store.data.habitLogs, today]);
  const [open, setOpen] = useState<Habit | null>(null);
  const [noting, setNoting] = useState<Habit | null>(null);
  if (!items.length) return null;
  const left = items.filter((i) => !i.done).length;
  return (
    <section>
      <button onClick={onGo} className="mb-2 flex w-full items-center gap-2 text-left">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Habits</h2>
        <span className="text-xs text-stone-400">{left ? `${left} to go` : 'All done today'}</span>
        <ChevronRight size={16} className="ml-auto text-stone-400" />
      </button>
      <div className="divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200">
        {items.map((it) => (
          <HabitRow key={it.habit.id} item={it} date={today} onOpen={() => setOpen(it.habit)} onNote={() => setNoting(it.habit)} />
        ))}
      </div>
      {open && <HabitDetailSheet habit={open} onClose={() => setOpen(null)} />}
      {noting && <HabitLogSheet habit={noting} date={today} onClose={() => setNoting(null)} />}
    </section>
  );
}

// ---------- the Habits tab ----------

export function HabitsView() {
  const store = useStore();
  const today = localDate();
  const { habits, habitLogs } = store.data;
  const [editing, setEditing] = useState<Habit | 'new' | null>(null);
  const [open, setOpen] = useState<Habit | null>(null);
  const [noting, setNoting] = useState<Habit | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const todays = useMemo(() => habitsOn(habits, habitLogs, today), [habits, habitLogs, today]);
  const others = habits.filter((h) => !h.archived && !todays.some((t) => t.habit.id === h.id));
  const archived = habits.filter((h) => h.archived);
  const fresh = (id: string) => store.data.habits.find((h) => h.id === id) ?? null;

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-stone-900">Habits</h1>
        <button onClick={() => setEditing('new')} className="flex items-center gap-1 rounded-xl bg-teal-700 px-3 py-2 text-sm font-semibold text-white">
          <Plus size={16} /> Habit
        </button>
      </header>

      {!habits.length && (
        <button onClick={() => setEditing('new')} className="w-full rounded-2xl border border-dashed border-stone-300 p-4 text-left text-sm text-stone-600">
          Track anything you want to do regularly: drink water, read a few pages, work out 4 times a week. Log with one tap, keep a streak, and get a reminder on your phone.
        </button>
      )}

      {todays.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-500">Today</h2>
          <div className="divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200">
            {todays.map((it) => (
              <HabitRow key={it.habit.id} item={it} date={today} onOpen={() => setOpen(it.habit)} onNote={() => setNoting(it.habit)} />
            ))}
          </div>
        </section>
      )}

      {others.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-500">Not today</h2>
          <div className="divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200">
            {others.map((h) => (
              <button key={h.id} onClick={() => setOpen(h)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left">
                <HabitIcon h={h} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-stone-900">{h.name}</span>
                  <span className="block truncate text-xs text-stone-500">
                    {h.schedule === 'weekly' ? `Week goal met (${weekDoneDays(h, habitLogs, today)} of ${h.perWeek})` : scheduleLabel(h)}
                  </span>
                </span>
                <ChevronRight size={16} className="text-stone-400" />
              </button>
            ))}
          </div>
        </section>
      )}

      {archived.length > 0 && (
        <section>
          <button onClick={() => setShowArchived((v) => !v)} className="text-sm font-medium text-stone-500">
            {showArchived ? 'Hide' : 'Show'} paused ({archived.length})
          </button>
          {showArchived && (
            <div className="mt-2 divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200">
              {archived.map((h) => (
                <button key={h.id} onClick={() => setOpen(h)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left">
                  <HabitIcon h={h} />
                  <span className="flex-1 text-sm text-stone-500">{h.name}</span>
                  <ChevronRight size={16} className="text-stone-400" />
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {editing && <HabitSheet habit={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {open && fresh(open.id) && <HabitDetailSheet habit={fresh(open.id)!} onClose={() => setOpen(null)} onEdit={() => {
            setEditing(fresh(open.id));
            setOpen(null);
          }} />}
      {noting && <HabitLogSheet habit={noting} date={today} onClose={() => setNoting(null)} />}
    </div>
  );
}

// ---------- details: streak, history grid, notes ----------

export function HabitDetailSheet({ habit: h, onClose, onEdit }: { habit: Habit; onClose: () => void; onEdit?: () => void }) {
  const store = useStore();
  const today = localDate();
  const logs = store.data.habitLogs;
  const [logDate, setLogDate] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const s = streak(h, logs, today);
  const rate = doneRate(h, logs, today);
  // Five weeks, Monday first, ending this week.
  const first = addDays(weekStart(today), -28);
  const grid = recentDays(h, logs, addDays(first, 34), 35);
  const notes = notedLogs(logs, h.id).slice(0, 30);

  if (editing) return <HabitSheet habit={h} onClose={onClose} />;
  if (logDate) return <HabitLogSheet habit={h} date={logDate} onClose={() => setLogDate(null)} />;

  return (
    <Sheet title={`${h.emoji ? `${h.emoji} ` : ''}${h.name}`} onClose={onClose}>
      <p className="mb-3 text-sm text-stone-500">{habitSummary(h)}</p>
      <div className="mb-4 grid grid-cols-3 gap-2 text-center">
        <Stat label="Streak" value={s.count ? streakLabel(s) : '0'} />
        <Stat label="Last 30 days" value={rate == null ? '–' : `${Math.round(rate * 100)}%`} />
        <Stat label="Today" value={progressLabel(h, dayAmount(logs, h.id, today))} />
      </div>

      <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] font-medium text-stone-400">
        {[1, 2, 3, 4, 5, 6, 0].map((d) => (
          <span key={d}>{WEEKDAYS_SHORT[d].slice(0, 2)}</span>
        ))}
      </div>
      <div className="mb-1 grid grid-cols-7 gap-1">
        {grid.map((d) => {
          const future = d.date > today;
          const cls = future
            ? 'bg-transparent text-stone-300'
            : d.done
              ? 'bg-emerald-500 text-white'
              : d.amount > 0
                ? 'bg-emerald-100 text-emerald-800'
                : d.scheduled
                  ? 'bg-stone-100 text-stone-500'
                  : 'bg-transparent text-stone-300 ring-1 ring-stone-100';
          return (
            <button key={d.date} disabled={future} onClick={() => setLogDate(d.date)} aria-label={`Log ${friendlyDate(d.date, today)}`} className={`aspect-square rounded-lg text-xs font-medium ${cls} ${d.date === today ? 'ring-2 ring-teal-600' : ''}`}>
              {Number(d.date.slice(8))}
            </button>
          );
        })}
      </div>
      <p className="mb-4 text-xs text-stone-500">Tap a day to log it or add a note, even for a day you forgot.</p>

      <button onClick={() => setLogDate(today)} className="mb-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-teal-50 py-3 text-sm font-semibold text-teal-800 ring-1 ring-teal-200">
        <NotebookPen size={16} /> Log today with a note
      </button>

      {notes.length > 0 && (
        <section className="mb-4">
          <h3 className="mb-1.5 text-sm font-semibold text-stone-700">Notes</h3>
          <ul className="divide-y divide-stone-100 rounded-2xl ring-1 ring-stone-200">
            {notes.map((l) => (
              <li key={l.id} className="px-3 py-2">
                <p className="text-xs text-stone-500">
                  {friendlyDate(l.date, today)}
                  {h.kind === 'count' && ` · ${num(l.amount)} ${h.unit}`}
                </p>
                <p className="whitespace-pre-wrap text-sm text-stone-800">{l.note}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {h.notes && <p className="mb-4 whitespace-pre-wrap rounded-2xl bg-stone-50 p-3 text-sm text-stone-600">{h.notes}</p>}

      <div className="flex gap-2">
        <button onClick={() => (onEdit ? onEdit() : setEditing(true))} className="flex-1 rounded-2xl bg-stone-100 py-3 text-sm font-semibold text-stone-800">
          Edit habit
        </button>
        <button
          onClick={() => {
            store.saveHabit({ ...h, archived: !h.archived });
            onClose();
          }}
          className="flex-1 rounded-2xl bg-stone-100 py-3 text-sm font-semibold text-stone-800"
        >
          {h.archived ? 'Resume' : 'Pause'}
        </button>
      </div>
    </Sheet>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-stone-50 px-2 py-2.5 ring-1 ring-stone-200">
      <p className="truncate text-sm font-semibold text-stone-900">{value}</p>
      <p className="text-[11px] text-stone-500">{label}</p>
    </div>
  );
}

// ---------- log one day: amount and a note (workout details, PRs, pages...) ----------

export function HabitLogSheet({ habit: h, date: initialDate, onClose }: { habit: Habit; date: string; onClose: () => void }) {
  const store = useStore();
  const toast = useToast();
  const today = localDate();
  const [date, setDate] = useState(initialDate);
  const [amount, setAmount] = useState(String(h.kind === 'check' ? h.target : h.step || 1));
  const [note, setNote] = useState('');
  const dayLogs = store.data.habitLogs.filter((l) => l.habitId === h.id && l.date === date);
  const total = dayLogs.reduce((s, l) => s + l.amount, 0);
  const checkDone = h.kind === 'check' && total >= h.target;
  const value = Number(amount);
  // A check habit already done that day: a note is saved on its own, without counting twice.
  const canSave = h.kind === 'check' ? true : value > 0 || !!note.trim();

  const save = () => {
    const row: HabitLog = {
      id: uid(),
      habitId: h.id,
      date,
      amount: h.kind === 'check' ? (checkDone ? 0 : h.target) : value > 0 ? value : 0,
      note: note.trim(),
      createdAt: new Date().toISOString(),
    };
    if (!row.amount && !row.note) return onClose();
    store.saveHabitLogs([row]);
    toast(row.note ? 'Saved with note' : `${h.name}: ${progressLabel(h, total + row.amount)}`);
    onClose();
  };

  return (
    <Sheet
      title={`${h.emoji ? `${h.emoji} ` : ''}${h.name}`}
      onClose={onClose}
      footer={
        <PrimaryButton className="w-full" disabled={!canSave} onClick={save}>
          {h.kind === 'check' && !checkDone ? 'Mark done' : 'Save'}
        </PrimaryButton>
      }
    >
      <Field label="Day">
        <input type="date" className={inputCls} max={today} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
      </Field>
      {h.kind === 'count' ? (
        <Field label={`How many ${h.unit || ''}`.trim()} hint={`So far that day: ${progressLabel(h, total)}`}>
          <input type="number" inputMode="decimal" min={0} className={inputCls} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
      ) : (
        <p className="mb-4 text-sm text-stone-600">{checkDone ? 'Already done that day. You can still add a note.' : 'Saving marks it done for that day.'}</p>
      )}
      <Field label="Note (optional)">
        <textarea className={`${inputCls} h-28`} placeholder={h.kind === 'check' ? 'What you did, how it went, a new best…' : 'Anything worth remembering'} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      {dayLogs.length > 0 && (
        <section>
          <h3 className="mb-1.5 text-sm font-semibold text-stone-700">Logged that day</h3>
          <ul className="divide-y divide-stone-100 rounded-2xl ring-1 ring-stone-200">
            {dayLogs.map((l) => (
              <li key={l.id} className="flex items-center gap-2 px-3 py-2">
                <span className="min-w-0 flex-1 text-sm text-stone-700">
                  {h.kind === 'count' ? `${num(l.amount)} ${h.unit}` : l.amount ? 'Done' : 'Note'}
                  {l.note && <span className="block truncate text-xs text-stone-500">{l.note}</span>}
                </span>
                <ConfirmButton label={`Remove this entry`} armedLabel="Remove" onConfirm={() => store.deleteHabitLogs([l.id])} className="rounded-lg p-1.5 text-stone-400">
                  <Trash2 size={16} />
                </ConfirmButton>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Sheet>
  );
}

// ---------- add / edit ----------

const HOURS = Array.from({ length: 18 }, (_, i) => i + 6); // 6 am to 11 pm

export function HabitSheet({ habit, onClose }: { habit: Habit | null; onClose: () => void }) {
  const store = useStore();
  const [draft, setDraft] = useState<Habit>(habit ?? newHabit(uid(), new Date()));
  const [picked, setPicked] = useState(!!habit);
  const set = (patch: Partial<Habit>) => setDraft((d) => ({ ...d, ...patch }));
  const valid = draft.name.trim() && (draft.kind === 'check' || draft.target > 0) && (draft.schedule !== 'days' || draft.days.length > 0);
  const save = () => {
    if (!valid) return;
    store.saveHabit({ ...draft, name: draft.name.trim(), emoji: draft.emoji.trim(), unit: draft.unit.trim(), target: draft.kind === 'check' ? 1 : draft.target, step: draft.kind === 'check' ? 1 : draft.step || 1 });
    onClose();
  };
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <Sheet
      title={habit ? 'Edit habit' : 'New habit'}
      onClose={onClose}
      footer={
        <PrimaryButton className="w-full" disabled={!valid} onClick={save}>
          Save
        </PrimaryButton>
      }
    >
      {!picked && (
        <section className="mb-4">
          <p className="mb-2 text-sm text-stone-600">Pick a starting point or make your own. You can change everything.</p>
          <div className="flex flex-wrap gap-2">
            {HABIT_IDEAS.map((idea) => (
              <button
                key={idea.name}
                onClick={() => {
                  setDraft(newHabit(draft.id, new Date(), idea));
                  setPicked(true);
                }}
                className="rounded-full bg-stone-100 px-3 py-1.5 text-sm text-stone-800"
              >
                {idea.emoji} {idea.name}
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="flex gap-2">
        <div className="w-20 shrink-0">
          <Field label="Icon">
            <input className={`${inputCls} text-center`} maxLength={4} placeholder="🙂" value={draft.emoji} onChange={(e) => set({ emoji: e.target.value })} />
          </Field>
        </div>
        <div className="flex-1">
          <Field label="Habit">
            <input className={inputCls} placeholder="Drink water, read, work out…" value={draft.name} onChange={(e) => {
                set({ name: e.target.value });
                setPicked(true);
              }} />
          </Field>
        </div>
      </div>

      <Group label="How do you track it">
        <Segmented
          value={draft.kind}
          onChange={(kind) => set({ kind })}
          options={[
            { value: 'check', label: 'Tick when done' },
            { value: 'count', label: 'Count it' },
          ]}
        />
      </Group>

      {draft.kind === 'count' && (
        <div className="grid grid-cols-3 gap-2">
          <Field label="Goal a day">
            <input type="number" inputMode="decimal" min={1} className={inputCls} value={draft.target || ''} onChange={(e) => set({ target: Number(e.target.value) })} />
          </Field>
          <Field label="Unit">
            <input className={inputCls} placeholder="glasses" value={draft.unit} onChange={(e) => set({ unit: e.target.value })} />
          </Field>
          <Field label="Per tap">
            <input type="number" inputMode="decimal" min={1} className={inputCls} value={draft.step || ''} onChange={(e) => set({ step: Number(e.target.value) })} />
          </Field>
        </div>
      )}

      <Group label="How often">
        <Segmented
          value={draft.schedule}
          onChange={(schedule) => set({ schedule })}
          options={[
            { value: 'daily', label: 'Every day' },
            { value: 'days', label: 'Some days' },
            { value: 'weekly', label: 'Times a week' },
          ]}
        />
      </Group>
      {draft.schedule === 'days' && (
        <div className="-mt-2 mb-4 grid grid-cols-7 gap-1">
          {[1, 2, 3, 4, 5, 6, 0].map((d) => (
            <button key={d} onClick={() => set({ days: toggle(draft.days, d) })} className={`rounded-lg py-2 text-xs font-medium ${draft.days.includes(d) ? 'bg-teal-700 text-white' : 'bg-stone-100 text-stone-600'}`}>
              {WEEKDAYS_SHORT[d]}
            </button>
          ))}
        </div>
      )}
      {draft.schedule === 'weekly' && (
        <div className="-mt-2 mb-4 flex items-center gap-2">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <button key={n} onClick={() => set({ perWeek: n })} className={`h-10 flex-1 rounded-lg text-sm font-medium ${draft.perWeek === n ? 'bg-teal-700 text-white' : 'bg-stone-100 text-stone-600'}`}>
              {n}
            </button>
          ))}
          <span className="text-sm text-stone-500">a week</span>
        </div>
      )}

      <Group label="Reminders" hint="A phone nudge at these times, only if it is not done yet. Turn notifications on in Settings > App.">
        <div className="grid grid-cols-6 gap-1">
          {HOURS.map((hr) => (
            <button key={hr} onClick={() => set({ reminderHours: toggle(draft.reminderHours, hr) })} className={`flex items-center justify-center gap-0.5 rounded-lg py-2 text-xs font-medium ${draft.reminderHours.includes(hr) ? 'bg-amber-500 text-white' : 'bg-stone-100 text-stone-600'}`}>
              {draft.reminderHours.includes(hr) && <Bell size={10} />}
              {hourLabel(hr).replace(' ', '')}
            </button>
          ))}
        </div>
      </Group>

      <Field label="Notes (optional)">
        <textarea className={`${inputCls} h-20`} placeholder="Why, or the plan: e.g. Push / Pull / Legs" value={draft.notes} onChange={(e) => set({ notes: e.target.value })} />
      </Field>

      {habit && (
        <>
          <Toggle on={draft.archived} onChange={(archived) => set({ archived })} label="Paused (hidden from Today, no reminders)" />
          <ConfirmButton
            label="Delete habit and its history"
            armedLabel="Tap again to delete"
            onConfirm={() => {
              store.deleteHabit(habit.id);
              onClose();
            }}
            className="mt-2 w-full rounded-2xl py-3 text-sm text-rose-600"
          />
        </>
      )}
    </Sheet>
  );
}

// Like Field, but not a <label>: tapping the heading must not press the first button inside.
function Group({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <span className="mb-1.5 block text-sm font-medium text-stone-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-stone-500">{hint}</span>}
    </div>
  );
}

// ---------- the + button: log any habit quickly ----------

export function QuickHabitSheet({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const today = localDate();
  const items = habitsOn(store.data.habits, store.data.habitLogs, today);
  const rest = store.data.habits.filter((h) => !h.archived && !items.some((i) => i.habit.id === h.id)).map((h) => ({ habit: h, amount: dayAmount(store.data.habitLogs, h.id, today), done: false }));
  const [noting, setNoting] = useState<Habit | null>(null);
  const [adding, setAdding] = useState(false);
  if (noting) return <HabitLogSheet habit={noting} date={today} onClose={onClose} />;
  if (adding || !store.data.habits.length) return <HabitSheet habit={null} onClose={onClose} />;
  return (
    <Sheet title="Log a habit" onClose={onClose}>
      <div className="-mx-2 divide-y divide-stone-100">
        {[...items, ...rest].map((it) => (
          <HabitRow key={it.habit.id} item={it} date={today} onOpen={() => setNoting(it.habit)} onNote={() => setNoting(it.habit)} />
        ))}
      </div>
      <button onClick={() => setAdding(true)} className="mt-3 flex w-full items-center justify-center gap-1 rounded-2xl bg-stone-100 py-3 text-sm font-semibold text-stone-800">
        <Plus size={16} /> New habit
      </button>
    </Sheet>
  );
}
