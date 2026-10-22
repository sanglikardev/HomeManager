import { Check, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { localDate } from '../lib/dates';
import { uid } from '../lib/id';
import { openTodos, setTodoDone, todoDueLabel, todoStatus, type TodoStatus } from '../lib/todos';
import { useStore } from '../store/store';
import type { Todo } from '../types';
import { useToast } from './toast';
import { ConfirmButton, Field, inputCls, PrimaryButton, Sheet } from './ui';

const DUE_CLS: Record<TodoStatus, string> = { overdue: 'text-rose-700', today: 'text-amber-700', soon: 'text-stone-600', later: 'text-stone-500', none: 'text-stone-400' };

export function TodosView() {
  const store = useStore();
  const toast = useToast();
  const today = localDate();
  const [editing, setEditing] = useState<Todo | 'new' | null>(null);
  const [showDone, setShowDone] = useState(false);
  const open = useMemo(() => openTodos(store.data.todos), [store.data.todos]);
  const done = useMemo(() => store.data.todos.filter((t) => t.done).sort((a, b) => (b.doneOn ?? '').localeCompare(a.doneOn ?? '')), [store.data.todos]);

  const tick = (t: Todo) => {
    store.saveTodo(setTodoDone(t, !t.done, today));
    if (!t.done) toast(`${t.title} done`, { label: 'Undo', run: () => store.saveTodo(t) });
  };

  const row = (t: Todo) => (
    <div key={t.id} className="flex items-center gap-3 px-4 py-3">
      <button onClick={() => tick(t)} aria-label={t.done ? `Not done: ${t.title}` : `Done: ${t.title}`}>
        <span className={`flex h-6 w-6 items-center justify-center rounded-full border ${t.done ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-stone-300'}`}>{t.done && <Check size={14} />}</span>
      </button>
      <button onClick={() => setEditing(t)} className="min-w-0 flex-1 text-left">
        <p className={`text-sm ${t.done ? 'text-stone-400 line-through' : 'text-stone-900'}`}>{t.title}</p>
        <p className={`text-xs ${t.done ? 'text-stone-400' : DUE_CLS[todoStatus(t, today)]}`}>{t.done ? 'Done' : todoDueLabel(t, today)}</p>
      </button>
    </div>
  );

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-stone-900">To-do</h1>
        <button onClick={() => setEditing('new')} className="flex items-center gap-1 rounded-xl bg-teal-700 px-3 py-2 text-sm font-semibold text-white">
          <Plus size={16} /> Task
        </button>
      </header>

      {!open.length ? (
        <button onClick={() => setEditing('new')} className="w-full rounded-2xl border border-dashed border-stone-300 p-4 text-left text-sm text-stone-600">
          Nothing to do. Add a task with a due date and it shows on Today and in the Plans calendar.
        </button>
      ) : (
        <div className="divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200">{open.map(row)}</div>
      )}

      {done.length > 0 && (
        <section>
          <button onClick={() => setShowDone((v) => !v)} className="text-sm font-medium text-stone-500">
            {showDone ? 'Hide' : 'Show'} done ({done.length})
          </button>
          {showDone && <div className="mt-2 divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200">{done.map(row)}</div>}
        </section>
      )}

      {editing && <TodoSheet todo={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

export function TodoSheet({ todo, date, onClose }: { todo: Todo | null; date?: string; onClose: () => void }) {
  const store = useStore();
  const [draft, setDraft] = useState<Todo>(todo ?? { id: uid(), title: '', dueDate: date ?? null, done: false, doneOn: null, notes: '', createdAt: new Date().toISOString() });
  const set = (patch: Partial<Todo>) => setDraft((d) => ({ ...d, ...patch }));
  const save = () => {
    if (!draft.title.trim()) return;
    store.saveTodo({ ...draft, title: draft.title.trim() });
    onClose();
  };
  return (
    <Sheet
      title={todo ? 'Edit task' : 'New task'}
      onClose={onClose}
      footer={
        <PrimaryButton className="w-full" disabled={!draft.title.trim()} onClick={save}>
          Save
        </PrimaryButton>
      }
    >
      <Field label="What needs doing">
        <input id="todo-title" className={inputCls} autoFocus placeholder="Call the plumber, renew passport…" value={draft.title} onChange={(e) => set({ title: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && save()} />
      </Field>
      <Field label="Due date (optional)">
        <div className="flex gap-2">
          <input id="todo-due" type="date" className={inputCls} value={draft.dueDate ?? ''} onChange={(e) => set({ dueDate: e.target.value || null })} />
          {draft.dueDate && (
            <button onClick={() => set({ dueDate: null })} className="shrink-0 rounded-xl bg-stone-100 px-3 text-sm font-medium text-stone-700">
              Clear
            </button>
          )}
        </div>
      </Field>
      <Field label="Notes (optional)">
        <textarea id="todo-notes" className={`${inputCls} h-20`} value={draft.notes} onChange={(e) => set({ notes: e.target.value })} />
      </Field>
      {todo && (
        <ConfirmButton
          label="Delete task"
          armedLabel="Tap again to delete"
          onConfirm={() => {
            store.deleteTodo(todo.id);
            onClose();
          }}
          className="mt-2 w-full rounded-2xl py-3 text-sm text-rose-600"
        />
      )}
    </Sheet>
  );
}
