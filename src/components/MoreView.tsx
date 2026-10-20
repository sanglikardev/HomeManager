import { ArrowLeft, Copy, LogOut, Users } from 'lucide-react';
import { useState } from 'react';
import { resetLocalData, signOut } from '../store/backend';
import { useStore } from '../store/store';
import { HouseholdForm } from './HouseholdForm';
import { useToast } from './toast';
import { ConfirmButton, Field, inputCls } from './ui';

export function MoreView({ onBack }: { onBack?: () => void }) {
  const store = useStore();
  const toast = useToast();
  const { household } = store.data;
  const [name, setName] = useState(household.name);
  const cloud = store.backend.mode === 'cloud';

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

      <section className="rounded-2xl bg-white p-4 ring-1 ring-stone-200">
        <Field label="Name">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== household.name && store.updateHousehold({ name: name.trim() })} />
        </Field>
        <HouseholdForm settings={household.settings} onChange={(s) => store.updateHousehold({ settings: s })} />
      </section>

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
    </div>
  );
}
