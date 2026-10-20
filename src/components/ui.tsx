import { X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { LEVELS, levelName, type LevelName } from '../lib/pantry';

// Bottom sheet: the phone-friendly modal used for every edit form.
export function Sheet({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-stone-900/40" onClick={onClose} />
      <div className="relative flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-3xl bg-white shadow-xl sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="-mr-2 rounded-full p-2 text-stone-500 hover:bg-stone-100" aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="border-t border-stone-100 px-5 py-3 pb-safe">{footer}</div>}
      </div>
    </div>
  );
}

const LEVEL_STYLE: Record<LevelName, { on: string; dot: string }> = {
  Full: { on: 'bg-emerald-600 text-white border-emerald-600', dot: 'bg-emerald-500' },
  Half: { on: 'bg-sky-600 text-white border-sky-600', dot: 'bg-sky-500' },
  Low: { on: 'bg-amber-500 text-white border-amber-500', dot: 'bg-amber-500' },
  Out: { on: 'bg-rose-600 text-white border-rose-600', dot: 'bg-rose-500' },
};

export function LevelDot({ level }: { level: number }) {
  return <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${LEVEL_STYLE[levelName(level)].dot}`} />;
}

// Four-way Full / Half / Low / Out picker.
export function LevelPicker({ value, onPick, size = 'md', unsure }: { value: number | null; onPick: (v: number) => void; size?: 'sm' | 'md'; unsure?: boolean }) {
  const current = value == null ? null : levelName(value);
  return (
    <div className={`grid grid-cols-4 gap-1.5 ${size === 'sm' ? 'text-xs' : 'text-sm'}`}>
      {LEVELS.map((l) => {
        const on = current === l.name && !unsure;
        return (
          <button
            key={l.name}
            onClick={() => onPick(l.value)}
            className={`rounded-xl border font-medium transition ${size === 'sm' ? 'px-1 py-1.5' : 'px-2 py-2.5'} ${
              on ? LEVEL_STYLE[l.name].on : current === l.name ? 'border-dashed border-stone-400 bg-white text-stone-700' : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50'
            }`}
          >
            {l.name}
          </button>
        );
      })}
    </div>
  );
}

export function Pill({ children, tone = 'stone' }: { children: ReactNode; tone?: 'stone' | 'amber' | 'rose' | 'emerald' | 'sky' | 'violet' }) {
  const tones = {
    stone: 'bg-stone-100 text-stone-600',
    amber: 'bg-amber-100 text-amber-800',
    rose: 'bg-rose-100 text-rose-700',
    emerald: 'bg-emerald-100 text-emerald-800',
    sky: 'bg-sky-100 text-sky-800',
    violet: 'bg-violet-100 text-violet-800',
  };
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="mb-4 block">
      <span className="mb-1.5 block text-sm font-medium text-stone-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-stone-500">{hint}</span>}
    </label>
  );
}

export const inputCls = 'w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-base outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20';

export function PrimaryButton({ children, onClick, disabled, className = '', type = 'button' }: { children: ReactNode; onClick?: () => void; disabled?: boolean; className?: string; type?: 'button' | 'submit' }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-2xl bg-teal-700 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-teal-800 disabled:opacity-40 ${className}`}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({ children, onClick, className = '' }: { children: ReactNode; onClick?: () => void; className?: string }) {
  return (
    <button onClick={onClick} className={`rounded-2xl border border-stone-200 bg-white px-4 py-3 font-medium text-stone-700 transition hover:bg-stone-50 ${className}`}>
      {children}
    </button>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button onClick={() => onChange(!on)} className="flex w-full items-center justify-between py-2 text-left" role="switch" aria-checked={on}>
      <span className="text-sm text-stone-700">{label}</span>
      <span className={`relative h-6 w-11 rounded-full transition ${on ? 'bg-teal-600' : 'bg-stone-300'}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${on ? 'left-5.5' : 'left-0.5'}`} />
      </span>
    </button>
  );
}

export function Segmented<T extends string | number>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-xl bg-stone-100 p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-lg px-2 py-1.5 text-sm font-medium transition ${value === o.value ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Two-tap delete: the first tap arms it, the second within 3 s confirms.
// Used instead of confirm(), which some embedded browsers block.
export function ConfirmButton({ label, armedLabel, onConfirm, className = '', children }: { label: string; armedLabel: string; onConfirm: () => void; className?: string; children?: ReactNode }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      onClick={() => (armed ? onConfirm() : setArmed(true))}
      className={`${className} ${armed ? 'bg-rose-600 text-white' : ''}`}
      aria-label={armed ? armedLabel : label}
    >
      {armed ? <span className="px-1 text-sm font-semibold">{armedLabel}</span> : (children ?? label)}
    </button>
  );
}
