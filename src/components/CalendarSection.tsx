import { ArrowRightLeft, ChevronLeft, ChevronRight, Pencil, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { choreFor, entriesOn, entryCountsByDay, monthGrid, routineWeek, type RoutineItem, weekStart, withMark } from '../lib/calendar';
import { addDays, friendlyDate, localDate, parseLocalDate, WEEKDAYS, WEEKDAYS_SHORT } from '../lib/dates';
import { uid } from '../lib/id';
import { moduleOn } from '../lib/modules';
import { setTodoDone, todosOn } from '../lib/todos';
import { markDone, unmarkDone } from '../lib/upkeep';
import { useStore } from '../store/store';
import type { Plan, WeekMark } from '../types';
import { TodoSheet } from './TodosView';
import { Field, inputCls, PrimaryButton, Segmented, Sheet } from './ui';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MON_FIRST = [1, 2, 3, 4, 5, 6, 0];

const KIND_LABEL: Record<Plan['kind'], string> = { trip: 'Trip', event: 'Function', other: 'Outing', holiday: 'Holiday' };
const KIND_DOT: Record<Plan['kind'], string> = { trip: 'bg-sky-500', event: 'bg-violet-500', other: 'bg-amber-500', holiday: 'bg-rose-500' };

export function WeeklyChores() {
  const store = useStore();
  const settings = store.data.household.settings;
  const today = localDate();
  const [editing, setEditing] = useState(false);
  const [offset, setOffset] = useState(0);
  const [moving, setMoving] = useState<RoutineItem | null>(null);
  const start = addDays(weekStart(today), offset * 7);
  const week = routineWeek(settings, store.data.upkeep, start);
  const any = week.some((d) => d.length);
  const mark = (item: RoutineItem, patch: Partial<WeekMark>) =>
    store.updateHousehold({ settings: { weekState: withMark(settings.weekState, item.key, item.origDate, patch, today) } });

  const toggle = (item: RoutineItem) => {
    const task = item.taskId ? store.data.upkeep.find((t) => t.id === item.taskId) : undefined;
    if (task) {
      const when = item.date <= today ? item.date : today;
      store.saveUpkeep(item.done ? unmarkDone(task, when) : markDone(task, when));
    }
    mark(item, { done: !item.done });
  };

  return (
    <section className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-stone-200">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold text-stone-900">{offset === 0 ? "This week's routine" : offset === 1 ? "Next week's routine" : offset === -1 ? "Last week's routine" : 'Weekly routine'}</h2>
        <button onClick={() => setEditing(true)} className="flex items-center gap-1 text-sm font-medium text-teal-700">
          <Pencil size={14} /> Chores
        </button>
      </div>
      <div className="mb-2 flex items-center justify-between text-sm text-stone-500">
        <button onClick={() => setOffset(offset - 1)} className="rounded-lg p-1.5" aria-label="Previous week">
          <ChevronLeft size={18} />
        </button>
        <span>
          {friendlyDate(start, '').replace(/^\w+ /, '')} – {friendlyDate(addDays(start, 6), '').replace(/^\w+ /, '')}
        </span>
        <button onClick={() => setOffset(offset + 1)} className="rounded-lg p-1.5" aria-label="Next week">
          <ChevronRight size={18} />
        </button>
      </div>
      {!any && <p className="text-sm text-stone-500">Set a chore for each day under Chores, or choose weekdays on a repeating Home upkeep task (like sweeping twice a week). They all show here, and you can tick them off or move them to another day.</p>}
      {any && (
        <div className="divide-y divide-stone-100">
          {week.map((items, i) => {
            const date = addDays(start, i);
            const d = parseLocalDate(date);
            const isToday = date === today;
            return (
              <div key={date} className={`flex items-start gap-3 py-2 ${isToday ? '-mx-2 rounded-xl bg-teal-50 px-2' : ''}`}>
                <span className={`w-14 shrink-0 pt-0.5 text-sm ${isToday ? 'font-semibold text-teal-800' : 'text-stone-500'}`}>
                  {WEEKDAYS_SHORT[d.getDay()]} {d.getDate()}
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  {items.length === 0 && <span className="text-sm text-stone-300">—</span>}
                  {items.map((it) => (
                    <div key={it.key + it.origDate} className="flex items-center gap-2">
                      <button
                        onClick={() => toggle(it)}
                        className={`h-5 w-5 shrink-0 rounded-md border-2 ${it.done ? 'border-teal-600 bg-teal-600' : 'border-stone-300'}`}
                        aria-label={it.done ? `Mark ${it.label} not done` : `Mark ${it.label} done`}
                      >
                        {it.done && <span className="block text-center text-[11px] leading-4 text-white">✓</span>}
                      </button>
                      <span className={`min-w-0 flex-1 text-sm ${it.done ? 'text-stone-400 line-through' : 'text-stone-800'}`}>
                        {it.label}
                        {it.moved && <span className="ml-1 text-xs text-amber-600">moved</span>}
                      </span>
                      <button onClick={() => setMoving(it)} className="p-1 text-stone-400" aria-label={`Move ${it.label} to another day`}>
                        <ArrowRightLeft size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {editing && <ChoresSheet onClose={() => setEditing(false)} />}
      {moving && (
        <Sheet title={`Move "${moving.label}"`} onClose={() => setMoving(null)}>
          <div className="space-y-2">
            {Array.from({ length: 7 }, (_, i) => {
              const date = addDays(start, i);
              const d = parseLocalDate(date);
              return (
                <button
                  key={date}
                  onClick={() => {
                    mark(moving, { to: date });
                    setMoving(null);
                  }}
                  className={`flex w-full justify-between rounded-xl px-4 py-3 text-left text-sm ring-1 ${date === moving.date ? 'bg-teal-50 ring-teal-600' : 'ring-stone-200'}`}
                >
                  <span className="text-stone-800">
                    {WEEKDAYS[d.getDay()]} {d.getDate()}
                  </span>
                  <span className="text-xs text-stone-400">{date === moving.origDate ? 'original day' : date === moving.date ? 'now' : ''}</span>
                </button>
              );
            })}
          </div>
        </Sheet>
      )}
    </section>
  );
}

function ChoresSheet({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const [draft, setDraft] = useState<string[]>(() => Array.from({ length: 7 }, (_, i) => store.data.household.settings.weeklyChores?.[i] ?? ''));
  return (
    <Sheet
      title="Weekly routine"
      onClose={onClose}
      footer={
        <PrimaryButton
          className="w-full"
          onClick={() => {
            store.updateHousehold({ settings: { weeklyChores: draft.map((c) => c.trim()) } });
            onClose();
          }}
        >
          Save
        </PrimaryButton>
      }
    >
      <p className="mb-3 text-sm text-stone-500">What should happen on each day. This repeats every week; leave a day empty for nothing.</p>
      {MON_FIRST.map((i) => (
        <Field key={i} label={WEEKDAYS[i]}>
          <input id={`chore-${i}`} className={inputCls} placeholder="e.g. Clean the house" value={draft[i]} onChange={(e) => setDraft((d) => d.map((c, j) => (j === i ? e.target.value : c)))} />
        </Field>
      ))}
    </Sheet>
  );
}

export function MonthCalendar({ onOpenPlan }: { onOpenPlan: (id: string) => void }) {
  const store = useStore();
  const today = localDate();
  const now = parseLocalDate(today);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [view, setView] = useState<'month' | 'year'>('month');
  const [day, setDay] = useState<string | null>(null);
  const plans = store.data.plans;
  const todos = moduleOn(store.data.household.settings, 'todos') ? store.data.todos : [];
  const grid = useMemo(() => monthGrid(year, month), [year, month]);
  const counts = useMemo(() => entryCountsByDay(plans, year, month, todos), [plans, todos, year, month]);
  const shift = (n: number) => {
    const d = new Date(year, month + n, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  return (
    <section className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-stone-200">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold text-stone-900">Calendar</h2>
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: 'month', label: 'Month' },
            { value: 'year', label: 'Year' },
          ]}
        />
      </div>
      <div className="mb-2 flex items-center justify-between">
        <button onClick={() => (view === 'month' ? shift(-1) : setYear(year - 1))} className="rounded-lg p-2 text-stone-600" aria-label="Previous">
          <ChevronLeft size={20} />
        </button>
        <p className="font-medium text-stone-800">{view === 'month' ? `${MONTHS[month]} ${year}` : year}</p>
        <button onClick={() => (view === 'month' ? shift(1) : setYear(year + 1))} className="rounded-lg p-2 text-stone-600" aria-label="Next">
          <ChevronRight size={20} />
        </button>
      </div>

      {view === 'month' ? (
        <>
          <div className="grid grid-cols-7 text-center text-xs text-stone-400">
            {MON_FIRST.map((i) => (
              <span key={i}>{WEEKDAYS_SHORT[i][0]}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-y-1">
            {grid.flat().map((date, i) => {
              if (!date) return <span key={i} />;
              const list = entriesOn(plans, date);
              const isToday = date === today;
              return (
                <button key={date} onClick={() => setDay(date)} className={`flex h-12 flex-col items-center rounded-xl pt-1 ${isToday ? 'bg-teal-700 text-white' : 'text-stone-800'}`}>
                  <span className="text-sm">{parseLocalDate(date).getDate()}</span>
                  <span className="mt-0.5 flex gap-0.5">
                    {list.slice(0, 3).map((p) => (
                      <span key={p.id} className={`h-1.5 w-1.5 rounded-full ${isToday ? 'bg-white' : KIND_DOT[p.kind]}`} />
                    ))}
                    {todosOn(todos, date).some((t) => !t.done) && <span className={`h-1.5 w-1.5 rounded-sm ${isToday ? 'bg-white' : 'bg-emerald-500'}`} />}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-stone-400">
            {counts.size ? `${counts.size} day${counts.size === 1 ? '' : 's'} with plans this month. ` : ''}Tap a date to add or see what's on.
          </p>
        </>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {MONTHS.map((name, m) => {
            const n = entryCountsByDay(plans, year, m, todos).size;
            const current = year === now.getFullYear() && m === now.getMonth();
            return (
              <button
                key={name}
                onClick={() => {
                  setMonth(m);
                  setView('month');
                }}
                className={`rounded-xl py-3 text-center ring-1 ${current ? 'bg-teal-50 ring-teal-600' : 'ring-stone-200'}`}
              >
                <p className="text-sm font-medium text-stone-800">{name.slice(0, 3)}</p>
                <p className={`text-xs ${n ? 'text-teal-700' : 'text-stone-300'}`}>{n ? `${n} day${n === 1 ? '' : 's'}` : '—'}</p>
              </button>
            );
          })}
        </div>
      )}
      {day && <DaySheet date={day} onClose={() => setDay(null)} onOpenPlan={(id) => { setDay(null); onOpenPlan(id); }} />}
    </section>
  );
}

function DaySheet({ date, onClose, onOpenPlan }: { date: string; onClose: () => void; onOpenPlan: (id: string) => void }) {
  const store = useStore();
  const showTodos = moduleOn(store.data.household.settings, 'todos');
  const dayTodos = showTodos ? todosOn(store.data.todos, date) : [];
  const [addingTodo, setAddingTodo] = useState(false);
  const list = entriesOn(store.data.plans, date);
  const chore = choreFor(store.data.household.settings, date);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<Plan['kind']>('event');
  const [time, setTime] = useState('');
  const d = parseLocalDate(date);

  const add = () => {
    if (!title.trim()) return;
    store.savePlan({ id: uid(), title: title.trim(), kind, destination: '', international: false, startDate: date, endDate: date, time, checklist: [], notes: '', createdAt: new Date().toISOString() });
    setTitle('');
    setTime('');
  };

  return (
    <Sheet title={`${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`} onClose={onClose}>
      {chore && <p className="mb-3 rounded-xl bg-teal-50 px-3 py-2 text-sm text-teal-900">Routine: {chore}</p>}
      {list.length === 0 && dayTodos.length === 0 && <p className="mb-3 text-sm text-stone-500">Nothing planned.</p>}
      <div className="mb-4 space-y-2">
        {list.map((p) => (
          <button key={p.id} onClick={() => onOpenPlan(p.id)} className="flex w-full items-center gap-3 rounded-xl bg-white px-3 py-2.5 text-left ring-1 ring-stone-200">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${KIND_DOT[p.kind]}`} />
            <span className="flex-1 text-sm text-stone-800">{p.title}</span>
            <span className="text-xs text-stone-500">{p.time ? `${p.time} · ` : ''}{KIND_LABEL[p.kind]}</span>
          </button>
        ))}
      </div>
      {dayTodos.length > 0 && (
        <div className="mb-4 space-y-2">
          {dayTodos.map((t) => (
            <button key={t.id} onClick={() => store.saveTodo(setTodoDone(t, !t.done, localDate()))} className="flex w-full items-center gap-3 rounded-xl bg-white px-3 py-2.5 text-left ring-1 ring-stone-200">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${t.done ? 'bg-stone-300' : 'bg-emerald-500'}`} />
              <span className={`flex-1 text-sm ${t.done ? 'text-stone-400 line-through' : 'text-stone-800'}`}>{t.title}</span>
              <span className="text-xs text-stone-500">{t.done ? 'Done' : 'To-do · tap to tick'}</span>
            </button>
          ))}
        </div>
      )}
      {showTodos && (
        <button onClick={() => setAddingTodo(true)} className="mb-4 w-full rounded-xl bg-emerald-50 py-2.5 text-sm font-semibold text-emerald-800">
          Add a to-do for this day
        </button>
      )}
      {addingTodo && <TodoSheet todo={null} date={date} onClose={() => setAddingTodo(false)} />}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <Field label="Add to this day">
          <input id="cal-title" className={inputCls} placeholder="Cousin's wedding, dinner out, Diwali…" value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Type">
          <Segmented
            value={kind}
            onChange={setKind}
            options={[
              { value: 'event', label: 'Function' },
              { value: 'other', label: 'Outing' },
              { value: 'holiday', label: 'Holiday' },
            ]}
          />
        </Field>
        <Field label="Time (optional)">
          <input id="cal-time" type="time" className={inputCls} value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
        <PrimaryButton type="submit" className="mt-2 w-full" disabled={!title.trim()}>
          <Plus size={16} className="mr-1 inline" /> Add
        </PrimaryButton>
      </form>
    </Sheet>
  );
}
