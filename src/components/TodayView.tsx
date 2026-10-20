import { CalendarDays, Check, ChefHat, ChevronDown, Clock, HelpCircle, Plus, RotateCcw, Send, ShoppingCart, Sparkles, Undo2, UserRound, UtensilsCrossed, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { addDays, localDate, parseLocalDate, WEEKDAYS } from '../lib/dates';
import { billsDue, budgetState, monthOf, summarize } from '../lib/money';
import { activeTrip, countdown, upcomingPlans } from '../lib/plans';
import { pickQuestions, type Question } from '../lib/questions';
import { suggest, type Suggestion } from '../lib/suggest';
import { offToday } from '../lib/staff';
import { mealPlanOfDay } from '../lib/today';
import { useStore } from '../store/store';
import type { MealLog, Slot } from '../types';
import { AwayCard, TodoCard, type Go } from './ComingUp';
import { MealPickerSheet } from './MealPickerSheet';
import { useToast } from './toast';
import { LevelPicker } from './ui';

const SLOT_LABEL: Record<Slot, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' };

export function TodayView({ onGo, actions }: { onGo: Go; actions?: React.ReactNode }) {
  const store = useStore();
  const { data } = store;
  const toast = useToast();
  const [day, setDay] = useState<'today' | 'tomorrow'>('today');
  const [picker, setPicker] = useState<Slot | null>(null);
  const [others, setOthers] = useState(false);
  const [opened, setOpened] = useState<Slot | null>(null);

  const today = localDate();
  const date = day === 'today' ? today : addDays(today, 1);
  const settings = data.household.settings;
  const now = useMemo(() => new Date(), [data]);

  const bySlot = useMemo(() => {
    const out = {} as Record<Slot, Suggestion[]>;
    const offered = new Set<string>();
    for (const slot of settings.slots) {
      out[slot] = suggest({ dishes: data.dishes, items: data.items, meals: data.meals, settings, date, slot, now, exclude: offered });
      out[slot].forEach((s) => offered.add(s.dish.id));
    }
    return out;
  }, [data, settings, date, now]);

  const logged = useMemo(() => {
    const m = {} as Record<Slot, MealLog | undefined>;
    for (const meal of data.meals) if (meal.date === date) m[meal.slot] = meal;
    return m;
  }, [data.meals, date]);

  const questions = useMemo(() => {
    const relevant = new Set<string>();
    for (const slot of settings.slots) {
      if (logged[slot]) continue;
      bySlot[slot]?.forEach((s) => s.dish.ingredients.forEach((i) => relevant.add(i.itemId)));
    }
    return pickQuestions(data.items, relevant, now);
  }, [data.items, bySlot, logged, settings.slots, now]);

  const minutes = day === 'today' ? now.getHours() * 60 + now.getMinutes() : 0;
  const plan = mealPlanOfDay(settings.slots, logged, minutes);
  const away = activeTrip(data.plans, date);

  const neededCount = data.shopping.filter((s) => s.status === 'needed').length;
  const billCount = billsDue(data.bills, today).length;
  const off = offToday(data.staff, today);
  const budget = budgetState(summarize(data.expenses, monthOf(today)).total, settings.monthlyBudget);
  const budgetWarn = budget && budget.level !== 'ok' ? budget : null;
  const nextPlan = upcomingPlans(data.plans, today).find((p) => p.startDate > today);

  const cook = (slot: Slot, s: Suggestion) => {
    const id = store.logMeal({ date, slot, kind: 'cooked', dish: s.dish });
    setOthers(false);
    setOpened(null);
    toast(`${s.dish.name} logged. Pantry updated.`, { label: 'Undo', run: () => store.undoMeal(id) });
  };

  const addMissing = (items: Suggestion['missing']) => {
    items.forEach((i) => store.addShopping(i.name, i.bucket));
    toast(`Added ${items.length} item${items.length > 1 ? 's' : ''} to the shopping list`);
  };

  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const preview = day === 'tomorrow';
  const loggedSlots = settings.slots.filter((s) => logged[s]);
  const cooked = settings.slots.filter((s) => logged[s]?.kind === 'cooked');

  const slotBlock = (slot: Slot, showOthers: boolean, toggleOthers: () => void) => {
    const list = bySlot[slot] ?? [];
    if (!list.length)
      return (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-4 text-sm text-stone-500">
          No {SLOT_LABEL[slot].toLowerCase()} dishes in your rotation yet. Add some under Food, Dishes.
          {!preview && (
            <button onClick={() => setPicker(slot)} className="mt-2 block font-medium text-teal-700">
              Log what you ate
            </button>
          )}
        </div>
      );
    return (
      <div className="space-y-1.5">
        <SuggestionCard s={list[0]} top preview={preview} onCook={() => cook(slot, list[0])} onAddMissing={addMissing} />
        {showOthers ? (
          <>
            {list.slice(1).map((s) => (
              <SuggestionCard key={s.dish.id} s={s} preview={preview} onCook={() => cook(slot, s)} onAddMissing={addMissing} />
            ))}
            {!preview && (
              <button onClick={() => setPicker(slot)} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-stone-300 py-2 text-xs font-medium text-stone-600">
                <UtensilsCrossed size={16} /> Something else, ordered in, or leftovers
              </button>
            )}
          </>
        ) : (
          <button onClick={toggleOthers} className="w-full py-1 text-center text-sm font-medium text-teal-700">
            Other ideas{list.length > 1 ? ` (${list.length - 1})` : ''}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <header>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-stone-500">{greeting}</p>
            <h1 className="text-2xl font-bold text-stone-900">{longDate(today)}</h1>
          </div>
          <div className="shrink-0">{actions}</div>
        </div>
        {(billCount > 0 || neededCount > 0 || nextPlan || budgetWarn || off.length > 0) && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {billCount > 0 && (
              <Chip onClick={() => onGo('money')} cls="bg-rose-50 text-rose-800 ring-rose-200">
                <Wallet size={13} /> {billCount} bill{billCount > 1 ? 's' : ''} due
              </Chip>
            )}
            {budgetWarn && (
              <Chip onClick={() => onGo('money')} cls="bg-rose-50 text-rose-800 ring-rose-200">
                <Wallet size={13} /> {budgetWarn.level === 'over' ? 'Over budget' : `${budgetWarn.pct}% of budget used`}
              </Chip>
            )}
            {neededCount > 0 && (
              <Chip onClick={() => onGo('shopping')} cls="bg-amber-50 text-amber-900 ring-amber-200">
                <ShoppingCart size={13} /> {neededCount} to buy
              </Chip>
            )}
            {off.map((o) => (
              <Chip key={o.staff.id} onClick={() => onGo('help')} cls="bg-stone-100 text-stone-700 ring-stone-200">
                <UserRound size={13} /> {o.staff.name} {o.kind === 'half' ? 'half day today' : 'off today'}
              </Chip>
            ))}
            {nextPlan && (
              <Chip onClick={() => onGo('plans')} cls="bg-sky-50 text-sky-900 ring-sky-200">
                <CalendarDays size={13} /> {nextPlan.title} · {countdown(nextPlan, today).toLowerCase()}
              </Chip>
            )}
          </div>
        )}
      </header>

      {away && <AwayCard date={date} />}

      {!away && (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">{plan.focus ? (preview ? `Tomorrow · ${SLOT_LABEL[plan.focus]}` : SLOT_LABEL[plan.focus]) : 'Meals'}</h2>
            <div className="flex rounded-lg bg-stone-100 p-0.5 text-xs font-medium">
              {(['today', 'tomorrow'] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => {
                    setDay(d);
                    setOthers(false);
                    setOpened(null);
                  }}
                  className={`rounded-md px-2.5 py-1 ${day === d ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500'}`}
                >
                  {d === 'today' ? 'Today' : 'Tomorrow'}
                </button>
              ))}
            </div>
          </div>

          {loggedSlots.length > 0 && (
            <div className="mb-2 space-y-1.5">
              {loggedSlots.map((s) => (
                <LoggedRow key={s} slot={s} meal={logged[s]!} onUndo={() => store.undoMeal(logged[s]!.id)} />
              ))}
            </div>
          )}

          {plan.focus ? (
            slotBlock(plan.focus, others, () => setOthers(true))
          ) : (
            !plan.missed.length && <p className="rounded-2xl bg-white p-4 text-sm text-stone-600 ring-1 ring-stone-200">All meals sorted for today. Tap Tomorrow to plan ahead.</p>
          )}

          {(plan.later.length > 0 || plan.missed.length > 0) && (
            <div className="mt-2 divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200">
              {plan.later.map((slot) =>
                opened === slot ? (
                  <div key={slot} className="p-2">
                    <p className="px-2 pb-1.5 text-xs font-semibold uppercase tracking-wide text-stone-500">{SLOT_LABEL[slot]}</p>
                    {slotBlock(slot, true, () => {})}
                  </div>
                ) : (
                  <button key={slot} onClick={() => setOpened(slot)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                    <span className="w-20 text-xs font-semibold uppercase tracking-wide text-stone-500">{SLOT_LABEL[slot]}</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-stone-800">{bySlot[slot]?.[0]?.dish.name ?? 'No ideas yet'}</span>
                    <ChevronDown size={16} className="text-stone-400" />
                  </button>
                ),
              )}
              {plan.missed.map((slot) => (
                <button key={slot} onClick={() => setPicker(slot)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                  <span className="w-20 text-xs font-semibold uppercase tracking-wide text-stone-400">{SLOT_LABEL[slot]}</span>
                  <span className="flex-1 text-sm text-stone-400">Not logged</span>
                  <span className="text-sm font-medium text-teal-700">Log it</span>
                </button>
              ))}
            </div>
          )}

          {settings.cookAtHome && cooked.length > 0 && (
            <a
              href={`https://wa.me/?text=${encodeURIComponent(
                `Menu for ${preview ? 'tomorrow' : 'today'}\n` + cooked.map((s) => `${SLOT_LABEL[s]}: ${logged[s]!.label} (for ${logged[s]!.servings})`).join('\n'),
              )}`}
              target="_blank"
              rel="noreferrer"
              className="mt-2 flex items-center justify-center gap-1.5 py-1 text-sm font-medium text-emerald-700"
            >
              <Send size={14} /> Send the menu to the cook
            </a>
          )}
        </section>
      )}

      {!away && !preview && questions.length > 0 && <QuestionsCard questions={questions} />}

      <TodoCard date={date} onGo={onGo} />

      {picker && <MealPickerSheet slot={picker} date={date} onClose={() => setPicker(null)} />}
    </div>
  );
}

function longDate(date: string) {
  const d = parseLocalDate(date);
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${d.toLocaleString('en-IN', { month: 'short' })}`;
}

function Chip({ onClick, cls, children }: { onClick: () => void; cls: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${cls}`}>
      {children}
    </button>
  );
}

function kindLabel(m: MealLog) {
  return m.kind === 'out' ? 'Ate out' : m.kind === 'leftovers' ? 'Leftovers' : m.kind === 'skipped' ? 'Skipped' : 'Cooked';
}

function SuggestionCard({ s, top, preview, onCook, onAddMissing }: { s: Suggestion; top?: boolean; preview?: boolean; onCook: () => void; onAddMissing: (items: Suggestion['missing']) => void }) {
  if (!top) {
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-white px-3 py-2 ring-1 ring-stone-200">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-stone-900">{s.dish.name}</p>
          <p className="truncate text-xs text-stone-500">{s.reasons.join(' · ') || `${s.dish.cookMinutes} min`}</p>
        </div>
        {preview ? (
          s.missing.length > 0 && (
            <button onClick={() => onAddMissing(s.missing)} className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800" aria-label={`Add missing for ${s.dish.name}`}>
              + Missing
            </button>
          )
        ) : (
          <button onClick={onCook} className="rounded-xl bg-stone-100 px-3 py-1.5 text-sm font-semibold text-stone-800 hover:bg-stone-200">
            Pick
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-stone-200">
      <div className="bg-gradient-to-br from-teal-700 to-teal-600 px-4 py-2.5 text-white">
        <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-teal-100">
          <Sparkles size={14} /> Top pick
        </p>
        <h3 className="text-lg font-semibold leading-tight">{s.dish.name}</h3>
        <p className="flex items-center gap-1 text-xs text-teal-100">
          <Clock size={14} /> {s.dish.cookMinutes} min
        </p>
      </div>
      <div className="space-y-2 px-4 py-3">
        {s.reasons.length > 0 && (
          <ul className="space-y-0.5 text-xs text-stone-600">
            {s.reasons.map((r) => (
              <li key={r} className="flex gap-2">
                <span className={r.startsWith('Needs') ? 'text-amber-600' : 'text-teal-600'}>•</span>
                <span className={r.startsWith('Needs') ? 'text-amber-800' : ''}>{r}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          {!preview && (
            <button onClick={onCook} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-teal-700 py-2.5 text-sm font-semibold text-white hover:bg-teal-800">
              <ChefHat size={18} /> Cook this
            </button>
          )}
          {s.missing.length > 0 && (
            <button onClick={() => onAddMissing(s.missing)} className={`flex items-center justify-center gap-1 rounded-2xl bg-amber-50 px-3 py-2.5 text-sm font-semibold text-amber-800 ring-1 ring-amber-200 ${preview ? 'flex-1' : ''}`}>
              <Plus size={16} /> Add missing
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function LoggedRow({ slot, meal, onUndo }: { slot: Slot; meal: MealLog; onUndo: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-emerald-50 px-3 py-2 ring-1 ring-emerald-200">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-white">
        <Check size={14} />
      </span>
      <p className="min-w-0 flex-1 truncate text-sm text-emerald-950">
        <span className="text-emerald-800">{SLOT_LABEL[slot]}:</span> {meal.label || kindLabel(meal)}
      </p>
      <button onClick={onUndo} aria-label={`Undo ${SLOT_LABEL[slot].toLowerCase()}`} className="rounded-lg p-1.5 text-emerald-800">
        <Undo2 size={15} />
      </button>
    </div>
  );
}

function QuestionsCard({ questions }: { questions: Question[] }) {
  const store = useStore();
  const q = questions[0];
  return (
    <section className="rounded-3xl bg-violet-50 p-4 ring-1 ring-violet-200">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-violet-950">
        <HelpCircle size={16} className="text-violet-600" /> Quick check
        {questions.length > 1 && <span className="ml-auto text-xs font-normal text-violet-700">{questions.length} left</span>}
      </h2>
      <p className="mb-2 text-sm text-violet-950">{q.text}</p>
      {q.kind === 'fresh' ? (
        <div className="grid grid-cols-3 gap-1.5 text-sm">
          <button onClick={() => store.setItemLevel(q.item.id, Math.max(0.2, q.item.level), 'correction')} className="rounded-xl border border-violet-200 bg-white py-2 font-medium text-stone-700">
            Still good
          </button>
          <button onClick={() => store.setItemLevel(q.item.id, 0, 'correction')} className="rounded-xl border border-violet-200 bg-white py-2 font-medium text-stone-700">
            Finished
          </button>
          <button onClick={() => store.setItemLevel(q.item.id, 0, 'spoiled')} className="rounded-xl border border-violet-200 bg-white py-2 font-medium text-stone-700">
            Threw away
          </button>
        </div>
      ) : (
        <LevelPicker value={null} onPick={(v) => store.setItemLevel(q.item.id, v, 'correction')} size="sm" />
      )}
      <button onClick={() => store.skipQuestion(q.item.id)} className="mt-1.5 flex items-center gap-1 text-xs text-violet-700">
        <RotateCcw size={12} /> Ask me later
      </button>
    </section>
  );
}
