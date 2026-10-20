import { Check, ChefHat, Send, Clock, HelpCircle, Plus, RotateCcw, ShoppingCart, Sparkles, Undo2, UtensilsCrossed } from 'lucide-react';
import { useMemo, useState } from 'react';
import { addDays, friendlyDate, localDate, parseLocalDate, WEEKDAYS } from '../lib/dates';
import { activeTrip } from '../lib/plans';
import { pickQuestions, type Question } from '../lib/questions';
import { suggest, type Suggestion } from '../lib/suggest';
import { useStore } from '../store/store';
import type { MealLog, Slot } from '../types';
import { AwayCard, ComingUpCard, type Go } from './ComingUp';
import { MealPickerSheet } from './MealPickerSheet';
import { useToast } from './toast';
import { LevelPicker, Segmented } from './ui';

const SLOT_LABEL: Record<Slot, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' };

export function TodayView({ onOpenShopping, onGo, settingsButton }: { onOpenShopping: () => void; onGo: Go; settingsButton?: React.ReactNode }) {
  const store = useStore();
  const { data } = store;
  const toast = useToast();
  const [day, setDay] = useState<'today' | 'tomorrow'>('today');
  const [picker, setPicker] = useState<Slot | null>(null);

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

  const recent = useMemo(
    () =>
      [...data.meals]
        .filter((m) => m.date < date && m.date >= addDays(date, -3))
        .sort((a, b) => (a.date === b.date ? slotOrder(b.slot) - slotOrder(a.slot) : b.date.localeCompare(a.date))),
    [data.meals, date],
  );

  const away = activeTrip(data.plans, date);
  const neededCount = data.shopping.filter((s) => s.status === 'needed').length;

  const cook = (slot: Slot, s: Suggestion) => {
    const id = store.logMeal({ date, slot, kind: 'cooked', dish: s.dish });
    toast(`${s.dish.name} logged. Pantry updated.`, { label: 'Undo', run: () => store.undoMeal(id) });
  };

  const addMissing = (items: Suggestion['missing']) => {
    items.forEach((i) => store.addShopping(i.name, i.bucket));
    toast(`Added ${items.length} item${items.length > 1 ? 's' : ''} to the shopping list`);
  };

  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between">
        <div>
          <p className="text-sm text-stone-500">{greeting}</p>
          <h1 className="text-2xl font-bold text-stone-900">
            {day === 'today' ? "Today's meals" : "Tomorrow's meals"}
          </h1>
          <p className="text-sm text-stone-500">{WEEKDAYS[parseLocalDate(date).getDay()]}{settings.vegOnlyDays.includes(parseLocalDate(date).getDay()) ? ' · veg only' : ''}</p>
        </div>
        <div className="flex w-52 items-center gap-2">
          <div className="flex-1">
          <Segmented
            value={day}
            onChange={setDay}
            options={[
              { value: 'today', label: 'Today' },
              { value: 'tomorrow', label: 'Tomorrow' },
            ]}
          />
          </div>
          {settingsButton}
        </div>
      </header>

      {away && <AwayCard date={date} />}

      {!away && day === 'today' && questions.length > 0 && <QuestionsCard questions={questions} />}

      {!away && settings.slots.map((slot) => (
        <section key={slot}>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-stone-500">{SLOT_LABEL[slot]}</h2>
          {logged[slot] ? (
            <LoggedCard meal={logged[slot]!} onUndo={() => store.undoMeal(logged[slot]!.id)} />
          ) : bySlot[slot]?.length ? (
            <div className="space-y-2">
              <SuggestionCard s={bySlot[slot][0]} top preview={day === 'tomorrow'} onCook={() => cook(slot, bySlot[slot][0])} onAddMissing={addMissing} />
              {bySlot[slot].slice(1).map((s) => (
                <SuggestionCard key={s.dish.id} s={s} preview={day === 'tomorrow'} onCook={() => cook(slot, s)} onAddMissing={addMissing} />
              ))}
              {day === 'today' && (
                <button onClick={() => setPicker(slot)} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-stone-300 py-3 text-sm font-medium text-stone-600 hover:bg-white">
                  <UtensilsCrossed size={16} /> Something else, ordered in, or leftovers
                </button>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-4 text-sm text-stone-500">
              No {SLOT_LABEL[slot].toLowerCase()} dishes in your rotation yet. Add some under Kitchen, Dishes.
              {day === 'today' && (
                <button onClick={() => setPicker(slot)} className="mt-2 block font-medium text-teal-700">
                  Log what you ate
                </button>
              )}
            </div>
          )}
        </section>
      ))}

      {settings.cookAtHome && settings.slots.some((s) => logged[s]?.kind === 'cooked') && (
        <a
          href={`https://wa.me/?text=${encodeURIComponent(
            `Menu for ${day === 'today' ? 'today' : 'tomorrow'}\n` +
              settings.slots
                .filter((s) => logged[s]?.kind === 'cooked')
                .map((s) => `${SLOT_LABEL[s]}: ${logged[s]!.label} (for ${logged[s]!.servings})`)
                .join('\n'),
          )}`}
          target="_blank"
          rel="noreferrer"
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white py-3 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-200"
        >
          <Send size={16} /> Send the menu to the cook
        </a>
      )}

      <ComingUpCard today={today} onGo={onGo} />

      {neededCount > 0 && (
        <button onClick={onOpenShopping} className="flex w-full items-center gap-3 rounded-2xl bg-amber-50 p-4 text-left ring-1 ring-amber-200">
          <ShoppingCart className="text-amber-600" size={22} />
          <div className="flex-1">
            <p className="font-semibold text-amber-900">{neededCount} thing{neededCount > 1 ? 's' : ''} to buy</p>
            <p className="text-sm text-amber-800">Tap to see the shopping list</p>
          </div>
        </button>
      )}

      {recent.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-500">Recently eaten</h2>
          <div className="divide-y divide-stone-100 rounded-2xl bg-white ring-1 ring-stone-200">
            {recent.map((m) => (
              <div key={m.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="text-stone-800">{m.label || kindLabel(m)}</span>
                <span className="text-stone-500">
                  {friendlyDate(m.date, date)} · {SLOT_LABEL[m.slot].toLowerCase()}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {picker && <MealPickerSheet slot={picker} date={date} onClose={() => setPicker(null)} />}
    </div>
  );
}

function slotOrder(s: Slot) {
  return s === 'breakfast' ? 0 : s === 'lunch' ? 1 : 2;
}

function kindLabel(m: MealLog) {
  return m.kind === 'out' ? 'Ate out' : m.kind === 'leftovers' ? 'Leftovers' : m.kind === 'skipped' ? 'Skipped' : 'Cooked';
}

function SuggestionCard({ s, top, preview, onCook, onAddMissing }: { s: Suggestion; top?: boolean; preview?: boolean; onCook: () => void; onAddMissing: (items: Suggestion['missing']) => void }) {
  if (!top) {
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 ring-1 ring-stone-200">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-stone-900">{s.dish.name}</p>
          <p className="truncate text-xs text-stone-500">{s.reasons.join(' · ') || `${s.dish.cookMinutes} min`}</p>
        </div>
        {preview ? (
          s.missing.length > 0 && (
            <button onClick={() => onAddMissing(s.missing)} className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800" aria-label={`Add missing for ${s.dish.name}`}>
              + Missing
            </button>
          )
        ) : (
          <button onClick={onCook} className="rounded-xl bg-stone-100 px-3 py-2 text-sm font-semibold text-stone-800 hover:bg-stone-200">
            Pick
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-stone-200">
      <div className="bg-gradient-to-br from-teal-700 to-teal-600 px-5 py-4 text-white">
        <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-teal-100">
          <Sparkles size={14} /> Top pick
        </p>
        <h3 className="mt-1 text-xl font-semibold">{s.dish.name}</h3>
        <p className="mt-0.5 flex items-center gap-1 text-sm text-teal-100">
          <Clock size={14} /> {s.dish.cookMinutes} min
        </p>
      </div>
      <div className="space-y-3 px-5 py-4">
        {s.reasons.length > 0 && (
          <ul className="space-y-1 text-sm text-stone-600">
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
            <button onClick={onCook} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-teal-700 py-3 font-semibold text-white hover:bg-teal-800">
              <ChefHat size={18} /> Cook this
            </button>
          )}
          {s.missing.length > 0 && (
            <button onClick={() => onAddMissing(s.missing)} className={`flex items-center justify-center gap-1 rounded-2xl bg-amber-50 px-3 py-3 text-sm font-semibold text-amber-800 ring-1 ring-amber-200 ${preview ? 'flex-1' : ''}`}>
              <Plus size={16} /> Add missing
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function LoggedCard({ meal, onUndo }: { meal: MealLog; onUndo: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-emerald-50 px-4 py-3 ring-1 ring-emerald-200">
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-white">
        <Check size={18} />
      </span>
      <div className="flex-1">
        <p className="font-medium text-emerald-950">{meal.label || kindLabel(meal)}</p>
        <p className="text-xs text-emerald-800">
          {meal.kind === 'cooked' ? `Cooked for ${meal.servings}` : kindLabel(meal)}
        </p>
      </div>
      <button onClick={onUndo} className="flex items-center gap-1 rounded-xl px-2 py-1.5 text-sm text-emerald-800 hover:bg-emerald-100">
        <Undo2 size={15} /> Undo
      </button>
    </div>
  );
}

function QuestionsCard({ questions }: { questions: Question[] }) {
  const store = useStore();
  return (
    <section className="rounded-3xl bg-violet-50 p-4 ring-1 ring-violet-200">
      <h2 className="mb-3 flex items-center gap-2 font-semibold text-violet-950">
        <HelpCircle size={18} className="text-violet-600" /> Quick check
      </h2>
      <div className="space-y-4">
        {questions.map((q) => (
          <div key={q.item.id}>
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
          </div>
        ))}
      </div>
    </section>
  );
}
