import { Home, Mail } from 'lucide-react';
import { useState } from 'react';
import { supabase } from '../store/backend';
import { Field, inputCls, PrimaryButton } from './ui';

// Email sign-in: Supabase sends a 6-digit code (and a link). Typing the code
// keeps you inside the installed app, where a link would open the browser.
export function LoginScreen() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setBusy(true);
    setError(null);
    const { error: e } = await supabase().auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: window.location.origin } });
    setBusy(false);
    if (e) setError(e.message);
    else setSent(true);
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    const { error: e } = await supabase().auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
    setBusy(false);
    if (e) setError(e.message);
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-700 text-white">
        <Home size={28} />
      </div>
      <h1 className="text-3xl font-bold text-stone-900">HomeManager</h1>
      <p className="mb-8 mt-1 text-stone-600">Meals, pantry and groceries, off your mind.</p>

      {!sent ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <Field label="Your email">
            <input className={inputCls} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <PrimaryButton type="submit" disabled={busy || !email.includes('@')} className="flex w-full items-center justify-center gap-2">
            <Mail size={18} /> {busy ? 'Sending…' : 'Email me a sign-in code'}
          </PrimaryButton>
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            verify();
          }}
        >
          <p className="mb-4 text-sm text-stone-600">
            Sent to <b>{email}</b>. Type the code from the email, or just tap the link in it.
          </p>
          <Field label="Code">
            <input className={`${inputCls} tracking-[0.4em]`} inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
          </Field>
          <PrimaryButton type="submit" disabled={busy || code.length < 6} className="w-full">
            {busy ? 'Checking…' : 'Sign in'}
          </PrimaryButton>
          <button type="button" onClick={() => setSent(false)} className="mt-3 w-full text-sm text-stone-500">
            Use a different email
          </button>
        </form>
      )}
      {error && <p className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    </div>
  );
}
