import type { Session } from '@supabase/supabase-js';
import { BookOpen, CalendarCheck, Package, Settings, ShoppingCart, Users } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { DishesView } from './components/DishesView';
import { LoginScreen } from './components/LoginScreen';
import { MoreView } from './components/MoreView';
import { PantryView } from './components/PantryView';
import { SetupWizard } from './components/SetupWizard';
import { ShoppingView } from './components/ShoppingView';
import { TodayView } from './components/TodayView';
import { ToastProvider } from './components/toast';
import { inputCls, PrimaryButton, SecondaryButton } from './components/ui';
import { CloudBackend, LocalBackend, supabase, supabaseConfigured, type Backend } from './store/backend';
import { StoreProvider, useStore } from './store/store';
import type { AppData } from './types';

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
  const [session, setSession] = useState<Session | null | undefined>(cloud ? undefined : null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await backend.load();
      if (data) setBoot({ state: 'ready', data });
      else setBoot({ state: cloud ? 'nohousehold' : 'setup' });
    } catch (e) {
      setBoot({ state: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }, [backend, cloud]);

  useEffect(() => {
    if (!cloud) {
      load();
      return;
    }
    const auth = supabase().auth;
    auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, [cloud, load]);

  // Signed in or out (cloud): load or show the sign-in screen.
  const userId = session?.user.id;
  useEffect(() => {
    if (!cloud || session === undefined) return;
    if (!userId) setBoot({ state: 'signin' });
    else {
      setBoot({ state: 'loading' });
      load();
    }
  }, [cloud, userId, session === undefined, load]); // eslint-disable-line react-hooks/exhaustive-deps

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
      <button onClick={() => supabase().auth.signOut()} className="text-sm text-stone-500">
        Sign out
      </button>
    </div>
  );
}

type Tab = 'today' | 'pantry' | 'shopping' | 'dishes' | 'more';

function Shell() {
  const store = useStore();
  const [tab, setTab] = useState<Tab>(() => (location.hash.slice(1) as Tab) || 'today');
  useEffect(() => {
    history.replaceState(null, '', `#${tab}`);
    window.scrollTo(0, 0);
  }, [tab]);

  const needed = store.data.shopping.filter((s) => s.status === 'needed').length;
  const tabs: { id: Tab; label: string; icon: typeof Package; badge?: number }[] = [
    { id: 'today', label: 'Today', icon: CalendarCheck },
    { id: 'pantry', label: 'Pantry', icon: Package },
    { id: 'shopping', label: 'Shopping', icon: ShoppingCart, badge: needed },
    { id: 'dishes', label: 'Dishes', icon: BookOpen },
    { id: 'more', label: 'Home', icon: Settings },
  ];

  return (
    <div className="mx-auto min-h-dvh max-w-lg">
      {store.error && (
        <button onClick={store.clearError} className="sticky top-0 z-40 w-full bg-rose-600 px-4 py-2 text-left text-sm text-white pt-safe">
          {store.error} (tap to dismiss)
        </button>
      )}
      <main className="px-4 pb-28 pt-6 pt-safe">
        {tab === 'today' && <TodayView onOpenShopping={() => setTab('shopping')} />}
        {tab === 'pantry' && <PantryView />}
        {tab === 'shopping' && <ShoppingView />}
        {tab === 'dishes' && <DishesView />}
        {tab === 'more' && <MoreView />}
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
                {!!t.badge && <span className="absolute right-[22%] top-1 min-w-[18px] rounded-full bg-amber-500 px-1 text-[10px] font-bold leading-[18px] text-white">{t.badge}</span>}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
