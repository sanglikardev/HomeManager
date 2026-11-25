// Homie's training card: today's gym or knee rehab session, ticks, knee feel. Private to the signed-in person.
import { Check, Dumbbell } from 'lucide-react';
import { useState } from 'react';
import { localToday, WEEKDAYS, type HomieSettings } from '../lib/homie';
import { addDays, cleanWorkout, todaySession, weekStrip, type Workout } from '../lib/training';
import { saveHomieSettings, saveWorkout, type HomieData } from '../store/homie';
import { useToast } from './toast';
import { PrimaryButton } from './ui';

const SHORT: Record<string, string> = { lowerA: 'Legs A', lowerB: 'Legs B', upper: 'Upper', condition: 'Cardio', rehab: 'Knee', rest: 'Rest' };

export function TrainingCard({ data, onChange }: { data: HomieData; onChange: (d: HomieData) => void }) {
  const s = data.settings;
  if (!s.trainingStart) return <StartTraining data={data} onChange={onChange} />;
  return <Today data={data} onChange={onChange} />;
}

function StartTraining({ data, onChange }: { data: HomieData; onChange: (d: HomieData) => void }) {
  const toast = useToast();
  const [days, setDays] = useState<number[]>(data.settings.gymDays);
  const start = async () => {
    const next: HomieSettings = { ...data.settings, gymDays: [...days].sort(), trainingStart: localToday(data.settings.tzOffsetMin) };
    try {
      await saveHomieSettings(next);
      onChange({ ...data, settings: next });
      toast('Training plan started');
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <section className="rounded-2xl bg-white p-4 ring-1 ring-stone-200">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold">
        <Dumbbell size={15} /> Training plan
      </h3>
      <p className="mt-1 text-sm text-stone-600">
        Gym plus knee rehab in phases (control, strength, power, ski-ready) toward {data.settings.goalDate.slice(0, 7) === '2028-01' ? 'the January 2028 ski trip' : data.settings.goalDate}. Short knee sessions on other days. Knee pain scales the day down.
      </p>
      <p className="mb-1 mt-3 text-xs font-medium text-stone-500">Gym days</p>
      <div className="flex gap-1">
        {WEEKDAYS.map((d, i) => {
          const on = days.includes(i);
          return (
            <button key={d} onClick={() => setDays(on ? days.filter((x) => x !== i) : [...days, i])} className={`flex-1 rounded-lg py-2 text-xs font-semibold ${on ? 'bg-teal-700 text-white' : 'bg-stone-100 text-stone-600'}`}>
              {d}
            </button>
          );
        })}
      </div>
      <PrimaryButton onClick={start} disabled={days.length < 2 || days.length > 6} className="mt-3 w-full">
        Start my plan
      </PrimaryButton>
      <p className="mt-2 text-xs text-stone-500">Show the plan to your physio once before you start the jumps (from week 25).</p>
    </section>
  );
}

function Today({ data, onChange }: { data: HomieData; onChange: (d: HomieData) => void }) {
  const toast = useToast();
  const s = data.settings;
  const today = localToday(s.tzOffsetMin);
  const others = data.workouts.filter((w) => w.date !== today);
  const t = todaySession(s, today, others);
  const log = data.workouts.find((w) => w.date === today);
  const [open, setOpen] = useState(false);
  if (!t) return null;
  const done = new Set(log?.done ?? []);
  const keys = t.exercises.map((e) => e.key);

  const save = async (patch: Partial<Workout>) => {
    const nextDone = patch.done ?? log?.done ?? [];
    const w = cleanWorkout({
      date: today,
      session: t.type,
      done: nextDone,
      complete: keys.every((k) => nextDone.includes(k)),
      knee: patch.knee !== undefined ? patch.knee : (log?.knee ?? null),
      note: log?.note ?? '',
    });
    onChange({ ...data, workouts: [...others, w] });
    try {
      await saveWorkout(w);
      if (w.complete && !log?.complete) toast('Session done. Logged.');
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    }
  };
  const tick = (k: string) => save({ done: done.has(k) ? [...done].filter((x) => x !== k) : [...done, k] });
  const strip = weekStrip(s, today, data.workouts);

  return (
    <section className="rounded-2xl bg-white p-4 ring-1 ring-stone-200">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <Dumbbell size={15} /> {t.title}
          </h3>
          <p className="text-xs text-stone-500">
            {t.minutes} min · {t.phaseLabel} · week {t.week}
            {t.weeksToGoal ? ` · ${t.weeksToGoal} weeks to go` : ''}
          </p>
        </div>
        {log?.complete && <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-800">Done</span>}
      </div>
      {t.note && <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">{t.note}</p>}

      <ul className="mt-3 divide-y divide-stone-100">
        {t.exercises.map((e) => (
          <li key={e.key}>
            <button onClick={() => tick(e.key)} className="flex w-full items-start gap-3 py-2.5 text-left">
              <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ring-1 ${done.has(e.key) ? 'bg-teal-700 text-white ring-teal-700' : 'ring-stone-300'}`}>
                {done.has(e.key) && <Check size={14} />}
              </span>
              <span className="min-w-0">
                <span className={`block text-sm font-medium ${done.has(e.key) ? 'text-stone-400 line-through' : 'text-stone-900'}`}>{e.name}</span>
                <span className="block text-xs text-stone-500">
                  {e.dose}
                  {open ? ` · ${e.cue}` : ''}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <button onClick={() => setOpen(!open)} className="mt-1 text-xs font-semibold text-teal-700">
        {open ? 'Hide tips' : 'Show tips'}
      </button>
      {!log?.complete && (
        <button onClick={() => save({ done: keys })} className="ml-4 mt-1 text-xs font-semibold text-teal-700">
          Mark all done
        </button>
      )}

      <p className="mb-1 mt-4 text-xs font-medium text-stone-500">How did the knee feel? (0 = fine, 10 = worst)</p>
      <div className="flex gap-1">
        {Array.from({ length: 11 }, (_, n) => (
          <button
            key={n}
            onClick={() => save({ knee: log?.knee === n ? null : n })}
            className={`h-8 flex-1 rounded-md text-xs font-semibold ${log?.knee === n ? (n >= 6 ? 'bg-rose-600 text-white' : n >= 4 ? 'bg-amber-500 text-white' : 'bg-teal-700 text-white') : 'bg-stone-100 text-stone-600'}`}
          >
            {n}
          </button>
        ))}
      </div>
      {log?.knee != null && log.knee >= 6 && <p className="mt-2 text-xs text-rose-700">That's a lot of pain. Rest it and get your physio to check it before the next leg day.</p>}

      <div className="mt-4 grid grid-cols-7 gap-1 text-center">
        {strip.map((d) => (
          <div key={d.date} className={`rounded-lg py-1.5 text-[10px] leading-tight ${d.done ? 'bg-teal-700 text-white' : d.partial ? 'bg-teal-100 text-teal-900' : d.date < s.trainingStart || d.date === today ? 'bg-stone-50 text-stone-400' : 'bg-stone-100 text-stone-500'}`}>
            <div className="font-semibold">{WEEKDAYS[new Date(`${d.date}T00:00:00Z`).getUTCDay()]}</div>
            <div>{SHORT[d.type]}</div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-stone-400">Last 7 days. Tomorrow: {SHORT[todaySession(s, addDays(today, 1), data.workouts)?.type ?? 'rest']}.</p>
    </section>
  );
}
