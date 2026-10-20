import { CalendarCheck, CalendarDays, ChefHat, Settings, ShoppingCart, Users, Wrench } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { DishesView } from './components/DishesView';
import { LoginScreen } from './components/LoginScreen';
import { MoreView } from './components/MoreView';
import { PantryView } from './components/PantryView';
import { PlansView } from './components/PlansView';
import { UpkeepView } from './components/UpkeepView';
import { SetupWizard } from './components/SetupWizard';
import { ShoppingView } from './components/ShoppingView';
import { TodayView } from './components/TodayView';
import { ToastProvider } from './components/toast';
import { inputCls, PrimaryButton, SecondaryButton, Segmented } from './components/ui';
import { CloudBackend, getToken, LocalBackend, signOut, supabaseConfigured, type Backend } from './store/backend';
import { StoreProvider, useStore } from './store/store';
import type { AppData } from './types';
import { localDate } from './lib/dates';
import { upkeepStatus } from './lib/upkeep';

type Boot =
  | { state: 'loading' }
  | { state: 'signin' }
  | { state: 'nohousehold' }
  | { state: 'setup' }
  | { state: 'ready'; data: AppData }
  | { state: 'error'; message: string };

export default function App() {
  const cloud = supabaseConfigured();
  const backend = useMemo<Backend>(() => (cloud ? new CloudBackend() : new LocalBackend()), [cloud]);
  const [boot, setBoot] = useState<Boot>({ state: 'loading' });
  const [token, setTokenState] = useState<string | null>(() => (cloud ? getToken() : null));
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await backend.load();
      if (data) setBoot({ state: 'ready', data });
      else setBoot({ state: cloud ? 'nohousehold' : 'setup' });
    } catch (e) {
      // An expired session clears the token, which shows the sign-in screen.
      if (cloud && !getToken()) setBoot({ state: 'signin' });
      else setBoot({ state: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }, [backend, cloud]);

  // Sign-in and sign-out (cloud) update the stored token and fire this event.
  useEffect(() => {
    if (!cloud) return;
    const onAuth = () => setTokenState(getToken());
    window.addEventListener('homemanager-auth', onAuth);
    return () => window.removeEventListener('homemanager-auth', onAuth);
  }, [cloud]);

  useEffect(() => {
    if (cloud && !token) {
      setBoot({ state: 'signin' });
      return;
    }
    setBoot({ state: 'loading' });
    load();
  }, [cloud, token, load]);

  const create = async (data: AppData) => {
    setBusy(true);
    try {
      const saved = await backend.createHousehold(data);
      setBoot({ state: 'ready', data: saved });
    } catch (e) {
      setBoot({ state: 'error', message: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  let body: React.ReactNode;
  switch (boot.state) {
    case 'loading':
      body = <Splash />;
      break;
    case 'signin':
      body = <LoginScreen />;
      break;
    case 'nohousehold':
      body = <JoinOrCreate backend={backend} onCreate={() => setBoot({ state: 'setup' })} onJoined={load} />;
      break;
    case 'setup':
      body = <SetupWizard onDone={create} busy={busy} />;
      break;
    case 'error':
      body = (
        <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 px-6">
          <h1 className="text-xl font-bold">Something went wrong</h1>
          <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{boot.message}</p>
          <PrimaryButton onClick={() => window.location.reload()}>Try again</PrimaryButton>
        </div>
      );
      break;
    case 'ready':
      body = (
        <StoreProvider backend={backend} initial={boot.data}>
          <Shell />
        </StoreProvider>
      );
  }
  return <ToastProvider>{body}</ToastProvider>;
}

function Splash() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-teal-700 border-t-transparent" />
    </div>
  );
}

function JoinOrCreate({ backend, onCreate, onJoined }: { backend: Backend; onCreate: () => void; onJoined: () => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-6">
      <div>
        <h1 className="text-2xl font-bold">Welcome!</h1>
        <p className="mt-1 text-stone-600">Set up your home, or join the one your family already made.</p>
      </div>
      <PrimaryButton onClick={onCreate}>Set up our home</PrimaryButton>
      <div className="rounded-2xl bg-white p-4 ring-1 ring-stone-200">
        <p className="mb-2 flex items-center gap-2 font-semibold">
          <Users size={18} /> Join my family
        </p>
        <input className={`${inputCls} mb-2 text-center font-mono uppercase tracking-[0.3em]`} maxLength={6} placeholder="CODE" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
        <SecondaryButton
          className="w-full"
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await backend.joinHousehold(code);
              onJoined();
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Joining…' : 'Join'}
        </SecondaryButton>
        {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
      </div>
      <button onClick={() => signOut()} className="text-sm text-stone-500">
        Sign out
      </button>
    </div>
  );
}

type Tab = 'today' | 'kitchen' | 'shopping' | 'upkeep' | 'plans' | 'more';
const TABS: Tab[] = ['today', 'kitchen', 'shopping', 'upkeep', 'plans', 'more'];

function Shell() {
  const store = useStore();
  const [tab, setTab] = useState<Tab>(() => {
    const h = location.hash.slice(1);
    if (h === 'pantry' || h === 'dishes') return 'kitchen';
    return TABS.includes(h as Tab) ? (h as Tab) : 'today';
  });
  const [kitchen, setKitchen] = useState<'pantry' | 'dishes'>(() => (location.hash === '#dishes' ? 'dishes' : 'pantry'));
  useEffect(() => {
    history.replaceState(null, '', `#${tab}`);
    window.scrollTo(0, 0);
  }, [tab]);

  const today = localDate();
  const needed = store.data.shopping.filter((s) => s.status === 'needed').length;
  const dueUpkeep = store.data.upkeep.filter((t) => upkeepStatus(t, today) === 'overdue').length;
  const tabs: { id: Tab; label: string; icon: typeof Settings; badge?: number; badgeCls?: string }[] = [
    { id: 'today', label: 'Today', icon: CalendarCheck },
    { id: 'kitchen', label: 'Kitchen', icon: ChefHat },
    { id: 'shopping', label: 'Shopping', icon: ShoppingCart, badge: needed },
    { id: 'upkeep', label: 'Upkeep', icon: Wrench, badge: dueUpkeep, badgeCls: 'bg-rose-500' },
    { id: 'plans', label: 'Plans', icon: CalendarDays },
  ];
  const gear = (
    <button onClick={() => setTab('more')} aria-label="Home settings" className="rounded-xl p-2 text-stone-500 ring-1 ring-stone-200 bg-white">
      <Settings size={18} />
    </button>
  );

  return (
    <div className="mx-auto min-h-dvh max-w-lg">
      {store.error && (
        <button onClick={store.clearError} className="sticky top-0 z-40 w-full bg-rose-600 px-4 py-2 text-left text-sm text-white pt-safe">
          {store.error} (tap to dismiss)
        </button>
      )}
      <main className="px-4 pb-28 pt-6 pt-safe">
        {tab === 'today' && <TodayView onOpenShopping={() => setTab('shopping')} onGo={setTab} settingsButton={gear} />}
        {tab === 'kitchen' && (
          <>
            <div className="mb-4">
              <Segmented
                value={kitchen}
                onChange={setKitchen}
                options={[
                  { value: 'pantry', label: 'Pantry' },
                  { value: 'dishes', label: 'Dishes' },
                ]}
              />
            </div>
            {kitchen === 'pantry' ? <PantryView /> : <DishesView />}
          </>
        )}
        {tab === 'shopping' && <ShoppingView />}
        {tab === 'upkeep' && <UpkeepView />}
        {tab === 'plans' && <PlansView />}
        {tab === 'more' && <MoreView onBack={() => setTab('today')} />}
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-white/95 pb-safe backdrop-blur">
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {tabs.map((t) => {
            const Icon = t.icon;
            const on = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)} className={`relative flex flex-col items-center gap-0.5 pb-1 pt-2 text-[11px] font-medium ${on ? 'text-teal-700' : 'text-stone-500'}`}>
                <Icon size={22} strokeWidth={on ? 2.4 : 1.8} />
                {t.label}
                {!!t.badge && <span className={`absolute right-[22%] top-1 min-w-[18px] rounded-full ${t.badgeCls ?? 'bg-amber-500'} px-1 text-[10px] font-bold leading-[18px] text-white`}>{t.badge}</span>}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
