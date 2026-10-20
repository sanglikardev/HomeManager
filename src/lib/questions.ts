import type { Item } from '../types';
import { daysBetween, localDate } from './dates';
import { confidence, effectiveLevel, levelName, probablySpoiled } from './pantry';

export type QuestionKind = 'level' | 'fresh';

export interface Question {
  item: Item;
  kind: QuestionKind;
  text: string;
  priority: number;
}

export const QUESTIONS_PER_DAY = 3;

// Picks the few pantry items worth asking about today. relevantIds are the
// ingredients of today's suggestions: knowing those matters most.
export function pickQuestions(items: Item[], relevantIds: Set<string>, now: Date = new Date()): Question[] {
  const today = localDate(now);
  const askedToday = items.filter((i) => i.askedAt && localDate(new Date(i.askedAt)) === today).length;
  const room = Math.max(0, QUESTIONS_PER_DAY - askedToday);
  if (!room) return [];

  const qs: Question[] = [];
  for (const item of items) {
    if (daysBetween(item.askedAt, now) < 2) continue;
    if (probablySpoiled(item, now)) {
      qs.push({ item, kind: 'fresh', text: `Is the ${item.name.toLowerCase()} still good?`, priority: 90 });
      continue;
    }
    const eff = effectiveLevel(item, now);
    if (eff < 0.08) continue; // already Out: it is on the shopping list
    const conf = confidence(item, now);
    if (conf > 0.35) continue;
    const relevant = relevantIds.has(item.id);
    if (!relevant && !item.essential && !item.dailyUse) continue;
    const priority = (1 - conf) * 50 + (relevant ? 30 : 0) + (item.essential ? 15 : 0) + (item.dailyUse ? 10 : 0);
    const guess = levelName(eff).toLowerCase();
    qs.push({
      item,
      kind: 'level',
      text: `How much ${item.name.toLowerCase()} is left? I think it's ${guess === 'full' ? 'full' : `about ${guess}`}.`,
      priority,
    });
  }
  return qs.sort((a, b) => b.priority - a.priority).slice(0, room);
}
