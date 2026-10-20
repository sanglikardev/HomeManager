import { Home } from 'lucide-react';
import { useState } from 'react';
import { signIn } from '../store/backend';
import { Field, inputCls, PrimaryButton } from './ui';

// Username + password. The first time a username is used, the account is
// created with that password; after that the same password is needed.
export function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await signIn(username, password);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-700 text-white">
        <Home size={28} />
      </div>
      <h1 className="text-3xl font-bold text-stone-900">HomeManager</h1>
      <p className="mb-8 mt-1 text-stone-600">Meals, pantry and groceries, off your mind.</p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field label="Username">
          <input id="username" className={inputCls} autoComplete="username" autoCapitalize="none" required value={username} onChange={(e) => setUsername(e.target.value)} />
        </Field>
        <Field label="Password" hint="New here? Pick any username and password and it becomes your account.">
          <input id="password" className={inputCls} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <PrimaryButton type="submit" disabled={busy || !username.trim() || !password} className="w-full">
          {busy ? 'Signing in…' : 'Sign in'}
        </PrimaryButton>
      </form>
      {error && <p className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    </div>
  );
}
