import { Bug, CalendarDays, FileText, IndianRupee, ShoppingCart, UserRound, Wrench } from 'lucide-react';
import { useState } from 'react';
import { useStore } from '../store/store';
import type { Bucket } from '../types';
import { DocSheet } from './DocsView';
import { FeedbackSheet } from './FeedbackSheet';
import { QuickLeaveSheet } from './HelpView';
import { ExpenseSheet } from './MoneySheets';
import { PlanSheet } from './PlansView';
import { useToast } from './toast';
import { Field, inputCls, PrimaryButton, Segmented, Sheet } from './ui';
import { UpkeepSheet } from './UpkeepSheet';
import type { Dest } from './ComingUp';

type What = 'expense' | 'shopping' | 'upkeep' | 'plan' | 'leave' | 'doc' | 'feedback';

// The one "+" button: add anything from any screen.
export function QuickAdd({ onClose, onGo }: { onClose: () => void; onGo: (to: Dest) => void }) {
  const store = useStore();
  const [what, setWhat] = useState<What | null>(null);
  const done = () => {
    setWhat(null);
    onClose();
  };

  if (what === 'expense') return <ExpenseSheet expense={null} onClose={done} />;
  if (what === 'shopping') return <ShoppingAddSheet onClose={done} />;
  if (what === 'upkeep') return <UpkeepSheet task={null} onClose={done} />;
  if (what === 'plan') return <PlanSheet plan={null} onClose={done} onCreated={() => onGo('plans')} />;
  if (what === 'doc') return <DocSheet doc={null} onClose={done} />;
  if (what === 'leave') return <QuickLeaveSheet onClose={done} />;
  if (what === 'feedback') return <FeedbackSheet onClose={done} />;

  const options: { id: What; label: string; hint: string; icon: typeof Bug; cls: string }[] = [
    { id: 'expense', label: 'Expense', hint: 'Money spent', icon: IndianRupee, cls: 'bg-teal-50 text-teal-700' },
    { id: 'shopping', label: 'To buy', hint: 'Shopping list', icon: ShoppingCart, cls: 'bg-amber-50 text-amber-700' },
    { id: 'upkeep', label: 'Upkeep task', hint: 'Repeats or renews', icon: Wrench, cls: 'bg-rose-50 text-rose-700' },
    { id: 'plan', label: 'Plan or trip', hint: 'With a checklist', icon: CalendarDays, cls: 'bg-sky-50 text-sky-700' },
    { id: 'doc', label: 'Document', hint: 'Warranty, ID, policy', icon: FileText, cls: 'bg-indigo-50 text-indigo-700' },
  ];
  if (store.data.staff.some((s) => s.active)) options.push({ id: 'leave', label: 'Help day off', hint: 'Full or half day', icon: UserRound, cls: 'bg-stone-100 text-stone-700' });
  if (store.backend.mode === 'cloud') options.push({ id: 'feedback', label: 'Bug or idea', hint: 'For the app', icon: Bug, cls: 'bg-violet-50 text-violet-700' });

  return (
    <Sheet title="Add" onClose={onClose}>
      <div className="grid grid-cols-2 gap-2">
        {options.map((o) => {
          const Icon = o.icon;
          return (
            <button key={o.id} onClick={() => setWhat(o.id)} className="flex items-center gap-3 rounded-2xl bg-white p-3 text-left ring-1 ring-stone-200">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${o.cls}`}>
                <Icon size={20} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-stone-900">{o.label}</span>
                <span className="block truncate text-xs text-stone-500">{o.hint}</span>
              </span>
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}

function ShoppingAddSheet({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const toast = useToast();
  const [name, setName] = useState('');
  const [bucket, setBucket] = useState<Bucket>('quick');
  const add = () => {
    if (!name.trim()) return;
    store.addShopping(name, bucket);
    toast(`${name.trim()} added to the list`);
    onClose();
  };
  return (
    <Sheet
      title="Add to shopping list"
      onClose={onClose}
      footer={
        <PrimaryButton className="w-full" disabled={!name.trim()} onClick={add}>
          Add
        </PrimaryButton>
      }
    >
      <Field label="What">
        <input id="quick-shopping" className={inputCls} placeholder="Milk, bulbs, detergent…" value={name} autoFocus onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
      </Field>
      <Field label="When">
        <Segmented
          value={bucket}
          onChange={setBucket}
          options={[
            { value: 'quick', label: 'Today' },
            { value: 'weekly', label: 'Weekly order' },
          ]}
        />
      </Field>
    </Sheet>
  );
}
