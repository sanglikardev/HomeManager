import { CalendarDays, Check, ChevronRight, Plane, RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { addDays, friendlyDate, localDate } from '../lib/dates';
import { billDueLabel, billsDue, formatINR } from '../lib/money';
import { activeTrip, countdown, dateRange, dueTasks, upcomingPlans } from '../lib/plans';
import { dueLabel, markDone, sortByUrgency, upkeepStatus } from '../lib/upkeep';
import { useStore } from '../store/store';
import type { Bill, UpkeepTask } from '../types';
import { PayBillSheet } from './MoneySheets';
import { useToast } from './toast';
import { RenewSheet } from './UpkeepSheet';
import { STATUS_STYLE } from './UpkeepView';

export type Go = (tab: 'upkeep' | 'plans' | 'money') => void;

// Overdue/soon upkeep, plan tasks due this week, and the next plan.
export function ComingUpCard({ today, onGo }: { today: string; onGo: Go }) {
  const store = useStore();
  const toast = useToast();
  const [renewing, setRenewing] = useState<UpkeepTask | null>(null);
  const [paying, setPaying] = useState<Bill | null>(null);
  const { upkeep, plans, bills } = store.data;
  const dueBills = useMemo(() => billsDue(bills, today), [bills, today]);

  const urgent = useMemo(
    () => sortByUrgency(upkeep, today).filter((t) => ['overdue', 'soon'].includes(upkeepStatus(t, today))),
    [upkeep, today],
  );
  const tasks = useMemo(() => dueTasks(plans, today, 7), [plans, today]);
  const next = upcomingPlans(plans, today).find((p) => p.startDate > today);

  if (!urgent.length && !tasks.length && !next && !dueBills.length) return null;

  const done = (t: UpkeepTask) => {
    if (t.kind === 'renewal') return setRenewing(t);
    store.saveUpkeep(markDone(t, today));
    toast(`${t.name} marked done`, { label: 'Undo', run: () => store.saveUpkeep(t) });
  };

  const tick = (planId: string, taskId: string) => {
    const plan = plans.find((p) => p.id === planId);
    if (!plan) return;
    const before = plan;
    store.savePlan({ ...plan, checklist: plan.checklist.map((c) => (c.id === taskId ? { ...c, done: true } : c)) });
    toast('Ticked off', { label: 'Undo', run: () => store.savePlan(before) });
  };

  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-500">Coming up</h2>
      <div className="divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200">
        {next && (
          <button onClick={() => onGo('plans')} className="flex w-full items-center gap-3 px-4 py-3 text-left">
            {next.kind === 'trip' ? <Plane size={18} className="text-teal-700" /> : <CalendarDays size={18} className="text-teal-700" />}
            <div className="min-w-0 flex-1">
              <p className="font-medium text-stone-900">{next.title}</p>
              <p className="text-xs text-stone-500">
                {dateRange(next)} · {countdown(next, today)}
              </p>
            </div>
            <ChevronRight size={18} className="text-stone-400" />
          </button>
        )}
        {dueBills.map((b) => (
          <div key={b.id} className="relative flex items-center gap-3 py-3 pl-5 pr-3">
            <span className={`absolute inset-y-2 left-0 w-1.5 rounded-r ${b.nextDue < today ? 'bg-rose-500' : 'bg-amber-500'}`} />
            <button onClick={() => onGo('money')} className="min-w-0 flex-1 text-left">
              <p className="text-sm font-medium text-stone-900">
                {b.name}
                {b.amount > 0 && <span className="font-normal text-stone-500"> · {formatINR(b.amount)}</span>}
              </p>
              <p className={`text-xs ${b.nextDue < today ? 'text-rose-700' : 'text-amber-700'}`}>{billDueLabel(b, today)}</p>
            </button>
            <button onClick={() => setPaying(b)} className="rounded-xl bg-stone-100 px-3 py-1.5 text-xs font-semibold text-stone-800">
              Paid
            </button>
          </div>
        ))}
        {tasks.slice(0, 4).map(({ plan, task }) => (
          <div key={task.id} className="flex items-center gap-3 px-4 py-3">
            <button onClick={() => tick(plan.id, task.id)} aria-label={`Done: ${task.text}`} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full ring-2 ring-stone-300 text-transparent hover:text-teal-700">
              <Check size={14} />
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-stone-900">{task.text}</p>
              <p className={`text-xs ${task.due && task.due <= today ? 'text-rose-700' : 'text-stone-500'}`}>
                {plan.title} · {task.due && task.due < today ? 'Overdue' : friendlyDate(task.due!)}
              </p>
            </div>
          </div>
        ))}
        {tasks.length > 4 && (
          <button onClick={() => onGo('plans')} className="w-full px-4 py-2 text-left text-xs font-medium text-teal-700">
            +{tasks.length - 4} more plan tasks this week
          </button>
        )}
        {urgent.slice(0, 4).map((t) => {
          const status = upkeepStatus(t, today);
          return (
            <div key={t.id} className="relative flex items-center gap-3 py-3 pl-5 pr-3">
              <span className={`absolute inset-y-2 left-0 w-1.5 rounded-r ${STATUS_STYLE[status].stripe}`} />
              <button onClick={() => onGo('upkeep')} className="min-w-0 flex-1 text-left">
                <p className="text-sm font-medium text-stone-900">{t.name}</p>
                <p className={`text-xs ${STATUS_STYLE[status].text}`}>{dueLabel(t, today)}</p>
              </button>
              <button onClick={() => done(t)} className="flex items-center gap-1 rounded-xl bg-stone-100 px-3 py-1.5 text-xs font-semibold text-stone-800">
                {t.kind === 'renewal' ? <RefreshCw size={12} /> : <Check size={12} />}
                {t.kind === 'renewal' ? 'Renewed' : 'Done'}
              </button>
            </div>
          );
        })}
        {urgent.length > 4 && (
          <button onClick={() => onGo('upkeep')} className="w-full px-4 py-2 text-left text-xs font-medium text-teal-700">
            +{urgent.length - 4} more upkeep tasks
          </button>
        )}
      </div>
      {renewing && <RenewSheet task={renewing} onClose={() => setRenewing(null)} />}
      {paying && <PayBillSheet bill={paying} onClose={() => setPaying(null)} />}
    </section>
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
      {trip.startDate <= today && (<button
        onClick={() => {
          const before = trip;
          const end = addDays(today, -1);
          store.savePlan({ ...trip, startDate: trip.startDate < end ? trip.startDate : end, endDate: end });
          toast('Welcome back! Suggestions are on again.', { label: 'Undo', run: () => store.savePlan(before) });
        }}
        className="mt-3 rounded-xl bg-white/15 px-3 py-2 text-sm font-semibold"
      >
        We're back early
      </button>)}
    </div>
  );
}
