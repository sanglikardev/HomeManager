import { useState } from 'react';
import { tourSlides } from '../lib/modules';
import type { HouseholdSettings } from '../types';
import { PrimaryButton } from './ui';

export const TOUR_KEY = 'hm_tour_pending';

export function tourPending(): boolean {
  try {
    return localStorage.getItem(TOUR_KEY) === '1';
  } catch {
    return false;
  }
}

export function setTourPending(on: boolean) {
  try {
    if (on) localStorage.setItem(TOUR_KEY, '1');
    else localStorage.removeItem(TOUR_KEY);
  } catch {
    // storage blocked: the tour just won't be remembered
  }
}

export function WelcomeTour({ settings, onClose }: { settings: HouseholdSettings; onClose: () => void }) {
  const slides = tourSlides(settings);
  const [i, setI] = useState(0);
  const last = i === slides.length - 1;
  const s = slides[i];
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-stone-50 px-6 pb-8 pt-safe">
      <div className="flex justify-end pt-4">
        <button onClick={onClose} className="rounded-xl px-3 py-2 text-sm text-stone-500">
          Skip
        </button>
      </div>
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">
          {i + 1} of {slides.length}
        </p>
        <h1 className="mt-1 text-2xl font-bold text-stone-900">{s.title}</h1>
        <p className="mt-3 text-stone-600">{s.text}</p>
      </div>
      <div className="mx-auto flex w-full max-w-sm items-center gap-3">
        {i > 0 && (
          <button onClick={() => setI(i - 1)} className="rounded-2xl border border-stone-200 bg-white px-4 py-3 font-medium text-stone-700">
            Back
          </button>
        )}
        <PrimaryButton className="flex-1" onClick={() => (last ? onClose() : setI(i + 1))}>
          {last ? 'Start using the app' : 'Next'}
        </PrimaryButton>
      </div>
    </div>
  );
}
