import { CalendarCheck, CalendarDays, ChefHat, House, MessageSquare, Plus, Settings, Users, Wallet } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { WeeklyChores } from './components/CalendarSection';
import type { Dest } from './components/ComingUp';
import { DishesView } from './components/DishesView';
import { LoginScreen } from './components/LoginScreen';
import { HelpView } from './components/HelpView';
import { FeedbackSheet, useFeedbackReplies } from './components/FeedbackSheet';
import { MoneyView } from './components/MoneyView';
import { MoreView } from './components/MoreView';
import { PantryView } from './components/PantryView';
import { PlansView } from './components/PlansView';
import { QuickAdd } from './components/QuickAdd';
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

type Tab = 'today' | 'food' | 'home' | 'plans' | 'money' | 'more';
type FoodPage = 'shopping' | 'pantry' | 'dishes';
type HomePage = 'upkeep' | 'routine' | 'help';
const FOOD: FoodPage[] = ['shopping', 'pantry', 'dishes'];
const HOME: HomePage[] = ['upkeep', 'routine', 'help'];

// Old links (#kitchen, #upkeep...) still land on the right screen.
function fromHash(h: string): { tab: Tab; food?: FoodPage; home?: HomePage } {
  if (h === 'kitchen') return { tab: 'food', food: 'pantry' };
  if (FOOD.includes(h as FoodPage)) return { tab: 'food', food: h as FoodPage };
  if (HOME.includes(h as HomePage)) return { tab: 'home', home: h as HomePage };
  if (['today', 'food', 'home', 'plans', 'money', 'more'].includes(h)) return { tab: h as Tab };
  return { tab: 'today' };
}

function Shell() {
  const store = useStore();
  const [start] = useState(() => fromHash(location.hash.slice(1)));
  const [tab, setTab] = useState<Tab>(start.tab);
  const [food, setFood] = useState<FoodPage>(start.food ?? 'shopping');
  const [home, setHome] = useState<HomePage>(start.home ?? 'upkeep');
  const [feedback, setFeedback] = useState(false);
  const [adding, setAdding] = useState(false);
  const replies = useFeedbackReplies(store.backend.mode === 'cloud');
  useEffect(() => {
    history.replaceState(null, '', `#${tab === 'food' ? food : tab === 'home' ? home : tab}`);
  }, [tab, food, home]);
  useEffect(() => window.scrollTo(0, 0), [tab, food, home]);

  const go = (to: Dest) => {
    if (FOOD.includes(to as FoodPage)) {
      setFood(to as FoodPage);
      setTab('food');
    } else if (HOME.includes(to as HomePage)) {
      setHome(to as HomePage);
      setTab('home');
    } else setTab(to as Tab);
  };

  const today = localDate();
  const needed = store.data.shopping.filter((s) => s.status === 'needed').length;
  const dueUpkeep = store.data.upkeep.filter((t) => upkeepStatus(t, today) === 'overdue').length;
  const tabs: { id: Tab; label: string; icon: typeof Settings; badge?: number; badgeCls?: string }[] = [
    { id: 'today', label: 'Today', icon: CalendarCheck },
    { id: 'food', label: 'Food', icon: ChefHat, badge: needed },
    { id: 'home', label: 'Home', icon: House, badge: dueUpkeep, badgeCls: 'bg-rose-500' },
    { id: 'plans', label: 'Plans', icon: CalendarDays },
    { id: 'money', label: 'Money', icon: Wallet },
  ];
  const actions = (
    <div className="flex gap-2">
      {store.backend.mode === 'cloud' && (
        <button onClick={() => setFeedback(true)} aria-label={replies ? `Feedback, ${replies} new replies` : 'Send feedback'} className="relative rounded-xl bg-white p-2 text-stone-500 ring-1 ring-stone-200">
          <MessageSquare size={18} />
          {replies > 0 && <span className="absolute -right-1.5 -top-1.5 min-w-[18px] rounded-full bg-violet-600 px-1 text-[10px] font-bold leading-[18px] text-white">{replies}</span>}
        </button>
      )}
      <button onClick={() => setTab('more')} aria-label="Home settings" className="rounded-xl bg-white p-2 text-stone-500 ring-1 ring-stone-200">
        <Settings size={18} />
      </button>
    </div>
  );

  return (
    <div className="mx-auto min-h-dvh max-w-lg">
      {store.error && (
        <button onClick={store.clearError} className="sticky top-0 z-40 w-full bg-rose-600 px-4 py-2 text-left text-sm text-white pt-safe">
          {store.error} (tap to dismiss)
        </button>
      )}
      <main className="px-4 pb-32 pt-6 pt-safe">
        {tab === 'today' && <TodayView onGo={go} actions={actions} />}
        {tab === 'food' && (
          <>
            <SubTabs value={food} onChange={setFood} options={[{ value: 'shopping', label: needed ? `Shopping · ${needed}` : 'Shopping' }, { value: 'pantry', label: 'Pantry' }, { value: 'dishes', label: 'Dishes' }]} />
            {food === 'shopping' && <ShoppingView />}
            {food === 'pantry' && <PantryView />}
            {food === 'dishes' && <DishesView />}
          </>
        )}
        {tab === 'home' && (
          <>
            <SubTabs value={home} onChange={setHome} options={[{ value: 'upkeep', label: 'Upkeep' }, { value: 'routine', label: 'Routine' }, { value: 'help', label: 'Help' }]} />
            {home === 'upkeep' && <UpkeepView />}
            {home === 'routine' && (
              <div className="space-y-4">
                <h1 className="text-2xl font-bold text-stone-900">Weekly routine</h1>
                <WeeklyChores />
              </div>
            )}
          </>
        )}
        {tab === 'home' && home === 'help' && <HelpView />}
        {tab === 'plans' && <PlansView />}
        {tab === 'money' && <MoneyView />}
        {tab === 'more' && <MoreView onBack={() => setTab('today')} />}
      </main>
      {feedback && <FeedbackSheet onClose={() => setFeedback(false)} />}
      {adding && <QuickAdd onClose={() => setAdding(false)} onGo={go} />}
      {tab !== 'more' && (
        <button
          onClick={() => setAdding(true)}
          aria-label="Add"
          className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-[max(1rem,calc(50%-15rem))] z-30 flex h-14 w-14 items-center justify-center rounded-full bg-teal-700 text-white shadow-lg shadow-teal-900/20 active:scale-95"
        >
          <Plus size={28} />
        </button>
      )}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-white/95 pb-safe backdrop-blur">
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {tabs.map((t) => {
            const Icon = t.icon;
            const on = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)} className={`relative flex flex-col items-center gap-0.5 pb-1.5 pt-2 text-xs font-medium ${on ? 'text-teal-700' : 'text-stone-500'}`}>
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

function SubTabs<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="sticky top-0 z-20 -mx-4 mb-4 bg-stone-50/95 px-4 pb-2 pt-1 backdrop-blur">
      <Segmented value={value} onChange={onChange} options={options} />
    </div>
  );
}
