import { ArrowLeft, ArrowDown, ArrowUp, Bell, Copy, Info, LogOut, MessageSquare, Smartphone, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { moduleOn, MODULES, moveCard, TODAY_CARDS, todayOrder, toggled } from '../lib/modules';
import { widgetScript } from '../lib/widget';
import { getToken, resetLocalData, signOut, supabase } from '../store/backend';
import { disablePush, enablePush, pushStatus, pushSupport, sendTestPush } from '../store/push';
import { useStore } from '../store/store';
import { FeedbackSheet } from './FeedbackSheet';
import { HouseholdForm } from './HouseholdForm';
import { useToast } from './toast';
import { ConfirmButton, Field, inputCls, Toggle } from './ui';

export function MoreView({ onBack, onTour }: { onBack?: () => void; onTour?: () => void }) {
  const store = useStore();
  const toast = useToast();
  const { household } = store.data;
  const [name, setName] = useState(household.name);
  const cloud = store.backend.mode === 'cloud';
  const [feedback, setFeedback] = useState(false);

  return (
    <div className="space-y-6">
      <header>
        {onBack && (
          <button onClick={onBack} className="mb-2 flex items-center gap-1 text-sm text-stone-500">
            <ArrowLeft size={16} /> Back
          </button>
        )}
        <h1 className="text-2xl font-bold text-stone-900">Home settings</h1>
      </header>

      <Group title="Your home">
        <section className="rounded-2xl bg-white p-4 ring-1 ring-stone-200">
          <Field label="Home name">
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== household.name && store.updateHousehold({ name: name.trim() })} />
          </Field>
        </section>
      </Group>

      <Group title="Tabs">
        <ModulesCard />
      </Group>

      <Group title="Today screen">
        <ArrangeCard />
      </Group>

      <Group title="Food & meals">
        <section className="rounded-2xl bg-white p-4 ring-1 ring-stone-200">
          <HouseholdForm settings={household.settings} onChange={(s) => store.updateHousehold({ settings: s })} />
        </section>
      </Group>

      <Group title="Family">
      {cloud ? (
        <section className="rounded-2xl bg-white p-4 ring-1 ring-stone-200">
          <h2 className="mb-1 flex items-center gap-2 font-semibold">
            <Users size={18} className="text-teal-700" /> Invite family
          </h2>
          <p className="mb-3 text-sm text-stone-600">They open the app, sign in with a username and password of their own, choose "Join my family" and type this code.</p>
          <div className="flex items-center gap-2">
            <span className="flex-1 rounded-xl bg-stone-100 py-3 text-center font-mono text-2xl font-semibold tracking-[0.3em]">{household.inviteCode}</span>
            <button
              onClick={() => {
                navigator.clipboard?.writeText(`Join our HomeManager: ${window.location.origin} code ${household.inviteCode}`).then(
                  () => toast('Invite copied'),
                  () => toast('Could not copy'),
                );
              }}
              className="rounded-xl bg-white p-3 ring-1 ring-stone-200"
              aria-label="Copy invite"
            >
              <Copy size={18} />
            </button>
          </div>
        </section>
      ) : (
        <section className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
          <b>This device only.</b> Data is saved in this browser. Once the app is connected to the database, the whole family shares one pantry.
        </section>
      )}
      </Group>

      <Group title="App">
      {onTour && (
        <button onClick={onTour} className="flex w-full items-center gap-3 rounded-2xl bg-white px-4 py-3 text-left ring-1 ring-stone-200">
          <Info size={18} className="text-teal-700" />
          <div className="flex-1">
            <p className="font-semibold">Take the tour</p>
            <p className="text-xs text-stone-500">A quick look at what the app can do</p>
          </div>
        </button>
      )}
      {cloud && <NotificationsCard />}
      {cloud && <WidgetCard />}
      {cloud && <SmsCard />}
      {cloud && (
        <button onClick={() => setFeedback(true)} className="flex w-full items-center gap-3 rounded-2xl bg-white px-4 py-3 text-left ring-1 ring-stone-200">
          <MessageSquare size={18} className="text-teal-700" />
          <div className="flex-1">
            <p className="font-medium text-stone-800">Feedback</p>
            <p className="text-xs text-stone-500">Claude reads these and replies here</p>
          </div>
        </button>
      )}
      {feedback && <FeedbackSheet onClose={() => setFeedback(false)} />}

      {cloud ? (
        <button onClick={() => signOut()} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white py-3 font-medium text-stone-700 ring-1 ring-stone-200">
          <LogOut size={18} /> Sign out
        </button>
      ) : (
        <ConfirmButton
          label="Start over (erase this device's data)"
          armedLabel="Tap again to erase everything"
          onConfirm={() => {
            resetLocalData();
            window.location.reload();
          }}
          className="w-full rounded-2xl py-3 text-sm text-rose-600"
        />
      )}
      </Group>
    </div>
  );
}

function ModulesCard() {
  const store = useStore();
  const settings = store.data.household.settings;
  return (
    <section className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-stone-200">
      <p className="text-sm text-stone-600">Choose which tabs your home uses. Switching one off only hides it. Nothing is deleted.</p>
      {MODULES.map((m) => (
        <div key={m.id}>
          <Toggle on={moduleOn(settings, m.id)} label={m.label} onChange={() => store.updateHousehold({ settings: { disabledModules: toggled(settings.disabledModules, m.id) } })} />
          <p className="text-xs text-stone-500">{m.hint}</p>
        </div>
      ))}
    </section>
  );
}

function ArrangeCard() {
  const store = useStore();
  const settings = store.data.household.settings;
  const order = todayOrder(settings);
  return (
    <section className="rounded-2xl bg-white p-4 ring-1 ring-stone-200">
      <p className="mb-2 text-sm text-stone-600">Show, hide and reorder the blocks on Today.</p>
      <ul className="divide-y divide-stone-100">
        {order.map((id, i) => {
          const card = TODAY_CARDS.find((c) => c.id === id)!;
          const shown = !settings.todayHidden?.includes(id);
          return (
            <li key={id} className="flex items-center gap-2 py-2">
              <div className="min-w-0 flex-1">
                <Toggle on={shown} label={card.label} onChange={() => store.updateHousehold({ settings: { todayHidden: toggled(settings.todayHidden, id) } })} />
                <p className="text-xs text-stone-500">{card.hint}</p>
              </div>
              <button disabled={i === 0} onClick={() => store.updateHousehold({ settings: { todayOrder: moveCard(settings, id, -1) } })} aria-label={`Move ${card.label} up`} className="rounded-lg bg-stone-100 p-2 text-stone-700 disabled:opacity-30">
                <ArrowUp size={16} />
              </button>
              <button disabled={i === order.length - 1} onClick={() => store.updateHousehold({ settings: { todayOrder: moveCard(settings, id, 1) } })} aria-label={`Move ${card.label} down`} className="rounded-lg bg-stone-100 p-2 text-stone-700 disabled:opacity-30">
                <ArrowDown size={16} />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function NotificationsCard() {
  const toast = useToast();
  const support = pushSupport();
  const [state, setState] = useState<{ on: boolean; hour: number } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (support === 'ok') pushStatus().then(setState, () => setState({ on: false, hour: 8 }));
  }, [support]);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      setState(await pushStatus());
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="rounded-2xl bg-white p-4 ring-1 ring-stone-200">
      <h2 className="mb-1 flex items-center gap-2 font-semibold">
        <Bell size={18} className="text-teal-700" /> Notifications
      </h2>
      {support === 'install' ? (
        <p className="text-sm text-stone-600">On iPhone, first add this app to the Home Screen (Share, then "Add to Home Screen"), open it from there, and turn notifications on here.</p>
      ) : support === 'unsupported' ? (
        <p className="text-sm text-stone-600">This browser can't show notifications. Try Chrome on Android, or the app added to the Home Screen on iPhone.</p>
      ) : (
        <>
          <p className="mb-3 text-sm text-stone-600">One summary a morning on this phone: bills and upkeep due, documents expiring, help on leave, things to buy. Nothing if the day is clear.</p>
          <Toggle
            on={!!state?.on}
            label={state?.on ? 'On for this phone' : 'Off on this phone'}
            onChange={(v) => !busy && run(() => (v ? enablePush(state?.hour ?? 8) : disablePush()))}
          />
          {state?.on && (
            <div className="mt-3 flex items-center gap-2">
              <label htmlFor="push-hour" className="text-sm text-stone-600">
                Send at
              </label>
              <select id="push-hour" className={`${inputCls} w-auto`} value={state.hour} disabled={busy} onChange={(e) => run(() => enablePush(Number(e.target.value)))}>
                {[6, 7, 8, 9, 10, 18, 20].map((h) => (
                  <option key={h} value={h}>
                    {h < 12 ? `${h} am` : `${h - 12} pm`}
                  </option>
                ))}
              </select>
              <button onClick={() => sendTestPush().then((m) => toast(m))} className="ml-auto text-sm font-medium text-teal-700">
                Send a test
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function WidgetCard() {
  const toast = useToast();
  const [script, setScript] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const make = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase().rpc('hm_widget_key', { p_token: getToken() });
      if (error) throw new Error(error.message);
      setScript(widgetScript(data as string, window.location.origin));
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="rounded-2xl bg-white p-4 ring-1 ring-stone-200">
      <h2 className="mb-1 flex items-center gap-2 font-semibold">
        <Smartphone size={18} className="text-teal-700" /> iPhone widget
      </h2>
      {!script ? (
        <>
          <p className="mb-3 text-sm text-stone-600">Today's meals, what's due, things to buy and your next trip on the home screen. Uses the free Scriptable app.</p>
          <button onClick={make} disabled={busy} className="w-full rounded-xl bg-stone-100 py-2.5 text-sm font-semibold text-stone-800">
            {busy ? 'Making…' : 'Set up the widget'}
          </button>
        </>
      ) : (
        <>
          <ol className="mb-3 list-decimal space-y-1 pl-5 text-sm text-stone-600">
            <li>
              Install <a href="https://apps.apple.com/app/scriptable/id1405459188" target="_blank" rel="noreferrer" className="font-medium text-teal-700">Scriptable</a> from the App Store.
            </li>
            <li>Copy the script below. In Scriptable tap +, paste it, and name it HomeManager.</li>
            <li>Long-press the home screen, tap Edit, then Add Widget, Scriptable, a medium size. Tap the widget and choose the HomeManager script.</li>
          </ol>
          <button
            onClick={() => navigator.clipboard?.writeText(script).then(() => toast('Script copied'), () => toast('Could not copy. Select the text below instead.'))}
            className="mb-2 flex w-full items-center justify-center gap-2 rounded-xl bg-teal-700 py-2.5 text-sm font-semibold text-white"
          >
            <Copy size={16} /> Copy script
          </button>
          <textarea readOnly className={`${inputCls} h-28 font-mono text-xs`} value={script} onFocus={(e) => e.target.select()} />
          <p className="mt-2 text-xs text-stone-500">The script has a private key for your home. Setting up again makes a new key and the old widget stops working.</p>
        </>
      )}
    </section>
  );
}

function SmsCard() {
  const toast = useToast();
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const make = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase().rpc('hm_sms_key', { p_token: getToken() });
      if (error) throw new Error(error.message);
      setUrl(`${window.location.origin}/api/sms?k=${data as string}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="rounded-2xl bg-white p-4 ring-1 ring-stone-200">
      <h2 className="mb-1 flex items-center gap-2 font-semibold">
        <MessageSquare size={18} className="text-teal-700" /> Bank SMS to expenses
      </h2>
      {!url ? (
        <>
          <p className="mb-3 text-sm text-stone-600">An iPhone Shortcuts automation sends each bank SMS here and money spent is added to Money. Only the amount and shop are read.</p>
          <button onClick={make} disabled={busy} className="w-full rounded-xl bg-stone-100 py-2.5 text-sm font-semibold text-stone-800">
            {busy ? 'Making…' : 'Set up SMS expenses'}
          </button>
        </>
      ) : (
        <>
          <ol className="mb-3 list-decimal space-y-1 pl-5 text-sm text-stone-600">
            <li>Copy the link below.</li>
            <li>Open the Shortcuts app, Automation tab, tap +, choose Message. Under Message Contains type a word your bank uses, like "debited" or "spent". Pick Run Immediately.</li>
            <li>Add the action Get Contents of URL. Paste the link, tap Show More, set Method to POST and Request Body to Form. Add a Text field named text and tap its value, then choose Shortcut Input (it shows as Message). If it still says nothing was received, add a Get Text from Input action first and use its result.</li>
            <li>Repeat for each bank word you want (for example "spent"). Credits and OTPs are ignored.</li>
          </ol>
          <button
            onClick={() => navigator.clipboard?.writeText(url).then(() => toast('Link copied'), () => toast('Could not copy. Select the text below instead.'))}
            className="mb-2 flex w-full items-center justify-center gap-2 rounded-xl bg-teal-700 py-2.5 text-sm font-semibold text-white"
          >
            <Copy size={16} /> Copy link
          </button>
          <textarea readOnly className={`${inputCls} h-20 font-mono text-xs`} value={url} onFocus={(e) => e.target.select()} />
          <p className="mt-2 text-xs text-stone-500">The link has a private key for your home. Setting up again makes a new key and the old one stops working. Repeated messages are only added once.</p>
        </>
      )}
    </section>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">{title}</h2>
      {children}
    </div>
  );
}
