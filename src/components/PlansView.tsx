import { CalendarDays, CloudSun, MapPin, Newspaper, Pencil, Plane, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { addDays, friendlyDate, localDate } from '../lib/dates';
import { uid } from '../lib/id';
import { buildChecklist, countdown, dateRange, isOngoing, newsUrl, pastPlans, upcomingPlans, weatherUrl } from '../lib/plans';
import { useStore } from '../store/store';
import type { Plan, PlanTask } from '../types';
import { MonthCalendar, WeeklyChores } from './CalendarSection';
import { ConfirmButton, Field, inputCls, PrimaryButton, Segmented, Sheet, Toggle } from './ui';

export function PlansView() {
  const store = useStore();
  const today = localDate();
  const [editing, setEditing] = useState<Plan | 'new' | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);
  const upcoming = useMemo(() => upcomingPlans(store.data.plans, today), [store.data.plans, today]);
  const past = useMemo(() => pastPlans(store.data.plans, today), [store.data.plans, today]);
  const open = store.data.plans.find((p) => p.id === openId);

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-stone-900">Plans & trips</h1>
        <button onClick={() => setEditing('new')} className="flex items-center gap-1 rounded-xl bg-teal-700 px-3 py-2 text-sm font-semibold text-white">
          <Plus size={16} /> Plan
        </button>
      </header>

      <WeeklyChores />
      <MonthCalendar onOpenPlan={(id) => setOpenId(id)} />

      {!upcoming.length && (
        <div className="rounded-2xl bg-white p-6 text-center ring-1 ring-stone-200">
          <Plane className="mx-auto mb-2 text-teal-700" />
          <p className="font-semibold text-stone-800">No plans coming up</p>
          <p className="mt-1 text-sm text-stone-500">Add a trip and you'll get a checklist with booking, passport, packing and home reminders, timed to the dates.</p>
        </div>
      )}

      <div className="space-y-3">
        {upcoming.map((p) => (
          <PlanCard key={p.id} plan={p} today={today} onOpen={() => setOpenId(p.id)} />
        ))}
      </div>

      {past.length > 0 && (
        <section>
          <button onClick={() => setShowPast((v) => !v)} className="text-sm font-medium text-stone-500">
            {showPast ? 'Hide' : 'Show'} past plans ({past.length})
          </button>
          {showPast && (
            <div className="mt-2 space-y-2">
              {past.map((p) => (
                <button key={p.id} onClick={() => setOpenId(p.id)} className="flex w-full justify-between rounded-xl bg-white px-4 py-3 text-left text-sm ring-1 ring-stone-200">
                  <span className="text-stone-700">{p.title}</span>
                  <span className="text-stone-400">{dateRange(p)}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {editing && <PlanSheet plan={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onCreated={(id) => setOpenId(id)} />}
      {open && !editing && <PlanDetail plan={open} onClose={() => setOpenId(null)} onEdit={() => setEditing(open)} />}
    </div>
  );
}

function PlanCard({ plan, today, onOpen }: { plan: Plan; today: string; onOpen: () => void }) {
  const done = plan.checklist.filter((t) => t.done).length;
  const total = plan.checklist.length;
  const nextTask = plan.checklist.filter((t) => !t.done).sort((a, b) => (a.due ?? '').localeCompare(b.due ?? ''))[0];
  const now = isOngoing(plan, today);
  return (
    <button onClick={onOpen} className="block w-full overflow-hidden rounded-3xl bg-white text-left shadow-sm ring-1 ring-stone-200">
      <div className={`flex items-start justify-between px-5 py-4 ${now ? 'bg-gradient-to-br from-sky-600 to-teal-600 text-white' : ''}`}>
        <div>
          <p className={`text-xs font-semibold uppercase tracking-wide ${now ? 'text-sky-100' : 'text-teal-700'}`}>{countdown(plan, today)}</p>
          <h3 className="mt-0.5 text-lg font-semibold">{plan.title}</h3>
          <p className={`flex items-center gap-1 text-sm ${now ? 'text-sky-100' : 'text-stone-500'}`}>
            <CalendarDays size={14} /> {dateRange(plan)}
            {plan.destination && (
              <>
                <MapPin size={14} className="ml-2" /> {plan.destination}
              </>
            )}
          </p>
        </div>
        {plan.kind === 'trip' && <Plane size={22} className={now ? 'text-white' : 'text-stone-300'} />}
      </div>
      {total > 0 && (
        <div className="border-t border-stone-100 px-5 py-3">
          <div className="mb-1.5 h-1.5 overflow-hidden rounded-full bg-stone-100">
            <div className="h-full rounded-full bg-teal-600" style={{ width: `${(done / total) * 100}%` }} />
          </div>
          <p className="text-xs text-stone-500">
            {done} of {total} done{nextTask ? ` · Next: ${nextTask.text}${nextTask.due ? ` (${friendlyDate(nextTask.due, today).toLowerCase()})` : ''}` : ''}
          </p>
        </div>
      )}
    </button>
  );
}

function PlanDetail({ plan, onClose, onEdit }: { plan: Plan; onClose: () => void; onEdit: () => void }) {
  const store = useStore();
  const today = localDate();
  const [text, setText] = useState('');
  const tasks = [...plan.checklist].sort((a, b) => Number(a.done) - Number(b.done) || (a.due ?? '9').localeCompare(b.due ?? '9'));
  const update = (checklist: PlanTask[]) => store.savePlan({ ...plan, checklist });

  return (
    <Sheet
      title={plan.title}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <ConfirmButton
            label="Delete plan"
            armedLabel="Tap again to delete"
            onConfirm={() => {
              store.deletePlan(plan.id);
              onClose();
            }}
            className="rounded-2xl border border-rose-200 px-4 text-rose-600"
          >
            <Trash2 size={18} />
          </ConfirmButton>
          <button onClick={onEdit} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-stone-100 py-3 font-medium text-stone-800">
            <Pencil size={16} /> Edit dates and details
          </button>
        </div>
      }
    >
      <p className="mb-3 text-sm text-stone-600">
        {dateRange(plan)} · {countdown(plan, today)}
        {plan.destination ? ` · ${plan.destination}` : ''}
      </p>
      {plan.destination && (
        <div className="mb-4 grid grid-cols-2 gap-2">
          <a href={newsUrl(plan.destination)} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 rounded-xl bg-sky-50 py-2.5 text-sm font-medium text-sky-800 ring-1 ring-sky-200">
            <Newspaper size={16} /> News
          </a>
          <a href={weatherUrl(plan.destination)} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 rounded-xl bg-sky-50 py-2.5 text-sm font-medium text-sky-800 ring-1 ring-sky-200">
            <CloudSun size={16} /> Weather
          </a>
        </div>
      )}
      {plan.notes && <p className="mb-4 whitespace-pre-line rounded-xl bg-stone-50 p-3 text-sm text-stone-700">{plan.notes}</p>}

      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Checklist</h3>
      <div className="divide-y divide-stone-100 rounded-2xl ring-1 ring-stone-200">
        {tasks.map((t) => {
          const late = !t.done && t.due && t.due < today;
          return (
            <div key={t.id} className="flex items-start gap-3 px-3 py-2.5">
              <button
                onClick={() => update(plan.checklist.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)))}
                className={`mt-0.5 h-5 w-5 shrink-0 rounded-md border-2 ${t.done ? 'border-teal-600 bg-teal-600' : 'border-stone-300'}`}
                aria-label={t.done ? `Mark ${t.text} not done` : `Mark ${t.text} done`}
              >
                {t.done && <span className="block text-center text-[11px] leading-4 text-white">✓</span>}
              </button>
              <div className="min-w-0 flex-1">
                <p className={`text-sm ${t.done ? 'text-stone-400 line-through' : 'text-stone-800'}`}>{t.text}</p>
                {t.due && !t.done && <p className={`text-xs ${late ? 'text-rose-600' : 'text-stone-500'}`}>{late ? 'Was due ' : 'By '}{friendlyDate(t.due, today).toLowerCase()}</p>}
              </div>
              <button onClick={() => update(plan.checklist.filter((x) => x.id !== t.id))} className="p-1 text-xs text-stone-400" aria-label={`Remove ${t.text}`}>
                ✕
              </button>
            </div>
          );
        })}
      </div>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          update([...plan.checklist, { id: uid(), text: text.trim(), due: null, done: false }]);
          setText('');
        }}
      >
        <input id="plan-task" className={inputCls} placeholder="Add to the checklist" value={text} onChange={(e) => setText(e.target.value)} />
        <button type="submit" className="rounded-xl bg-teal-700 px-3 text-white" aria-label="Add task">
          <Plus size={18} />
        </button>
      </form>
    </Sheet>
  );
}

function PlanSheet({ plan, onClose, onCreated }: { plan: Plan | null; onClose: () => void; onCreated: (id: string) => void }) {
  const store = useStore();
  const today = localDate();
  const [draft, setDraft] = useState<Plan>(
    plan ?? { id: uid(), title: '', kind: 'trip', destination: '', international: false, startDate: addDays(today, 14), endDate: addDays(today, 17), checklist: [], notes: '', createdAt: new Date().toISOString() },
  );
  const set = (patch: Partial<Plan>) => setDraft((d) => ({ ...d, ...patch }));
  const valid = draft.title.trim() && draft.startDate && draft.endDate && draft.endDate >= draft.startDate;

  const save = () => {
    const next = { ...draft, title: draft.title.trim(), destination: draft.destination.trim() };
    if (!plan) next.checklist = buildChecklist(next, today);
    store.savePlan(next);
    onClose();
    if (!plan) onCreated(next.id);
  };

  return (
    <Sheet
      title={plan ? 'Edit plan' : 'New plan'}
      onClose={onClose}
      footer={
        <PrimaryButton className="w-full" disabled={!valid} onClick={save}>
          {plan ? 'Save' : 'Create with checklist'}
        </PrimaryButton>
      }
    >
      <Field label="What">
        <input id="plan-title" className={inputCls} placeholder="Trip to Thailand" value={draft.title} onChange={(e) => set({ title: e.target.value })} autoFocus={!plan} />
      </Field>
      <Field label="Type">
        <Segmented
          value={draft.kind}
          onChange={(kind) => set({ kind })}
          options={[
            { value: 'trip', label: 'Trip' },
            { value: 'event', label: 'Event' },
            { value: 'other', label: 'Other' },
            { value: 'holiday', label: 'Holiday' },
          ]}
        />
      </Field>
      {draft.kind === 'trip' && (
        <>
          <Field label="Where" hint="Used for news and weather links.">
            <input id="plan-dest" className={inputCls} placeholder="Bangkok, Thailand" value={draft.destination} onChange={(e) => set({ destination: e.target.value })} />
          </Field>
          <Toggle on={draft.international} onChange={(v) => set({ international: v })} label="International (adds passport, visa, forex, SIM)" />
        </>
      )}
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Field label="From">
          <input id="plan-start" type="date" className={inputCls} value={draft.startDate} onChange={(e) => set({ startDate: e.target.value, endDate: draft.endDate < e.target.value ? e.target.value : draft.endDate })} />
        </Field>
        <Field label="To">
          <input id="plan-end" type="date" className={inputCls} value={draft.endDate} min={draft.startDate} onChange={(e) => set({ endDate: e.target.value })} />
        </Field>
      </div>
      {draft.startDate === draft.endDate && (
        <Field label="Time (optional)">
          <input id="plan-time" type="time" className={inputCls} value={draft.time ?? ''} onChange={(e) => set({ time: e.target.value })} />
        </Field>
      )}
      <Field label="Notes">
        <textarea id="plan-notes" className={inputCls} rows={3} placeholder="Booking numbers, hotel address, people going…" value={draft.notes} onChange={(e) => set({ notes: e.target.value })} />
      </Field>
      {!plan && draft.kind !== 'other' && <p className="text-xs text-stone-500">A checklist timed to these dates is added automatically. You can edit it after.</p>}
    </Sheet>
  );
}
