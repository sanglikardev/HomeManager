import { useEffect, useState } from 'react';
import { friendlyDate, localDate } from '../lib/dates';
import { addFeedback, listFeedback, type FeedbackItem } from '../store/backend';
import { useToast } from './toast';
import { inputCls, PrimaryButton, Segmented, Sheet } from './ui';

const STATUS: Record<FeedbackItem['status'], { label: string; cls: string }> = {
  new: { label: 'Waiting', cls: 'bg-stone-100 text-stone-600' },
  working: { label: 'Claude is on it', cls: 'bg-sky-100 text-sky-800' },
  done: { label: 'Done', cls: 'bg-emerald-100 text-emerald-800' },
  question: { label: 'Question for you', cls: 'bg-amber-100 text-amber-800' },
  declined: { label: 'Not done', cls: 'bg-rose-100 text-rose-700' },
};

// Bugs and ideas for the app itself. Claude reads these and replies in claudeNote.
export function FeedbackSheet({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [kind, setKind] = useState<'bug' | 'idea'>('bug');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<{ enabled: boolean; items: FeedbackItem[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () =>
    listFeedback()
      .then(setState)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  useEffect(() => {
    refresh();
  }, []);

  const send = async () => {
    setBusy(true);
    try {
      await addFeedback(kind, body.trim());
      setBody('');
      toast(kind === 'bug' ? 'Bug sent. Thanks!' : 'Idea sent. Thanks!');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet title="Bugs and ideas" onClose={onClose}>
      {error && <p className="mb-3 text-sm text-rose-600">{error}</p>}
      {state && !state.enabled ? (
        <p className="text-sm text-stone-600">Feedback is only open for the app owner's home.</p>
      ) : (
        <>
          <div className="mb-3">
            <Segmented
              value={kind}
              onChange={setKind}
              options={[
                { value: 'bug', label: 'Something is wrong' },
                { value: 'idea', label: 'Idea or request' },
              ]}
            />
          </div>
          <textarea
            id="feedback-body"
            className={inputCls}
            rows={4}
            maxLength={4000}
            placeholder={kind === 'bug' ? 'What happened, and what did you expect? Which screen?' : 'What would you like the app to do?'}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <PrimaryButton className="mt-3 w-full" disabled={busy || !body.trim()} onClick={send}>
            {busy ? 'Sending…' : 'Send'}
          </PrimaryButton>

          {!!state?.items.length && (
            <section className="mt-6">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Sent so far</h3>
              <div className="divide-y divide-stone-100 rounded-2xl bg-white ring-1 ring-stone-200">
                {state.items.map((f) => (
                  <div key={f.id} className="px-4 py-3">
                    <div className="mb-1 flex items-center gap-2 text-xs">
                      <span className={`rounded-full px-2 py-0.5 font-medium ${STATUS[f.status].cls}`}>{STATUS[f.status].label}</span>
                      <span className="text-stone-400">
                        {f.kind === 'bug' ? 'Bug' : 'Idea'} · {friendlyDate(localDate(new Date(f.createdAt)))}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm text-stone-800">{f.body}</p>
                    {f.claudeNote && <p className="mt-1.5 rounded-xl bg-stone-50 px-3 py-2 text-sm text-stone-600">Claude: {f.claudeNote}</p>}
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </Sheet>
  );
}
