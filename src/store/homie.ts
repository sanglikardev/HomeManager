// Homie's calls: data through token-checked database functions, the chat through the Worker
// (which holds the Claude API key).
import { homieSettings, type HomieAction, type HomieChatLine, type HomieItem, type HomieSettings } from '../lib/homie';
import type { Workout } from '../lib/training';
import { getToken, supabase } from './backend';

async function call<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase().rpc(fn, { p_token: getToken(), ...args });
  if (error) throw new Error(error.message);
  return data as T;
}

export interface HomieData {
  settings: HomieSettings;
  firstTime: boolean; // no settings saved yet
  hasSiri: boolean;
  items: HomieItem[];
  chat: HomieChatLine[];
  workouts: Workout[]; // own training log, last 8 weeks
}

export async function loadHomie(): Promise<HomieData> {
  const raw = await call<{ settings: Partial<HomieSettings> | null; hasSiri: boolean; items: HomieItem[]; chat: HomieChatLine[]; workouts?: Workout[] }>('hm_homie_load');
  return { settings: homieSettings(raw.settings), firstTime: !raw.settings, hasSiri: raw.hasSiri, items: raw.items, chat: raw.chat, workouts: raw.workouts ?? [] };
}

export const saveWorkout = (w: Workout) => call<Workout>('hm_homie_workout_save', { p_workout: w });

export const saveHomieSettings = (s: HomieSettings) => call<void>('hm_homie_save_settings', { p_settings: s });

export const saveHomieItem = (item: Partial<HomieItem>) => call<HomieItem>('hm_homie_item_save', { p_item: item });

export const clearHomieChat = () => call<void>('hm_homie_chat_clear');

export const makeSiriKey = () => call<string>('hm_homie_siri_key');

export type AskResult =
  | { ok: true; reply: string; actions: HomieAction[] }
  | { ok: false; reason: 'not_configured' | 'signin' | 'empty' | 'error' | 'offline'; message?: string };

export async function askHomie(text: string): Promise<AskResult> {
  try {
    const res = await fetch('/api/homie', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: getToken(), text }),
    });
    return (await res.json()) as AskResult;
  } catch {
    return { ok: false, reason: 'offline' };
  }
}
