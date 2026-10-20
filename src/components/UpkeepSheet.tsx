import { Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { addDays, friendlyDate, localDate, WEEKDAYS_SHORT } from '../lib/dates';
import { uid } from '../lib/id';
import { markDone, nextDue } from '../lib/upkeep';
import { useStore } from '../store/store';
import { UPKEEP_CATEGORIES, type UpkeepTask } from '../types';
import { useToast } from './toast';
import { ConfirmButton, Field, inputCls, PrimaryButton, Segmented, Sheet } from './ui';

const INTERVALS = [
  { label: 'Weekly', days: 7 },
  { label: 'Monthly', days: 30 },
  { label: '3 months', days: 90 },
  { label: '6 months', days: 180 },
  { label: 'Yearly', days: 365 },
];

export function UpkeepSheet({ task, onClose }: { task: UpkeepTask | null; onClose: () => void }) {
  const store = useStore();
  const [draft, setDraft] = useState<UpkeepTask>(
    task ?? { id: uid(), name: '', category: 'home', kind: 'recurring', intervalDays: 90, lastDone: null, dueDate: null, remindDays: 7, details: {}, history: [], notes: '' },
  );
  const [newField, setNewField] = useState('');
  const set = (patch: Partial<UpkeepTask>) => setDraft((d) => ({ ...d, ...patch }));
  const next = nextDue(draft);

  return (
    <Sheet
      title={task ? draft.name || 'Edit task' : 'New upkeep task'}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          {task && (
            <ConfirmButton
              label="Delete task"
              armedLabel="Tap again to delete"
              onConfirm={() => {
                store.deleteUpkeep(task.id);
                onClose();
              }}
              className="rounded-2xl border border-rose-200 px-4 text-rose-600"
            >
              <Trash2 size={18} />
            </ConfirmButton>
          )}
          <PrimaryButton
            className="flex-1"
            disabled={!draft.name.trim() || (draft.kind === 'recurring' && !draft.intervalDays)}
            onClick={() => {
              store.saveUpkeep({ ...draft, name: draft.name.trim() });
              onClose();
            }}
          >
            Save
          </PrimaryButton>
        </div>
      }
    >
      <Field label="Name">
        <input id="upkeep-name" className={inputCls} value={draft.name} onChange={(e) => set({ name: e.target.value })} autoFocus={!task} />
      </Field>
      <Field label="Group">
        <select id="upkeep-category" className={inputCls} value={draft.category} onChange={(e) => set({ category: e.target.value as UpkeepTask['category'] })}>
          {UPKEEP_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Type">
        <Segmented
          value={draft.kind}
          onChange={(kind) => set({ kind })}
          options={[
            { value: 'recurring', label: 'Repeats' },
            { value: 'renewal', label: 'Renewal / expiry' },
          ]}
        />
      </Field>

      {draft.kind === 'recurring' ? (
        <>
          <Field label="How often">
            <div className="mb-2 flex flex-wrap gap-1.5">
              {INTERVALS.map((i) => (
                <button key={i.days} onClick={() => set({ intervalDays: i.days })} className={`rounded-full px-3 py-1.5 text-sm ${draft.intervalDays === i.days ? 'bg-teal-700 text-white' : 'bg-stone-100 text-stone-700'}`}>
                  {i.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-stone-600">Every</span>
              <input
                id="upkeep-interval"
                className={`${inputCls} w-24`}
                inputMode="numeric"
                value={draft.intervalDays ?? ''}
                onChange={(e) => set({ intervalDays: Number(e.target.value.replace(/\D/g, '')) || null })}
              />
              <span className="text-sm text-stone-600">days</span>
            </div>
          </Field>
          <Field label="Show in the weekly routine on" hint="Pick the days, e.g. Mon and Thu for twice a week. You can tick it off or move it from the Plans tab.">
            <div className="flex gap-1.5">
              {[1, 2, 3, 4, 5, 6, 0].map((d) => {
                const on = draft.weekdays?.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => {
                      const days = on ? (draft.weekdays ?? []).filter((x) => x !== d) : [...(draft.weekdays ?? []), d];
                      set({ weekdays: days, ...(days.length ? { intervalDays: Math.max(1, Math.round(7 / days.length)) } : {}) });
                    }}
                    className={`flex-1 rounded-lg py-2 text-xs font-medium ${on ? 'bg-teal-700 text-white' : 'bg-stone-100 text-stone-700'}`}
                  >
                    {WEEKDAYS_SHORT[d]}
                  </button>
                );
              })}
            </div>
          </Field>
          <Field label="Last done" hint={next ? `Next due ${friendlyDate(next).toLowerCase()} (${next})` : 'Set this to start the countdown.'}>
            <input id="upkeep-last" type="date" className={inputCls} value={draft.lastDone ?? ''} max={localDate()} onChange={(e) => set({ lastDone: e.target.value || null })} />
          </Field>
        </>
      ) : (
        <Field label="Expires / renew by">
          <input id="upkeep-due" type="date" className={inputCls} value={draft.dueDate ?? ''} onChange={(e) => set({ dueDate: e.target.value || null })} />
        </Field>
      )}

      <Field label="Remind me this many days before">
        <input id="upkeep-remind" className={`${inputCls} w-24`} inputMode="numeric" value={draft.remindDays} onChange={(e) => set({ remindDays: Number(e.target.value.replace(/\D/g, '')) || 0 })} />
      </Field>

      <div className="mb-4">
        <p className="mb-1.5 text-sm font-medium text-stone-700">Details</p>
        <div className="space-y-2">
          {Object.entries(draft.details).map(([k, v]) => (
            <div key={k} className="flex items-center gap-2">
              <span className="w-28 shrink-0 text-xs text-stone-500">{k}</span>
              <input className={inputCls} value={v} onChange={(e) => set({ details: { ...draft.details, [k]: e.target.value } })} />
              <button
                onClick={() => {
                  const d = { ...draft.details };
                  delete d[k];
                  set({ details: d });
                }}
                className="p-1 text-stone-400"
                aria-label={`Remove ${k}`}
              >
                <X size={16} />
              </button>
            </div>
          ))}
          <div className="flex gap-2">
            <input className={inputCls} placeholder="Add a detail, e.g. Policy number" value={newField} onChange={(e) => setNewField(e.target.value)} />
            <button
              onClick={() => {
                if (!newField.trim()) return;
                set({ details: { ...draft.details, [newField.trim()]: '' } });
                setNewField('');
              }}
              className="rounded-xl bg-stone-100 px-3"
              aria-label="Add detail"
            >
              <Plus size={18} />
            </button>
          </div>
        </div>
      </div>

      <Field label="Notes">
        <textarea id="upkeep-notes" className={inputCls} rows={2} value={draft.notes} onChange={(e) => set({ notes: e.target.value })} />
      </Field>

      {draft.history.length > 0 && (
        <div>
          <p className="mb-1 text-sm font-medium text-stone-700">History</p>
          <p className="text-sm text-stone-500">{draft.history.slice(0, 8).join(' · ')}</p>
        </div>
      )}
    </Sheet>
  );
}

// "Renewed": asks for the new expiry date (defaults to a year on).
export function RenewSheet({ task, onClose }: { task: UpkeepTask; onClose: () => void }) {
  const store = useStore();
  const toast = useToast();
  const today = localDate();
  const base = task.dueDate && task.dueDate > today ? task.dueDate : today;
  const [due, setDue] = useState(addDays(base, 365));
  return (
    <Sheet
      title={`Renewed ${task.name.toLowerCase()}`}
      onClose={onClose}
      footer={
        <PrimaryButton
          className="w-full"
          disabled={!due}
          onClick={() => {
            store.saveUpkeep(markDone(task, today, due));
            toast(`${task.name} renewed until ${due}`, { label: 'Undo', run: () => store.saveUpkeep(task) });
            onClose();
          }}
        >
          Save
        </PrimaryButton>
      }
    >
      <Field label="New expiry date">
        <input id="renew-due" type="date" className={inputCls} value={due} min={today} onChange={(e) => setDue(e.target.value)} />
      </Field>
    </Sheet>
  );
}
