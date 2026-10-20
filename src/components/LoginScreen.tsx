import { Home } from 'lucide-react';
import { useState } from 'react';
import { supabase } from '../store/backend';
import { Field, inputCls, PrimaryButton, Segmented } from './ui';

// Email + password sign-in. Each family member makes their own account,
// then creates or joins the household.
export function LoginScreen() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    const auth = supabase().auth;
    const creds = { email: email.trim(), password };
    if (mode === 'signin') {
      const { error: e } = await auth.signInWithPassword(creds);
      if (e) setError(e.message === 'Invalid login credentials' ? 'Wrong email or password.' : e.message);
    } else {
      const { data, error: e } = await auth.signUp(creds);
      if (e) setError(e.message);
      else if (!data.session) {
        // Supabase wants the address confirmed first.
        setNotice('Account created. Open the confirmation email and tap its link (it may open a different page, that is fine), then come back here and sign in.');
        setMode('signin');
      }
    }
    setBusy(false);
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-700 text-white">
        <Home size={28} />
      </div>
      <h1 className="text-3xl font-bold text-stone-900">HomeManager</h1>
      <p className="mb-6 mt-1 text-stone-600">Meals, pantry and groceries, off your mind.</p>

      <div className="mb-5">
        <Segmented
          value={mode}
          onChange={(m) => {
            setMode(m);
            setError(null);
          }}
          options={[
            { value: 'signin', label: 'Sign in' },
            { value: 'signup', label: 'Create account' },
          ]}
        />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field label="Email">
          <input id="email" className={inputCls} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password" hint={mode === 'signup' ? 'At least 6 characters.' : undefined}>
          <input
            id="password"
            className={inputCls}
            type="password"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <PrimaryButton type="submit" disabled={busy || !email.includes('@') || password.length < 6} className="w-full">
          {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </PrimaryButton>
      </form>
      {notice && <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
      {error && <p className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    </div>
  );
}
