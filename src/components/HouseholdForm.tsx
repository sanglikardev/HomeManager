import { Minus, Plus } from 'lucide-react';
import { WEEKDAYS, WEEKDAYS_SHORT } from '../lib/dates';
import { SLOTS, type Diet, type HouseholdSettings } from '../types';
import { Field, inputCls, Segmented, Toggle } from './ui';

export function HouseholdForm({ settings, onChange }: { settings: HouseholdSettings; onChange: (s: HouseholdSettings) => void }) {
  const set = (patch: Partial<HouseholdSettings>) => onChange({ ...settings, ...patch });
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <>
      <Field label="People eating at home">
        <div className="flex items-center gap-4">
          <button onClick={() => set({ people: Math.max(1, settings.people - 1) })} className="rounded-full bg-white p-2 ring-1 ring-stone-200" aria-label="Fewer people">
            <Minus size={18} />
          </button>
          <span className="w-8 text-center text-xl font-semibold">{settings.people}</span>
          <button onClick={() => set({ people: settings.people + 1 })} className="rounded-full bg-white p-2 ring-1 ring-stone-200" aria-label="More people">
            <Plus size={18} />
          </button>
        </div>
      </Field>
      <Field label="Food at home">
        <Segmented<Diet>
          value={settings.diet}
          onChange={(diet) => set({ diet })}
          options={[
            { value: 'veg', label: 'Veg' },
            { value: 'egg', label: 'Veg + egg' },
            { value: 'nonveg', label: 'Non-veg' },
          ]}
        />
      </Field>
      {settings.diet !== 'veg' && (
        <Field label="Veg-only days" hint="No egg or meat suggestions on these days.">
          <div className="grid grid-cols-7 gap-1">
            {WEEKDAYS_SHORT.map((d, i) => (
              <button
                key={d}
                onClick={() => set({ vegOnlyDays: toggle(settings.vegOnlyDays, i) })}
                className={`rounded-lg py-2 text-xs font-medium ${settings.vegOnlyDays.includes(i) ? 'bg-teal-700 text-white' : 'bg-white text-stone-600 ring-1 ring-stone-200'}`}
              >
                {d}
              </button>
            ))}
          </div>
        </Field>
      )}
      <Field label="Meals to plan">
        <div className="flex gap-1.5">
          {SLOTS.map((s) => (
            <button
              key={s}
              onClick={() => {
                const next = toggle(settings.slots, s);
                if (next.length) set({ slots: SLOTS.filter((x) => next.includes(x)) });
              }}
              className={`flex-1 rounded-xl py-2 text-sm font-medium capitalize ${settings.slots.includes(s) ? 'bg-teal-700 text-white' : 'bg-white text-stone-600 ring-1 ring-stone-200'}`}
            >
              {s}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Weekly grocery order day">
        <select className={inputCls} value={settings.weeklyOrderDay} onChange={(e) => set({ weeklyOrderDay: Number(e.target.value) })}>
          {WEEKDAYS.map((d, i) => (
            <option key={d} value={i}>
              {d}
            </option>
          ))}
        </select>
      </Field>
      <Toggle on={settings.cookAtHome} onChange={(v) => set({ cookAtHome: v })} label="A cook makes our food" />
    </>
  );
}
