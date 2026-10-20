import { FileText, Image as ImageIcon, Paperclip, Plus, Search, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { localDate } from '../lib/dates';
import { docDueLabel, docStatus, type DocStatus } from '../lib/docs';
import { uid } from '../lib/id';
import type { DocFile } from '../store/backend';
import { useStore } from '../store/store';
import { DOC_CATEGORIES, type DocCategory, type DocFileMeta, type HomeDoc } from '../types';
import { useToast } from './toast';
import { ConfirmButton, Field, inputCls, PrimaryButton, Sheet } from './ui';

const STATUS_CLS: Record<DocStatus, string> = { expired: 'text-rose-700', soon: 'text-amber-700', ok: 'text-stone-500', none: 'text-stone-400' };
const MAX_PDF = 2.5 * 1024 * 1024;

export function DocsView() {
  const store = useStore();
  const today = localDate();
  const [editing, setEditing] = useState<HomeDoc | 'new' | null>(null);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<DocCategory | 'all'>('all');
  const docs = store.data.docs;
  const present = DOC_CATEGORIES.filter((c) => docs.some((d) => d.category === c.value));
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return docs
      .filter((d) => cat === 'all' || d.category === cat)
      .filter((d) => !term || `${d.title} ${d.number} ${d.notes}`.toLowerCase().includes(term))
      .sort((a, b) => {
        const rank = (d: HomeDoc) => ({ expired: 1, soon: 0, ok: 2, none: 3 })[docStatus(d, today)];
        return rank(a) - rank(b) || (a.expiryDate ?? '9').localeCompare(b.expiryDate ?? '9') || a.title.localeCompare(b.title);
      });
  }, [docs, q, cat, today]);

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-stone-900">Documents</h1>
        <button onClick={() => setEditing('new')} className="flex items-center gap-1 rounded-xl bg-teal-700 px-3 py-2 text-sm font-semibold text-white">
          <Plus size={16} /> Add
        </button>
      </header>

      {!docs.length ? (
        <button onClick={() => setEditing('new')} className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-stone-300 p-4 text-left text-sm text-stone-600">
          <FileText size={20} className="shrink-0 text-teal-700" />
          Keep warranties, bills, insurance, IDs and vehicle papers in one place. Snap a photo or add a PDF, set the expiry, and you get a reminder before it runs out.
        </button>
      ) : (
        <>
          {docs.length > 6 && (
            <div className="relative">
              <Search size={18} className="absolute left-3 top-3 text-stone-400" />
              <input className={`${inputCls} pl-10`} placeholder="Search documents" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          )}
          {present.length > 1 && (
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
              {[{ value: 'all' as const, label: 'All' }, ...present].map((c) => (
                <button
                  key={c.value}
                  onClick={() => setCat(c.value)}
                  className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium ${cat === c.value ? 'bg-stone-900 text-white' : 'bg-white text-stone-600 ring-1 ring-stone-200'}`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}
          <div className="divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200">
            {shown.map((d) => {
              const status = docStatus(d, today);
              return (
                <button key={d.id} onClick={() => setEditing(d)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-stone-900">{d.title}</p>
                    <p className={`text-xs ${STATUS_CLS[status]}`}>
                      {DOC_CATEGORIES.find((c) => c.value === d.category)?.label} · {docDueLabel(d, today)}
                    </p>
                  </div>
                  {d.files.length > 0 && (
                    <span className="flex items-center gap-0.5 text-xs text-stone-400">
                      <Paperclip size={14} /> {d.files.length}
                    </span>
                  )}
                </button>
              );
            })}
            {!shown.length && <p className="px-4 py-6 text-center text-sm text-stone-500">Nothing matches.</p>}
          </div>
        </>
      )}

      {editing && <DocSheet doc={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

// Photos are shrunk to about 1600 px JPEG so they stay small in the database.
async function readFile(file: File): Promise<{ data: string; mime: string; name: string }> {
  if (file.type.startsWith('image/')) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = () => rej(new Error('Could not read that photo'));
        i.src = url;
      });
      const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
      return { data: dataUrl.split(',')[1], mime: 'image/jpeg', name: file.name.replace(/\.\w+$/, '') + '.jpg' };
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  if (file.type !== 'application/pdf') throw new Error('Add a photo or a PDF');
  if (file.size > MAX_PDF) throw new Error('That PDF is too big (over 2.5 MB). Try a photo of the page instead.');
  const buf = new Uint8Array(await file.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return { data: btoa(bin), mime: 'application/pdf', name: file.name };
}

export function DocSheet({ doc, onClose }: { doc: HomeDoc | null; onClose: () => void }) {
  const store = useStore();
  const toast = useToast();
  const [draft, setDraft] = useState<HomeDoc>(
    doc ?? { id: uid(), title: '', category: 'appliance', number: '', expiryDate: null, remindDays: 30, notes: '', files: [], createdAt: new Date().toISOString() },
  );
  const [added, setAdded] = useState<DocFile[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<DocFileMeta | null>(null);
  const set = (patch: Partial<HomeDoc>) => setDraft((d) => ({ ...d, ...patch }));
  const valid = draft.title.trim().length > 0;

  const addFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true);
    try {
      for (const f of Array.from(list)) {
        const r = await readFile(f);
        const file: DocFile = { id: uid(), docId: draft.id, ...r };
        setAdded((a) => [...a, file]);
        setDraft((d) => ({ ...d, files: [...d.files, { id: file.id, name: r.name, mime: r.mime, size: Math.round((r.data.length * 3) / 4) }] }));
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const removeFile = (id: string) => {
    setDraft((d) => ({ ...d, files: d.files.filter((f) => f.id !== id) }));
    if (added.some((f) => f.id === id)) setAdded((a) => a.filter((f) => f.id !== id));
    else setRemoved((r) => [...r, id]);
  };

  const save = () => {
    store.saveDoc({ ...draft, title: draft.title.trim(), number: draft.number.trim() }, added, removed);
    onClose();
  };

  return (
    <Sheet
      title={doc ? 'Document' : 'Add document'}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          {doc && (
            <ConfirmButton
              label="Delete document"
              armedLabel="Tap again to delete"
              onConfirm={() => {
                store.deleteDoc(doc);
                onClose();
              }}
              className="rounded-2xl border border-rose-200 px-4 text-rose-600"
            >
              <Trash2 size={18} />
            </ConfirmButton>
          )}
          <PrimaryButton className="flex-1" disabled={!valid || busy} onClick={save}>
            {busy ? 'Reading file…' : 'Save'}
          </PrimaryButton>
        </div>
      }
    >
      <Field label="What is it">
        <input id="doc-title" className={inputCls} placeholder="e.g. Fridge warranty, Car insurance, Passport" value={draft.title} onChange={(e) => set({ title: e.target.value })} autoFocus={!doc} />
      </Field>
      <Field label="Type">
        <div className="flex flex-wrap gap-1.5">
          {DOC_CATEGORIES.map((c) => (
            <button key={c.value} type="button" onClick={() => set({ category: c.value })} className={`rounded-full px-3 py-1.5 text-sm ${draft.category === c.value ? 'bg-teal-700 text-white' : 'bg-stone-100 text-stone-700'}`}>
              {c.label}
            </button>
          ))}
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={draft.category === 'appliance' ? 'Warranty ends' : 'Expires (optional)'}>
          <input id="doc-expiry" type="date" className={inputCls} value={draft.expiryDate ?? ''} onChange={(e) => set({ expiryDate: e.target.value || null })} />
        </Field>
        <Field label="Remind me">
          <select id="doc-remind" className={inputCls} value={draft.remindDays} onChange={(e) => set({ remindDays: Number(e.target.value) })}>
            <option value={7}>1 week before</option>
            <option value={30}>1 month before</option>
            <option value={60}>2 months before</option>
          </select>
        </Field>
      </div>
      <Field label="Number (optional)" hint="Policy, serial, document or account number">
        <input id="doc-number" className={inputCls} value={draft.number} onChange={(e) => set({ number: e.target.value })} />
      </Field>
      <Field label="Notes (optional)">
        <textarea id="doc-notes" className={inputCls} rows={2} placeholder="Shop, service phone number, where the original is kept" value={draft.notes} onChange={(e) => set({ notes: e.target.value })} />
      </Field>

      <p className="mb-1.5 text-sm font-medium text-stone-700">Photos and PDFs</p>
      {draft.files.length > 0 && (
        <div className="mb-2 divide-y divide-stone-100 rounded-2xl bg-white ring-1 ring-stone-200">
          {draft.files.map((f) => {
            const fresh = added.find((a) => a.id === f.id);
            return (
              <div key={f.id} className="flex items-center gap-3 px-3 py-2">
                {f.mime.startsWith('image/') ? <ImageIcon size={18} className="text-stone-400" /> : <FileText size={18} className="text-stone-400" />}
                <button onClick={() => !fresh && setViewing(f)} className="min-w-0 flex-1 truncate text-left text-sm text-stone-800">
                  {f.name}
                  <span className="text-xs text-stone-400"> · {Math.max(1, Math.round(f.size / 1024))} KB{fresh ? ' · new' : ''}</span>
                </button>
                <button onClick={() => removeFile(f.id)} aria-label={`Remove ${f.name}`} className="p-1 text-stone-400">
                  <X size={16} />
                </button>
              </div>
            );
          })}
        </div>
      )}
      <label className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-stone-300 py-3 text-sm font-medium text-teal-700">
        <Paperclip size={16} /> {busy ? 'Reading…' : 'Add a photo or PDF'}
        <input id="doc-file" type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={(e) => addFiles(e.target.files).then(() => (e.target.value = ''))} />
      </label>

      {viewing && <FileViewer meta={viewing} onClose={() => setViewing(null)} />}
    </Sheet>
  );
}

function FileViewer({ meta, onClose }: { meta: DocFileMeta; onClose: () => void }) {
  const store = useStore();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let made: string | null = null;
    store.backend
      .getDocFile(meta.id)
      .then((f) => {
        if (!f) throw new Error('File not found');
        const bin = atob(f.data);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        made = URL.createObjectURL(new Blob([bytes], { type: f.mime }));
        setUrl(made);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    return () => {
      if (made) URL.revokeObjectURL(made);
    };
  }, [meta.id, store.backend]);
  return (
    <Sheet title={meta.name} onClose={onClose}>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      {!url && !error && <p className="py-8 text-center text-sm text-stone-500">Loading…</p>}
      {url && meta.mime.startsWith('image/') && <img src={url} alt={meta.name} className="w-full rounded-2xl" />}
      {url && (
        <a href={url} target="_blank" rel="noreferrer" download={meta.name} className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-teal-700 py-3 font-semibold text-white">
          <FileText size={18} /> {meta.mime === 'application/pdf' ? 'Open PDF' : 'Save to phone'}
        </a>
      )}
    </Sheet>
  );
}
