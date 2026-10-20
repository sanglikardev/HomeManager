import { Check, GripVertical, Plus, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { UPKEEP_TEMPLATES } from '../data/upkeepTemplates';
import { localDate } from '../lib/dates';
import { uid } from '../lib/id';
import { dueLabel, guessLastDone, LAST_DONE_CHOICES, markDone, moveTask, sortByPriority, upkeepStatus, type UpkeepStatus } from '../lib/upkeep';
import { useStore } from '../store/store';
import { UPKEEP_CATEGORIES, type UpkeepTask } from '../types';
import { useToast } from './toast';
import { Pill, PrimaryButton, Sheet } from './ui';
import { RenewSheet, UpkeepSheet } from './UpkeepSheet';

export const STATUS_STYLE: Record<UpkeepStatus, { stripe: string; text: string }> = {
  overdue: { stripe: 'bg-rose-500', text: 'text-rose-700' },
  soon: { stripe: 'bg-amber-500', text: 'text-amber-700' },
  unknown: { stripe: 'bg-stone-300', text: 'text-stone-500' },
  ok: { stripe: 'bg-emerald-500', text: 'text-stone-500' },
};

export function UpkeepView() {
  const store = useStore();
  const toast = useToast();
  const today = localDate();
  const [editing, setEditing] = useState<UpkeepTask | 'new' | null>(null);
  const [renewing, setRenewing] = useState<UpkeepTask | null>(null);
  const [picking, setPicking] = useState(false);
  const [filter, setFilter] = useState<'all' | UpkeepTask['category']>('all');

  const tasks = useMemo(() => sortByPriority(store.data.upkeep), [store.data.upkeep]);
  const shown = tasks.filter((t) => filter === 'all' || t.category === filter);
  const overdue = tasks.filter((t) => upkeepStatus(t, today) === 'overdue').length;
  const soon = tasks.filter((t) => upkeepStatus(t, today) === 'soon').length;

  // Long-press a row, then drag it to a new place in the priority list.
  const [drag, setDrag] = useState<{ id: string; to: number } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const dragRef = useRef(drag);
  dragRef.current = drag;

  useEffect(() => {
    if (!drag) return;
    const index = (y: number) => {
      const rows = Array.from(listRef.current?.querySelectorAll<HTMLElement>('[data-row]') ?? []);
      let to = rows.length - 1;
      for (let i = 0; i < rows.length; i++) {
        const b = rows[i].getBoundingClientRect();
        if (y < b.top + b.height / 2) {
          to = i;
          break;
        }
      }
      return to;
    };
    const move = (e: PointerEvent | TouchEvent) => {
      e.preventDefault();
      const y = 'touches' in e ? e.touches[0].clientY : e.clientY;
      setDrag((d) => (d ? { ...d, to: index(y) } : d));
    };
    const end = () => {
      const d = dragRef.current;
      setDrag(null);
      if (d) {
        const changed = moveTask(tasks, shown, d.id, d.to);
        if (changed.length) store.saveUpkeepMany(changed);
      }
    };
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('touchend', end);
    window.addEventListener('pointercancel', end);
    return () => {
      window.removeEventListener('touchmove', move);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('touchend', end);
      window.removeEventListener('pointercancel', end);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.id]);

  const startPress = (id: string, to: number) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      navigator.vibrate?.(30);
      setDrag({ id, to });
    }, 400);
  };
  const cancelPress = () => window.clearTimeout(timer.current);

  const done = (t: UpkeepTask) => {
    if (t.kind === 'renewal') {
      setRenewing(t);
      return;
    }
    store.saveUpkeep(markDone(t, today));
    toast(`${t.name} marked done`, { label: 'Undo', run: () => store.saveUpkeep(t) });
  };

  if (!tasks.length) return <UpkeepStarter />;

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">Home upkeep</h1>
          <p className="text-sm text-stone-500">
            {overdue ? `${overdue} overdue` : 'Nothing overdue'}
            {soon ? ` · ${soon} due soon` : ''}
          </p>
        </div>
        <button onClick={() => setPicking(true)} className="flex items-center gap-1 rounded-xl bg-teal-700 px-3 py-2 text-sm font-semibold text-white">
          <Plus size={16} /> Add
        </button>
      </header>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {[{ value: 'all' as const, label: 'All' }, ...UPKEEP_CATEGORIES].map((c) => (
          <button
            key={c.value}
            onClick={() => setFilter(c.value)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium ${filter === c.value ? 'bg-stone-900 text-white' : 'bg-white text-stone-600 ring-1 ring-stone-200'}`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <LastDoneCard tasks={tasks} today={today} onRenewal={setEditing} />

      <p className="text-xs text-stone-500">Your priority order. Press and hold a task, then drag it to move it.</p>
      <div ref={listRef} className="divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200">
        {(drag ? moveShown(shown, drag) : shown).map((t, i) => {
          const status = upkeepStatus(t, today);
          return (
            <div
              key={t.id}
              data-row
              onPointerDown={() => startPress(t.id, i)}
              onPointerUp={cancelPress}
              onPointerCancel={cancelPress}
              onPointerLeave={() => !drag && cancelPress()}
              onContextMenu={(e) => e.preventDefault()}
              style={drag ? { touchAction: 'none' } : undefined}
              className={`relative flex select-none items-center gap-3 py-3 pl-5 pr-3 ${drag?.id === t.id ? 'bg-teal-50 shadow-md ring-2 ring-teal-500' : ''}`}
            >
              <span className={`absolute inset-y-2 left-0 w-1.5 rounded-r ${STATUS_STYLE[status].stripe}`} />
              {drag?.id === t.id && <GripVertical size={18} className="-ml-2 shrink-0 text-teal-700" />}
              <button onClick={() => setEditing(t)} className="min-w-0 flex-1 text-left">
                <p className="font-medium text-stone-900">{t.name}</p>
                <p className={`text-xs ${STATUS_STYLE[status].text}`}>
                  {dueLabel(t, today)}
                  {t.details['Vehicle number'] ? ` · ${t.details['Vehicle number']}` : ''}
                </p>
              </button>
              <button
                onClick={() => done(t)}
                className={`flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-semibold ${status === 'overdue' || status === 'soon' ? 'bg-teal-700 text-white' : 'bg-stone-100 text-stone-700'}`}
              >
                {t.kind === 'renewal' ? <RefreshCw size={14} /> : <Check size={14} />}
                {t.kind === 'renewal' ? 'Renewed' : 'Done'}
              </button>
            </div>
          );
        })}
        {!shown.length && <p className="px-4 py-6 text-center text-sm text-stone-500">Nothing in this group.</p>}
      </div>

      <button onClick={() => setEditing('new')} className="w-full rounded-2xl border border-dashed border-stone-300 py-3 text-sm font-medium text-stone-600">
        Add your own task
      </button>

      {editing && <UpkeepSheet task={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {renewing && <RenewSheet task={renewing} onClose={() => setRenewing(null)} />}
      {picking && (
        <Sheet title="Add upkeep tasks" onClose={() => setPicking(false)}>
          <TemplatePicker existing={new Set(tasks.map((t) => t.name))} onDone={() => setPicking(false)} />
        </Sheet>
      )}
    </div>
  );
}

// Asks, one task at a time, roughly when tasks with no date were last done.
function LastDoneCard({ tasks, today, onRenewal }: { tasks: UpkeepTask[]; today: string; onRenewal: (t: UpkeepTask) => void }) {
  const store = useStore();
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const unknown = tasks.filter((t) => upkeepStatus(t, today) === 'unknown' && !skipped.has(t.id));
  const t = unknown[0];
  if (!t) return null;
  return (
    <section className="rounded-3xl bg-violet-50 p-4 ring-1 ring-violet-200">
      <p className="mb-1 flex items-center text-xs font-medium text-violet-700">
        Getting started{unknown.length > 1 && <span className="ml-auto">{unknown.length} to go</span>}
      </p>
      {t.kind === 'renewal' ? (
        <>
          <p className="mb-2 text-sm text-violet-950">When does <b>{t.name}</b> expire?</p>
          <div className="flex gap-2">
            <button onClick={() => onRenewal(t)} className="rounded-xl bg-violet-700 px-3 py-2 text-sm font-semibold text-white">
              Set the date
            </button>
            <button onClick={() => setSkipped((s) => new Set(s).add(t.id))} className="rounded-xl px-3 py-2 text-sm text-violet-700">
              Later
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="mb-2 text-sm text-violet-950">When was <b>{t.name.toLowerCase()}</b> last done?</p>
          <div className="grid grid-cols-2 gap-1.5">
            {LAST_DONE_CHOICES.map((c) => (
              <button key={c.value} onClick={() => store.saveUpkeep(guessLastDone(t, c.value, today))} className="rounded-xl border border-violet-200 bg-white py-2 text-sm font-medium text-stone-700">
                {c.label}
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function UpkeepStarter() {
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-stone-900">Home upkeep</h1>
        <p className="mt-1 text-sm text-stone-600">Pick what you want reminders for. You'll set the last-done and expiry dates next.</p>
      </header>
      <TemplatePicker existing={new Set()} />
    </div>
  );
}

function TemplatePicker({ existing, onDone }: { existing: Set<string>; onDone?: () => void }) {
  const store = useStore();
  const available = UPKEEP_TEMPLATES.filter((t) => !existing.has(t.name));
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(existing.size ? [] : available.filter((t) => t.common).map((t) => t.name)));

  const add = () => {
    const tasks: UpkeepTask[] = available
      .filter((t) => chosen.has(t.name))
      .map((t) => ({
        id: uid(),
        name: t.name,
        category: t.category,
        kind: t.kind,
        intervalDays: t.intervalDays ?? null,
        lastDone: null,
        dueDate: null,
        remindDays: t.remindDays,
        details: Object.fromEntries((t.detailFields ?? []).map((f) => [f, ''])),
        history: [],
        notes: '',
      }));
    store.saveUpkeepMany(tasks);
    onDone?.();
  };

  return (
    <div className="space-y-4">
      {UPKEEP_CATEGORIES.map((c) => {
        const list = available.filter((t) => t.category === c.value);
        if (!list.length) return null;
        return (
          <section key={c.value}>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">{c.label}</h2>
            <div className="flex flex-wrap gap-2">
              {list.map((t) => {
                const on = chosen.has(t.name);
                return (
                  <button
                    key={t.name}
                    onClick={() =>
                      setChosen((s) => {
                        const n = new Set(s);
                        if (on) n.delete(t.name);
                        else n.add(t.name);
                        return n;
                      })
                    }
                    className={`rounded-full px-3 py-1.5 text-sm ${on ? 'bg-teal-700 text-white' : 'bg-white text-stone-700 ring-1 ring-stone-200'}`}
                  >
                    {t.name}
                    {t.kind === 'renewal' && <span className="ml-1 opacity-70">↻</span>}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
      <p className="text-xs text-stone-500">
        ↻ marks renewals with an expiry date. <Pill>Tip</Pill> You can add your own tasks afterwards.
      </p>
      <PrimaryButton className="w-full" onClick={add} disabled={!chosen.size}>
        Add {chosen.size} task{chosen.size === 1 ? '' : 's'}
      </PrimaryButton>
    </div>
  );
}

function moveShown(shown: UpkeepTask[], drag: { id: string; to: number }): UpkeepTask[] {
  const list = shown.filter((t) => t.id !== drag.id);
  const t = shown.find((x) => x.id === drag.id);
  if (t) list.splice(drag.to, 0, t);
  return list;
}
