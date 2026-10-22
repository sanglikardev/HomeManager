import { Check, Plane, RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { routineOn, withMark, type RoutineItem } from '../lib/calendar';
import { addDays, friendlyDate, localDate } from '../lib/dates';
import { docDueLabel, docsDue, docStatus } from '../lib/docs';
import { billDueLabel, billsDue, formatINR } from '../lib/money';
import { activeTrip, dateRange, dueTasks } from '../lib/plans';
import { moduleOn } from '../lib/modules';
import { setTodoDone, todoDueLabel, todosForToday, todoStatus } from '../lib/todos';
import { dueLabel, markDone, sortByUrgency, unmarkDone, upkeepStatus } from '../lib/upkeep';
import { useStore } from '../store/store';
import type { Bill, HomeDoc, UpkeepTask } from '../types';
import { DocSheet } from './DocsView';
import { PayBillSheet } from './MoneySheets';
import { useToast } from './toast';
import { RenewSheet } from './UpkeepSheet';
import { STATUS_STYLE } from './UpkeepView';

export type Dest = 'todos' | 'shopping' | 'pantry' | 'dishes' | 'upkeep' | 'routine' | 'help' | 'docs' | 'plans' | 'money';
export type Go = (to: Dest) => void;

const SHOWN = 6;

// One list of what needs doing: the day's routine, bills due, upkeep due, plan tasks this week.
export function TodoCard({ date, onGo }: { date: string; onGo: Go }) {
  const store = useStore();
  const toast = useToast();
  const today = localDate();
  const [renewing, setRenewing] = useState<UpkeepTask | null>(null);
  const [paying, setPaying] = useState<Bill | null>(null);
  const [all, setAll] = useState(false);
  const { upkeep, plans, bills, household } = store.data;
  const settings = household.settings;
  const isToday = date === today;

  const routine = useMemo(() => routineOn(settings, upkeep, date), [settings, upkeep, date]);
  const dueBills = useMemo(() => (isToday ? billsDue(bills, today) : []), [bills, today, isToday]);
  const urgent = useMemo(() => {
    if (!isToday) return [];
    const inRoutine = new Set(routine.map((r) => r.taskId).filter(Boolean));
    return sortByUrgency(upkeep, today).filter((t) => !inRoutine.has(t.id) && ['overdue', 'soon'].includes(upkeepStatus(t, today)));
  }, [upkeep, today, isToday, routine]);
  const tasks = useMemo(() => (isToday ? dueTasks(plans, today, 7) : []), [plans, today, isToday]);
  const docs = useMemo(() => (isToday ? docsDue(store.data.docs, today) : []), [store.data.docs, today, isToday]);
  const [doc, setDoc] = useState<HomeDoc | null>(null);
  const todos = useMemo(() => (isToday && moduleOn(settings, 'todos') ? todosForToday(store.data.todos, today) : []), [store.data.todos, today, isToday, settings]);

  const toggleRoutine = (item: RoutineItem) => {
    const task = item.taskId ? upkeep.find((t) => t.id === item.taskId) : undefined;
    if (task) {
      const when = item.date <= today ? item.date : today;
      store.saveUpkeep(item.done ? unmarkDone(task, when) : markDone(task, when));
    }
    store.updateHousehold({ settings: { weekState: withMark(settings.weekState, item.key, item.origDate, { done: !item.done }, today) } });
  };

  const done = (t: UpkeepTask) => {
    if (t.kind === 'renewal') return setRenewing(t);
    store.saveUpkeep(markDone(t, today));
    toast(`${t.name} marked done`, { label: 'Undo', run: () => store.saveUpkeep(t) });
  };

  const tick = (planId: string, taskId: string) => {
    const plan = plans.find((p) => p.id === planId);
    if (!plan) return;
    store.savePlan({ ...plan, checklist: plan.checklist.map((c) => (c.id === taskId ? { ...c, done: true } : c)) });
    toast('Ticked off', { label: 'Undo', run: () => store.savePlan(plan) });
  };

  const rows: { key: string; node: React.ReactNode }[] = [
    ...routine.map((t) => ({
      key: `r-${t.key}@${t.origDate}`,
      node: (
        <button onClick={() => toggleRoutine(t)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
          <Tick on={t.done} />
          <span className={`flex-1 text-sm ${t.done ? 'text-stone-400 line-through' : 'text-stone-900'}`}>{t.label}</span>
          <span className="text-xs text-stone-400">Routine</span>
        </button>
      ),
    })),
    ...dueBills.map((b) => ({
      key: `b-${b.id}`,
      node: (
        <Row stripe={b.nextDue < today ? 'bg-rose-500' : 'bg-amber-500'} onOpen={() => onGo('money')} title={`${b.name}${b.amount > 0 ? ` · ${formatINR(b.amount)}` : ''}`} sub={billDueLabel(b, today)} subCls={b.nextDue < today ? 'text-rose-700' : 'text-amber-700'}>
          <button onClick={() => setPaying(b)} className="rounded-xl bg-stone-100 px-3 py-1.5 text-xs font-semibold text-stone-800">
            Paid
          </button>
        </Row>
      ),
    })),
    ...urgent.map((t) => {
      const status = upkeepStatus(t, today);
      return {
        key: `u-${t.id}`,
        node: (
          <Row stripe={STATUS_STYLE[status].stripe} onOpen={() => onGo('upkeep')} title={t.name} sub={dueLabel(t, today)} subCls={STATUS_STYLE[status].text}>
            <button onClick={() => done(t)} className="flex items-center gap-1 rounded-xl bg-stone-100 px-3 py-1.5 text-xs font-semibold text-stone-800">
              {t.kind === 'renewal' ? <RefreshCw size={12} /> : <Check size={12} />}
              {t.kind === 'renewal' ? 'Renewed' : 'Done'}
            </button>
          </Row>
        ),
      };
    }),
    ...docs.map((d) => ({
      key: `d-${d.id}`,
      node: (
        <Row stripe={docStatus(d, today) === 'expired' ? 'bg-rose-500' : 'bg-amber-500'} onOpen={() => setDoc(d)} title={d.title} sub={docDueLabel(d, today)} subCls={docStatus(d, today) === 'expired' ? 'text-rose-700' : 'text-amber-700'}>
          <button onClick={() => setDoc(d)} className="rounded-xl bg-stone-100 px-3 py-1.5 text-xs font-semibold text-stone-800">
            Update
          </button>
        </Row>
      ),
    })),
    ...todos.map((t) => ({
      key: `t-${t.id}`,
      node: (
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            onClick={() => {
              store.saveTodo(setTodoDone(t, true, today));
              toast(`${t.title} done`, { label: 'Undo', run: () => store.saveTodo(t) });
            }}
            aria-label={`Done: ${t.title}`}
          >
            <Tick on={false} />
          </button>
          <button onClick={() => onGo('todos')} className="min-w-0 flex-1 text-left">
            <p className="text-sm text-stone-900">{t.title}</p>
            <p className={`text-xs ${todoStatus(t, today) === 'overdue' ? 'text-rose-700' : 'text-stone-500'}`}>To-do · {todoDueLabel(t, today)}</p>
          </button>
        </div>
      ),
    })),
    ...tasks.map(({ plan, task }) => ({
      key: `p-${task.id}`,
      node: (
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={() => tick(plan.id, task.id)} aria-label={`Done: ${task.text}`}>
            <Tick on={false} />
          </button>
          <button onClick={() => onGo('plans')} className="min-w-0 flex-1 text-left">
            <p className="text-sm text-stone-900">{task.text}</p>
            <p className={`text-xs ${task.due && task.due <= today ? 'text-rose-700' : 'text-stone-500'}`}>
              {plan.title} · {task.due && task.due < today ? 'Overdue' : friendlyDate(task.due!)}
            </p>
          </button>
        </div>
      ),
    })),
  ];

  if (!rows.length) return null;
  const open = routine.filter((r) => !r.done).length + dueBills.length + urgent.length + tasks.length + docs.length + todos.length;
  const shown = all ? rows : rows.slice(0, SHOWN);

  return (
    <section>
      <h2 className="mb-2 flex items-baseline justify-between text-sm font-semibold uppercase tracking-wide text-stone-500">
        {isToday ? 'To do' : 'Tomorrow'}
        {open > 0 && <span className="text-xs font-normal normal-case tracking-normal">{open} open</span>}
      </h2>
      <div className="divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200">
        {shown.map((r) => (
          <div key={r.key}>{r.node}</div>
        ))}
        {rows.length > shown.length && (
          <button onClick={() => setAll(true)} className="w-full px-4 py-2.5 text-left text-sm font-medium text-teal-700">
            Show {rows.length - shown.length} more
          </button>
        )}
      </div>
      {renewing && <RenewSheet task={renewing} onClose={() => setRenewing(null)} />}
      {paying && <PayBillSheet bill={paying} onClose={() => setPaying(null)} />}
      {doc && <DocSheet doc={doc} onClose={() => setDoc(null)} />}
    </section>
  );
}

function Tick({ on }: { on: boolean }) {
  return (
    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${on ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-stone-300'}`}>
      {on && <Check size={14} />}
    </span>
  );
}

function Row({ stripe, onOpen, title, sub, subCls, children }: { stripe: string; onOpen: () => void; title: string; sub: string; subCls: string; children: React.ReactNode }) {
  return (
    <div className="relative flex items-center gap-3 py-3 pl-5 pr-3">
      <span className={`absolute inset-y-2 left-0 w-1.5 rounded-r ${stripe}`} />
      <button onClick={onOpen} className="min-w-0 flex-1 text-left">
        <p className="text-sm font-medium text-stone-900">{title}</p>
        <p className={`text-xs ${subCls}`}>{sub}</p>
      </button>
      {children}
    </div>
  );
}

// Shown instead of meal suggestions while a trip is on.
export function AwayCard({ date }: { date: string }) {
  const store = useStore();
  const toast = useToast();
  const trip = activeTrip(store.data.plans, date);
  const today = localDate();
  if (!trip) return null;
  return (
    <div className="rounded-3xl bg-gradient-to-br from-sky-700 to-teal-600 px-5 py-4 text-white">
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-sky-100">
        <Plane size={14} /> Away
      </p>
      <h3 className="mt-1 text-xl font-semibold">{trip.title}</h3>
      <p className="mt-0.5 text-sm text-sky-100">
        {dateRange(trip)}. Meal suggestions and fresh-food reorders are paused until you're back.
      </p>
      {trip.startDate <= today && (
        <button
          onClick={() => {
            const before = trip;
            const end = addDays(today, -1);
            store.savePlan({ ...trip, startDate: trip.startDate < end ? trip.startDate : end, endDate: end });
            toast('Welcome back! Suggestions are on again.', { label: 'Undo', run: () => store.savePlan(before) });
          }}
          className="mt-3 rounded-xl bg-white/15 px-3 py-2 text-sm font-semibold"
        >
          We're back early
        </button>
      )}
    </div>
  );
}
