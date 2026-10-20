import { ArrowLeft, Home } from 'lucide-react';
import { useMemo, useState } from 'react';
import { seedDishes, seedItems } from '../data/seed';
import { SEED_DISHES } from '../data/seedDishes';
import { inviteCode, uid } from '../lib/id';
import { allowedByDiet } from '../lib/suggest';
import { CATEGORIES, DEFAULT_SETTINGS, NONVEG_TAGS, type AppData, type Dish, type HouseholdSettings } from '../types';
import { HouseholdForm } from './HouseholdForm';
import { Field, inputCls, LevelPicker, PrimaryButton } from './ui';

type Step = 'home' | 'dishes' | 'pantry';

export function SetupWizard({ onDone, busy }: { onDone: (data: AppData) => void; busy?: boolean }) {
  const [step, setStep] = useState<Step>('home');
  const [name, setName] = useState('Our home');
  const [settings, setSettings] = useState<HouseholdSettings>(DEFAULT_SETTINGS);
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(SEED_DISHES.filter((d) => d.common).map((d) => d.name)));
  const [items] = useState(() => seedItems());
  const [levels, setLevels] = useState<Record<string, number>>({});

  // Dishes the diet allows, shaped like real dishes so the diet check is shared.
  const dietDishes = useMemo(
    () =>
      SEED_DISHES.filter((d) =>
        allowedByDiet({ tags: d.tags } as Dish, { ...settings, vegOnlyDays: [] }, '2026-01-01'),
      ),
    [settings],
  );

  const pantryItems = useMemo(() => {
    const hideMeat = settings.diet !== 'nonveg';
    return items.filter((i) => !(hideMeat && i.category === 'Meat & Fish') && !(settings.diet === 'veg' && i.name === 'Eggs'));
  }, [items, settings.diet]);

  const finish = () => {
    const now = new Date().toISOString();
    const allowedNames = new Set(dietDishes.map((d) => d.name));
    const finalItems = pantryItems.map((i) =>
      i.id in levels ? { ...i, level: levels[i.id], levelAt: now, confirmedAt: now, purchasedAt: levels[i.id] > 0 ? now : null } : i,
    );
    const active = new Set([...chosen].filter((n) => allowedNames.has(n)));
    const dishes = seedDishes(finalItems, active).filter((d) => !d.tags.some((t) => NONVEG_TAGS.includes(t)) || settings.diet === 'nonveg');
    onDone({
      household: { id: uid(), name: name.trim() || 'Our home', inviteCode: inviteCode(), settings: { ...settings, setupDone: true } },
      items: finalItems,
      dishes,
      meals: [],
      shopping: [],
      events: [],
      upkeep: [],
      plans: [],
      expenses: [],
      bills: [],
    });
  };

  const header = (title: string, sub: string, back?: Step) => (
    <div className="mb-5">
      {back ? (
        <button onClick={() => setStep(back)} className="mb-3 flex items-center gap-1 text-sm text-stone-500">
          <ArrowLeft size={16} /> Back
        </button>
      ) : (
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-700 text-white">
          <Home size={24} />
        </div>
      )}
      <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">Step {step === 'home' ? 1 : step === 'dishes' ? 2 : 3} of 3</p>
      <h1 className="text-2xl font-bold text-stone-900">{title}</h1>
      <p className="mt-1 text-sm text-stone-600">{sub}</p>
    </div>
  );

  return (
    <div className="mx-auto min-h-dvh max-w-lg px-4 pb-28 pt-8 pt-safe">
      {step === 'home' && (
        <>
          {header('Tell me about your home', 'This shapes what gets suggested. You can change all of it later.')}
          <Field label="Name">
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <HouseholdForm settings={settings} onChange={setSettings} />
          <BottomBar>
            <PrimaryButton className="w-full" onClick={() => setStep('dishes')}>
              Next: your usual dishes
            </PrimaryButton>
          </BottomBar>
        </>
      )}

      {step === 'dishes' && (
        <>
          {header('What do you usually cook?', 'Tick the dishes you make at home. I suggest only from these, and you can add your own later.', 'home')}
          {(['breakfast', 'lunch', 'dinner'] as const).map((slot) => {
            const list = dietDishes.filter((d) => d.slots[0] === slot);
            if (!list.length) return null;
            return (
              <section key={slot} className="mb-5">
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">{slot === 'breakfast' ? 'Breakfast' : slot === 'lunch' ? 'Lunch and dinner' : 'Dinner'}</h2>
                <div className="flex flex-wrap gap-2">
                  {list.map((d) => {
                    const on = chosen.has(d.name);
                    return (
                      <button
                        key={d.name}
                        onClick={() =>
                          setChosen((s) => {
                            const n = new Set(s);
                            if (on) n.delete(d.name);
                            else n.add(d.name);
                            return n;
                          })
                        }
                        className={`rounded-full px-3 py-1.5 text-sm ${on ? 'bg-teal-700 text-white' : 'bg-white text-stone-700 ring-1 ring-stone-200'}`}
                      >
                        {d.name}
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
          <BottomBar>
            <PrimaryButton className="w-full" onClick={() => setStep('pantry')}>
              Next: what's in the kitchen ({[...chosen].filter((n) => dietDishes.some((d) => d.name === n)).length} dishes)
            </PrimaryButton>
          </BottomBar>
        </>
      )}

      {step === 'pantry' && (
        <>
          {header("What's in the kitchen right now?", 'A rough guess is fine. Tap Out for anything you do not keep. Skip anything you are unsure of and I will ask about it later.', 'dishes')}
          {CATEGORIES.map((c) => {
            const list = pantryItems.filter((i) => i.category === c);
            if (!list.length) return null;
            return (
              <section key={c} className="mb-5">
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">{c}</h2>
                <div className="divide-y divide-stone-100 rounded-2xl bg-white ring-1 ring-stone-200">
                  {list.map((i) => (
                    <div key={i.id} className="px-3 py-2.5">
                      <p className="mb-1.5 text-sm font-medium text-stone-800">
                        {i.name} <span className="font-normal text-stone-400">· {i.packLabel}</span>
                      </p>
                      <LevelPicker size="sm" value={levels[i.id] ?? null} onPick={(v) => setLevels((l) => ({ ...l, [i.id]: v }))} />
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
          <BottomBar>
            <PrimaryButton className="w-full" onClick={finish} disabled={busy}>
              {busy ? 'Setting up…' : `Finish (${Object.keys(levels).length} of ${pantryItems.length} answered)`}
            </PrimaryButton>
          </BottomBar>
        </>
      )}
    </div>
  );
}

function BottomBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-10 border-t border-stone-200 bg-white/95 px-4 py-3 pb-safe backdrop-blur">
      <div className="mx-auto max-w-lg">{children}</div>
    </div>
  );
}
