import { ArrowLeft, Bell, Brain, Check, Copy, Lightbulb, Mic, Send, Settings, Sparkles, Trash2, Undo2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { cleanInterests, DEFAULT_HOMIE, friendlyWhen, localToUtc, sortItems, WEEKDAYS, type HomieAction, type HomieChatLine, type HomieItem, type HomieSettings } from '../lib/homie';
import { askHomie, clearHomieChat, homieLockState, loadHomie, lockHomie, makeSiriKey, setHomiePin, unlockHomieFromApp, saveHomieItem, saveHomieSettings, type HomieData } from '../store/homie';
import { useStore } from '../store/store';
import { TrainingCard } from './HomieTraining';
import { useToast } from './toast';
import { ConfirmButton, Field, inputCls, PrimaryButton, Segmented, Sheet, Toggle } from './ui';

const STARTERS = [
  "What's on my plate today?",
  'Remind me to do knee exercises at 7 pm',
  'I go to the gym Monday, Wednesday and Friday mornings',
  'Remember: my wife loves window seats',
];

const HOUSE_ACTIONS: HomieAction['kind'][] = ['todo', 'shopping', 'expense', 'habit'];

interface Line extends HomieChatLine {
  actions?: HomieAction[];
  pending?: boolean;
}

// The browser's speech-to-text, where there is one (Safari and Chrome have it under webkit).
type Recognition = { lang: string; interimResults: boolean; start(): void; stop(): void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };
const SpeechCtor = (): (new () => Recognition) | null => {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

export function HomieView({ onBack }: { onBack: () => void }) {
  const store = useStore();
  const toast = useToast();
  const [data, setData] = useState<HomieData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [sheet, setSheet] = useState<'knows' | 'settings' | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const recRef = useRef<Recognition | null>(null);
  const cloud = store.backend.mode === 'cloud';
  // Without an API key on the server, the talking happens in the Claude app through the connector.
  const [ai, setAi] = useState<boolean | null>(null);
  useEffect(() => {
    fetch('/api/homie/status')
      .then((r) => r.json() as Promise<{ ai: boolean }>)
      .then((r) => setAi(r.ai))
      .catch(() => setAi(false));
  }, []);

  const refresh = useCallback(async () => {
    try {
      const d = await loadHomie();
      if (d.firstTime) await saveHomieSettings(d.settings); // so briefs start with the default routine
      setData(d);
      setLines(d.chat);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    if (cloud) refresh();
  }, [cloud, refresh]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [lines]);

  const send = async (raw: string) => {
    const msg = raw.trim();
    if (!msg || busy) return;
    setText('');
    setBusy(true);
    const at = new Date().toISOString();
    setLines((l) => [...l, { role: 'user', text: msg, at }, { role: 'assistant', text: '', at, pending: true }]);
    const res = await askHomie(msg);
    let reply: Line;
    if (res.ok) {
      reply = { role: 'assistant', text: res.reply, at: new Date().toISOString(), actions: res.actions };
      if (res.actions.some((a) => HOUSE_ACTIONS.includes(a.kind))) store.reload().catch(() => {});
      if (res.actions.length) loadHomie().then((d) => setData(d)).catch(() => {});
    } else {
      const why =
        res.reason === 'not_configured'
          ? "I'm not switched on yet: the Claude API key still needs to be added to the app's server."
          : res.reason === 'offline'
            ? "I can't reach the server. Check your connection and try again."
            : res.reason === 'signin'
              ? 'Please sign in again.'
              : `Something went wrong${res.message ? ` (${res.message})` : ''}. Try again in a minute.`;
      reply = { role: 'assistant', text: why, at: new Date().toISOString() };
    }
    setLines((l) => [...l.filter((x) => !x.pending), reply]);
    setBusy(false);
  };

  const listen = () => {
    const Ctor = SpeechCtor();
    if (!Ctor) return;
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const rec = new Ctor();
    rec.lang = 'en-IN';
    rec.interimResults = false;
    rec.onresult = (e) => {
      const said = Array.from(e.results)
        .map((r) => r[0]?.transcript ?? '')
        .join(' ')
        .trim();
      if (said) send(said);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  };

  const undo = async (a: HomieAction) => {
    if (!a.itemId) return;
    if (a.kind === 'forget') await saveHomieItem({ id: a.itemId, forgotten: false });
    else if (a.kind === 'done') await saveHomieItem({ id: a.itemId, done: false });
    else await saveHomieItem({ id: a.itemId, forgotten: true });
    toast('Undone');
    loadHomie().then(setData).catch(() => {});
  };

  const name = data?.settings.name ?? DEFAULT_HOMIE.name;

  if (!cloud) {
    return (
      <div className="space-y-4">
        <Header name={name} onBack={onBack} />
        <p className="rounded-2xl bg-white p-4 text-sm text-stone-600 ring-1 ring-stone-200">Homie needs the shared (signed-in) version of the app.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100dvh-9rem)] flex-col">
      <Header
        name={name}
        onBack={onBack}
        right={
          <div className="flex gap-2">
            <button onClick={() => setSheet('knows')} aria-label="Things Homie knows" className="rounded-xl bg-white p-2 text-stone-500 ring-1 ring-stone-200">
              <Brain size={18} />
            </button>
            <button onClick={() => setSheet('settings')} aria-label="Homie settings" className="rounded-xl bg-white p-2 text-stone-500 ring-1 ring-stone-200">
              <Settings size={18} />
            </button>
          </div>
        }
      />
      {error && <p className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

      {ai === false && data && <ClaudeHome data={data} onChange={setData} lines={lines} onSettings={() => setSheet('settings')} />}

      {ai && (
      <>
      <div className="flex-1 space-y-3 pb-24 pt-4">
        {!lines.length && data && (
          <div className="rounded-3xl bg-gradient-to-br from-teal-700 to-sky-700 p-5 text-white">
            <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-teal-100">
              <Sparkles size={14} /> {name}
            </p>
            <p className="mt-1 text-lg font-semibold">Talk to me like a friend. I'll file what matters.</p>
            <p className="mt-1 text-sm text-teal-50">
              Reminders, things to remember, ideas, busy days, expenses, shopping and habits. Your notes are private to you. Start by telling me about your goals, or check your routine in settings.
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {STARTERS.map((s) => (
                <button key={s} onClick={() => send(s)} className="rounded-full bg-white/15 px-3 py-1.5 text-left text-xs font-medium">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {lines.map((l, i) => (
          <Bubble key={i} line={l} onUndo={undo} />
        ))}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
        className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-30 mx-auto flex max-w-lg items-end gap-2 border-t border-stone-200 bg-stone-50/95 px-4 py-2 backdrop-blur"
      >
        <textarea
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send(text);
            }
          }}
          placeholder={listening ? 'Listening…' : `Tell ${name} anything`}
          className={`${inputCls} max-h-32 resize-none`}
        />
        {SpeechCtor() && !text.trim() ? (
          <button type="button" onClick={listen} aria-label={listening ? 'Stop listening' : 'Speak'} className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${listening ? 'animate-pulse bg-rose-600' : 'bg-teal-700'} text-white`}>
            <Mic size={20} />
          </button>
        ) : (
          <button type="submit" disabled={busy || !text.trim()} aria-label="Send" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-teal-700 text-white disabled:opacity-40">
            <Send size={18} />
          </button>
        )}
      </form>
      </>
      )}

      {sheet === 'knows' && data && <KnowsSheet data={data} onChange={setData} onClose={() => setSheet(null)} />}
      {sheet === 'settings' && data && (
        <SettingsSheet
          data={data}
          ai={!!ai}
          onSaved={(s) => setData({ ...data, settings: s })}
          onCleared={() => {
            setLines([]);
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  );
}

function Header({ name, onBack, right }: { name: string; onBack: () => void; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <button onClick={onBack} className="-ml-2 flex items-center gap-1 rounded-xl p-2 text-stone-600" aria-label="Back to Today">
        <ArrowLeft size={20} />
        <span className="text-2xl font-bold text-stone-900">{name}</span>
      </button>
      {right}
    </div>
  );
}

function Bubble({ line, onUndo }: { line: Line; onUndo: (a: HomieAction) => void }) {
  if (line.role === 'user') {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-teal-700 px-3.5 py-2 text-sm text-white">{line.text}</p>
      </div>
    );
  }
  if (line.pending) {
    return (
      <div className="flex gap-1 px-2 py-3" aria-label="Thinking">
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-2 w-2 animate-bounce rounded-full bg-stone-400" style={{ animationDelay: `${i * 150}ms` }} />
        ))}
      </div>
    );
  }
  // Saved replies carry their filed items as "• ..." lines; fresh ones show them as chips below.
  const text = line.text;
  return (
    <div className="max-w-[90%] space-y-1.5">
      <p className="whitespace-pre-wrap rounded-2xl rounded-bl-md bg-white px-3.5 py-2 text-sm text-stone-900 ring-1 ring-stone-200">{text}</p>
      {line.actions?.map((a, i) => (
        <div key={i} className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-1.5 text-xs text-emerald-900 ring-1 ring-emerald-200">
          <Check size={13} className="shrink-0" />
          <span className="flex-1">{a.label}</span>
          {a.itemId && (
            <button onClick={() => onUndo(a)} className="flex items-center gap-0.5 font-semibold" aria-label={`Undo: ${a.label}`}>
              <Undo2 size={12} /> Undo
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------- Things Homie knows ----------

const KIND_LABEL: Record<HomieItem['kind'], string> = { reminder: 'Reminders', busy: 'Busy days', fact: 'Things I know about you', note: 'Notes and ideas' };

function KnowsSheet({ data, onChange, onClose }: { data: HomieData; onChange: (d: HomieData) => void; onClose: () => void }) {
  return (
    <Sheet title={`Things ${data.settings.name} knows`} onClose={onClose}>
      <KnowsList data={data} onChange={onChange} />
    </Sheet>
  );
}

function KnowsList({ data, onChange }: { data: HomieData; onChange: (d: HomieData) => void }) {
  const toast = useToast();
  const [fact, setFact] = useState('');
  const tz = data.settings.tzOffsetMin;
  const items = sortItems(data.items.filter((i) => !i.forgotten));
  const setItem = (row: HomieItem) => onChange({ ...data, items: data.items.some((i) => i.id === row.id) ? data.items.map((i) => (i.id === row.id ? row : i)) : [row, ...data.items] });

  const forget = async (item: HomieItem) => {
    setItem(await saveHomieItem({ id: item.id, forgotten: true }));
    toast('Forgotten', { label: 'Undo', run: async () => setItem(await saveHomieItem({ id: item.id, forgotten: false })) });
  };
  const tick = async (item: HomieItem) => setItem(await saveHomieItem({ id: item.id, done: !item.done }));

  return (
    <div>
      <form
        className="mb-4 flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!fact.trim()) return;
          setItem(await saveHomieItem({ kind: 'fact', text: fact.trim() }));
          setFact('');
        }}
      >
        <input className={inputCls} placeholder="Add something to remember" value={fact} onChange={(e) => setFact(e.target.value)} />
        <PrimaryButton type="submit" disabled={!fact.trim()} className="shrink-0 px-3 py-2">
          Add
        </PrimaryButton>
      </form>
      {!items.length && <p className="text-sm text-stone-500">Nothing yet. Tell {data.settings.name} something worth remembering.</p>}
      {(['reminder', 'busy', 'fact', 'note'] as const).map((kind) => {
        const list = items.filter((i) => i.kind === kind);
        if (!list.length) return null;
        return (
          <section key={kind} className="mb-5">
            <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-stone-500">
              {kind === 'reminder' ? <Bell size={13} /> : kind === 'note' ? <Lightbulb size={13} /> : <Brain size={13} />}
              {KIND_LABEL[kind]}
            </h3>
            <ul className="divide-y divide-stone-100 rounded-2xl ring-1 ring-stone-200">
              {list.map((i) => (
                <li key={i.id} className="flex items-start gap-3 px-3 py-2.5">
                  {kind === 'reminder' && (
                    <button onClick={() => tick(i)} aria-label={i.done ? 'Not done' : 'Done'} className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${i.done ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-stone-300'}`}>
                      {i.done && <Check size={12} />}
                    </button>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm ${i.done ? 'text-stone-400 line-through' : 'text-stone-900'}`}>{i.text}</p>
                    {kind === 'reminder' && i.at && <p className="text-xs text-stone-500">{friendlyWhen(i.at, tz)}</p>}
                    {kind === 'busy' && i.day && <p className="text-xs text-stone-500">{new Date(`${i.day}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}</p>}
                  </div>
                  <button onClick={() => forget(i)} aria-label={`Forget: ${i.text}`} className="rounded-lg p-1 text-stone-400">
                    <Trash2 size={16} />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      <p className="text-xs text-stone-500">Only you can see these. Chat older than 30 days is removed automatically.</p>
    </div>
  );
}

// ---------- settings ----------

const SIRI_URL = `${location.origin}/api/homie/siri?k=`;
const MCP_URL = `${location.origin}/mcp/`;

function SettingsSheet({ data, ai, onSaved, onCleared, onClose }: { data: HomieData; ai: boolean; onSaved: (s: HomieSettings) => void; onCleared: () => void; onClose: () => void }) {
  const toast = useToast();
  const [s, setS] = useState<HomieSettings>(data.settings);
  const [interests, setInterests] = useState((data.settings.interests ?? []).join('\n'));
  const [key, setKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof HomieSettings>(k: K, v: HomieSettings[K]) => setS((x) => ({ ...x, [k]: v }));
  const time = (k: 'wake' | 'leave' | 'homeBy' | 'evening', label: string) => (
    <Field label={label}>
      <input type="time" className={inputCls} value={s[k]} onChange={(e) => e.target.value && set(k, e.target.value)} />
    </Field>
  );

  const save = async () => {
    setSaving(true);
    try {
      const next = { ...s, interests: cleanInterests(interests.split('\n')) };
      await saveHomieSettings(next);
      onSaved(next);
      toast('Saved');
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      title={`${s.name} settings`}
      onClose={onClose}
      footer={
        <PrimaryButton onClick={save} disabled={saving} className="w-full">
          {saving ? 'Saving…' : 'Save'}
        </PrimaryButton>
      }
    >
      <Field label="Name">
        <input className={inputCls} value={s.name} maxLength={24} onChange={(e) => set('name', e.target.value)} />
      </Field>
      <Field label="Coaching tone">
        <Segmented value={s.tone} onChange={(v) => set('tone', v)} options={[{ value: 'gentle', label: 'Gentle' }, { value: 'firm', label: 'Firm' }, { value: 'drill', label: 'Drill sergeant' }]} />
      </Field>
      <div className="grid grid-cols-2 gap-x-3">
        {time('wake', 'Wake up')}
        {time('leave', 'Leave for office')}
        {time('homeBy', 'Usually home by')}
        {time('evening', 'Evening wrap-up')}
      </div>
      <Field label="Commute, one way (minutes)">
        <input type="number" inputMode="numeric" min={0} max={300} className={inputCls} value={s.commuteMin} onChange={(e) => set('commuteMin', Math.max(0, Math.min(300, Number(e.target.value) || 0)))} />
      </Field>
      <Field label="Office days">
        <div className="flex gap-1">
          {WEEKDAYS.map((d, i) => {
            const on = s.officeDays.includes(i);
            return (
              <button key={d} onClick={() => set('officeDays', on ? s.officeDays.filter((x) => x !== i) : [...s.officeDays, i].sort())} className={`flex-1 rounded-lg py-2 text-xs font-semibold ${on ? 'bg-teal-700 text-white' : 'bg-stone-100 text-stone-600'}`}>
                {d}
              </button>
            );
          })}
        </div>
      </Field>
      <Toggle on={s.morningBrief} onChange={(v) => set('morningBrief', v)} label="Morning brief at wake-up time" />
      <Toggle on={s.eveningBrief} onChange={(v) => set('eveningBrief', v)} label="Evening wrap-up" />
      <Toggle on={s.nudges} onChange={(v) => set('nudges', v)} label="Nudges: time to leave, streak saver, bedtime" />
      <p className="mb-4 text-xs text-stone-500">Briefs, nudges and reminders arrive as phone notifications. Turn notifications on in Settings, App.</p>
      <Field label={`What should ${s.name} always keep in mind?`} hint="Your goals, health, what you enjoy. For example: gym 4 days a week, knee rehab, ski trip in Jan 2028.">
        <textarea rows={5} className={inputCls} value={s.about} maxLength={4000} onChange={(e) => set('about', e.target.value)} />
      </Field>

      {s.trainingStart && (
        <section className="mb-4 rounded-2xl bg-stone-50 p-4 ring-1 ring-stone-200">
          <h3 className="font-semibold">Training plan</h3>
          <p className="mt-1 text-xs text-stone-500">Started {s.trainingStart}. Phases count from this date.</p>
          <p className="mb-1 mt-3 text-xs font-medium text-stone-500">Gym days</p>
          <div className="flex gap-1">
            {WEEKDAYS.map((d, i) => {
              const on = s.gymDays.includes(i);
              return (
                <button key={d} onClick={() => set('gymDays', on ? s.gymDays.filter((x) => x !== i) : [...s.gymDays, i].sort())} className={`flex-1 rounded-lg py-2 text-xs font-semibold ${on ? 'bg-teal-700 text-white' : 'bg-white text-stone-600 ring-1 ring-stone-200'}`}>
                  {d}
                </button>
              );
            })}
          </div>
          <div className="mt-3">
            <Field label="Goal date (the trip you're training for)">
              <input type="date" className={inputCls} value={s.goalDate} onChange={(e) => e.target.value && set('goalDate', e.target.value)} />
            </Field>
          </div>
          <button onClick={() => set('trainingStart', '')} className="text-sm font-semibold text-rose-700">
            Stop the plan
          </button>
        </section>
      )}

      <Field label="Interests to watch" hint="One per line. A daily scout in your Claude app looks these up (shows near you, big news) and notifies you about new finds. Only you see them.">
        <textarea rows={4} className={inputCls} value={interests} placeholder={'Samay Raina shows\nPure Storage (PSTG) stock\nBig Indian market news'} onChange={(e) => setInterests(e.target.value)} />
      </Field>

      <ConnectClaude hasKey={data.hasSiri} />
      {data.hasSiri && <HomieLock />}

      {ai && (
      <section className="mb-4 rounded-2xl bg-stone-50 p-4 ring-1 ring-stone-200">
        <h3 className="font-semibold">Talk through Siri</h3>
        <p className="mt-1 text-sm text-stone-600">Make an iPhone Shortcut so "Hey Siri, {s.name}" takes what you say and reads the reply aloud. Works hands-free with earphones.</p>
        {!key ? (
          <button
            onClick={async () => {
              try {
                setKey(await makeSiriKey());
              } catch (e) {
                toast(e instanceof Error ? e.message : String(e));
              }
            }}
            className="mt-3 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-teal-700 ring-1 ring-stone-200"
          >
            {data.hasSiri ? 'Make a new Siri key (the old one stops working)' : 'Make a Siri key'}
          </button>
        ) : (
          <div className="mt-3 space-y-2 text-sm">
            <button
              onClick={() => {
                navigator.clipboard?.writeText(SIRI_URL + key).then(() => toast('Link copied'), () => toast('Copy failed: select the link and copy it'));
              }}
              className="flex w-full items-center gap-2 rounded-xl bg-white px-3 py-2 text-left font-mono text-xs ring-1 ring-stone-200"
            >
              <Copy size={14} className="shrink-0" />
              <span className="break-all">{SIRI_URL + key}</span>
            </button>
            <ol className="list-decimal space-y-1 pl-5 text-stone-700">
              <li>Open Shortcuts, tap +, and name the shortcut "{s.name}".</li>
              <li>Add "Dictate Text".</li>
              <li>Add "Get Contents of URL". Paste the link above. Tap the arrow: Method POST, Request Body Form, add a Text field named text with the value Dictated Text.</li>
              <li>Add "Speak Text" with Contents of URL.</li>
              <li>Say "Hey Siri, {s.name}" and talk.</li>
            </ol>
            <p className="text-xs text-stone-500">Keep this link private: it works like your password for {s.name}.</p>
          </div>
        )}
      </section>
      )}

      <ConfirmButton
        label="Clear chat"
        armedLabel="Tap again to clear"
        onConfirm={async () => {
          await clearHomieChat();
          toast('Chat cleared');
          onCleared();
        }}
        className="mb-2 w-full rounded-xl bg-stone-100 py-2.5 text-sm font-medium text-stone-700"
      />
      <p className="text-xs text-stone-500">Clearing the chat keeps your reminders, facts and notes.</p>
    </Sheet>
  );
}

// ---------- without an API key: Claude app + connector ----------

function ClaudeHome({ data, onChange, lines, onSettings }: { data: HomieData; onChange: (d: HomieData) => void; lines: Line[]; onSettings: () => void }) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [when, setWhen] = useState('');
  const brief = [...lines].reverse().find((l) => l.role === 'assistant' && Date.now() - Date.parse(l.at) < 18 * 3600_000);

  const addReminder = async () => {
    const at = localToUtc(when, data.settings.tzOffsetMin);
    if (!text.trim() || !at) return;
    const row = await saveHomieItem({ kind: 'reminder', text: text.trim(), at });
    onChange({ ...data, items: [row, ...data.items] });
    setText('');
    setWhen('');
    toast(`Reminder set for ${friendlyWhen(at, data.settings.tzOffsetMin)}`);
  };

  return (
    <div className="space-y-4 pb-8 pt-4">
      {!data.hasSiri ? (
        <div className="rounded-3xl bg-gradient-to-br from-teal-700 to-sky-700 p-5 text-white">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-teal-100">
            <Sparkles size={14} /> {data.settings.name}
          </p>
          <p className="mt-1 text-lg font-semibold">Talk to {data.settings.name} in the Claude app</p>
          <p className="mt-1 text-sm text-teal-50">
            Connect HomeManager to Claude once. Then type or use voice mode in Claude to set reminders, log habits and expenses, or ask what's on today. It runs on your Claude plan, at no extra cost.
          </p>
          <button onClick={onSettings} className="mt-3 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-teal-800">
            Set it up
          </button>
        </div>
      ) : (
        <div className="rounded-2xl bg-teal-50 px-4 py-3 text-sm text-teal-900 ring-1 ring-teal-200">
          <p>Talk to {data.settings.name} in the Claude app (HomeManager connector). Reminders and briefs arrive here as notifications.</p>
          <OpenClaude />
        </div>
      )}

      {brief && (
        <section className="rounded-2xl bg-white p-4 ring-1 ring-stone-200">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-500">Latest brief</h3>
          <p className="whitespace-pre-wrap text-sm text-stone-900">{brief.text}</p>
        </section>
      )}

      <TrainingCard data={data} onChange={onChange} />

      <section className="rounded-2xl bg-white p-4 ring-1 ring-stone-200">
        <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
          <Bell size={15} /> Quick reminder
        </h3>
        <input className={`${inputCls} mb-2`} placeholder="What to remind you about" value={text} onChange={(e) => setText(e.target.value)} />
        <div className="flex gap-2">
          <input type="datetime-local" className={inputCls} value={when} onChange={(e) => setWhen(e.target.value)} />
          <PrimaryButton onClick={addReminder} disabled={!text.trim() || !when} className="shrink-0 px-4 py-2">
            Set
          </PrimaryButton>
        </div>
      </section>

      <KnowsList data={data} onChange={onChange} />
    </div>
  );
}

function ConnectClaude({ hasKey }: { hasKey: boolean }) {
  const toast = useToast();
  const [key, setKey] = useState<string | null>(null);
  return (
    <section className="mb-4 rounded-2xl bg-stone-50 p-4 ring-1 ring-stone-200">
      <h3 className="font-semibold">Connect the Claude app</h3>
      <p className="mt-1 text-sm text-stone-600">Lets Claude read and save your reminders, notes, habits, to-dos, shopping and expenses. Works in chats and voice mode, on your Claude plan.</p>
      {!key ? (
        <button
          onClick={async () => {
            try {
              setKey(await makeSiriKey());
            } catch (e) {
              toast(e instanceof Error ? e.message : String(e));
            }
          }}
          className="mt-3 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-teal-700 ring-1 ring-stone-200"
        >
          {hasKey ? 'Make a new connector link (the old one stops working)' : 'Make my connector link'}
        </button>
      ) : (
        <div className="mt-3 space-y-2 text-sm">
          <button
            onClick={() => {
              navigator.clipboard?.writeText(MCP_URL + key).then(() => toast('Link copied'), () => toast('Copy failed: select the link and copy it'));
            }}
            className="flex w-full items-center gap-2 rounded-xl bg-white px-3 py-2 text-left font-mono text-xs ring-1 ring-stone-200"
          >
            <Copy size={14} className="shrink-0" />
            <span className="break-all">{MCP_URL + key}</span>
          </button>
          <ol className="list-decimal space-y-1 pl-5 text-stone-700">
            <li>In Claude (claude.ai or the app), open Settings, Connectors, and tap "Add custom connector".</li>
            <li>Name it HomeManager and paste the link above as the URL. Leave the advanced settings empty.</li>
            <li>In a chat, turn on HomeManager from the + (tools) menu. It's then available on your phone too.</li>
            <li>Try: "What's on my plate today?" or "Remind me to do knee exercises at 7 pm."</li>
          </ol>
          <p className="text-xs text-stone-500">Keep this link private: it works like a password to your Homie data.</p>
        </div>
      )}
    </section>
  );
}

// A PIN for the Claude connector, for a Claude account shared with family.
function HomieLock() {
  const toast = useToast();
  const [state, setState] = useState<{ pin: boolean; unlockedUntil: string | null } | null>(null);
  const [pin, setPin] = useState('');
  useEffect(() => {
    homieLockState().then(setState, () => setState(null));
  }, []);
  if (!state) return null;
  const savePin = async (value: string) => {
    try {
      await setHomiePin(value);
      setState({ pin: !!value, unlockedUntil: null });
      setPin('');
      toast(value ? 'PIN set. Homie in Claude is locked.' : 'PIN removed');
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <section className="mb-4 rounded-2xl bg-stone-50 p-4 ring-1 ring-stone-200">
      <h3 className="font-semibold">Lock Homie in Claude</h3>
      <p className="mt-1 text-sm text-stone-600">
        For a shared Claude account. With a PIN, Claude can't see or change anything until you type "unlock" and your PIN in the chat. It stays open 20 minutes after the last use. Use an incognito chat, and never save the PIN in Claude. The morning scout still works.
      </p>
      {state.pin && (
        <p className="mt-2 text-sm font-medium text-stone-800">
          {state.unlockedUntil ? `Unlocked right now.` : 'Locked.'}
          {state.unlockedUntil && (
            <button
              onClick={() => lockHomie().then(() => setState({ ...state, unlockedUntil: null }), (e) => toast(String(e)))}
              className="ml-2 font-semibold text-teal-700"
            >
              Lock now
            </button>
          )}
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={8}
          className={inputCls}
          placeholder={state.pin ? 'New PIN (4-8 digits)' : 'PIN (4-8 digits)'}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
        />
        <PrimaryButton onClick={() => savePin(pin)} disabled={pin.length < 4} className="shrink-0 px-4 py-2">
          {state.pin ? 'Change' : 'Set'}
        </PrimaryButton>
      </div>
      {state.pin && (
        <button onClick={() => savePin('')} className="mt-2 text-sm font-semibold text-rose-700">
          Remove the PIN
        </button>
      )}
    </section>
  );
}

// With a PIN set: unlock the connector from the app (only you have the app login) and jump to Claude.
function OpenClaude() {
  const toast = useToast();
  const [state, setState] = useState<{ pin: boolean; unlockedUntil: string | null } | null>(null);
  useEffect(() => {
    homieLockState().then(setState, () => setState(null));
  }, []);
  if (!state?.pin) return null;
  const open = state.unlockedUntil && Date.parse(state.unlockedUntil) > Date.now();
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <a
        href="https://claude.ai/new"
        onClick={(e) => {
          // Unlock first, then leave for Claude (a plain link would cancel the call).
          e.preventDefault();
          const href = e.currentTarget.href;
          unlockHomieFromApp().then(
            (st) => {
              setState(st);
              location.href = href;
            },
            (err) => toast(err instanceof Error ? err.message : String(err)),
          );
        }}
        className="rounded-xl bg-teal-700 px-3 py-2 font-semibold text-white"
      >
        Unlock and open Claude
      </a>
      {open && (
        <button onClick={() => lockHomie().then(() => setState({ ...state, unlockedUntil: null }), (e) => toast(String(e)))} className="rounded-xl bg-white px-3 py-2 font-semibold text-teal-800 ring-1 ring-teal-200">
          Lock now
        </button>
      )}
      <span className="w-full text-xs text-teal-800">{open ? 'Open in Claude for 20 minutes after the last use.' : 'Locked in Claude.'}</span>
    </div>
  );
}
