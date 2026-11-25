// Homie, the personal assistant: one chat turn with Claude, plus the tools it uses to
// file what you say (reminders, facts, notes, busy days, and household to-dos,
// shopping, expenses and habit logs). Runs in the Worker with the caller's session
// token, so every write goes through the same token-checked database functions as the app.

import Anthropic from '@anthropic-ai/sdk';
import type { BetaMessageParam, BetaTextBlockParam, BetaToolUnion, BetaContentBlock, BetaToolResultBlockParam } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { DEFAULT_EXPENSE_CATEGORIES } from '../src/types';
import { buildBrief, cleanInterests, cleanSettingsPatch, friendlyWhen, homieSettings, isDate, localToday, localToUtc, type BriefContext, type HomieAction, type HomieChatLine, type HomieSettings } from '../src/lib/homie';

export const DEFAULT_MODEL = 'claude-opus-5-5';
const MAX_ROUNDS = 6;

export type Rpc = (fn: string, args: Record<string, unknown>) => Promise<unknown>;

export interface HomieContext {
  now: string;
  weekday: string;
  username: string;
  settings: Partial<HomieSettings>;
  items: { id: string; kind: string; text: string; at: string | null; day: string | null; done: boolean }[];
  chat: HomieChatLine[];
  home: {
    habits: { id: string; name: string; kind: string; target: number; unit: string }[];
    [k: string]: unknown;
  } | null;
}

// ---------- prompt ----------

// Kept identical across requests so it can be cached; everything that changes goes in the context block.
export const SYSTEM = `You are the personal assistant inside HomeManager, a phone app. Your name and tone are in the settings below. You talk with one person, the owner of this account. Your own notes (facts, notes, reminders, busy days) are private to them. The "home" data (habits, to-dos, shopping, bills, plans) is shared with their family.

How to reply
- Replies are read on a phone, often in traffic, or spoken aloud by Siri. Keep them short: one to three sentences unless they ask for more. Plain text. Short "- " lines are fine for lists. No headings, tables or emoji strings.
- Tone, from settings.tone: "gentle" is warm and encouraging. "firm" is direct, holds them to what they committed to, calls out excuses, and stays respectful. "drill" is blunt drill-sergeant energy, never insulting.
- Use their routine (wake time, leave time, office days, commute, home-by time, busy days) to suggest when personal things fit.
- Answer from the context below. If something is not there, say you don't know rather than guessing.

Filing what they tell you (use the tools)
- Anything with a time: add_reminder. Convert relative times ("tomorrow morning", "in 2 hours", "Friday evening") to local YYYY-MM-DDTHH:MM using "now". Morning without a time means 30 minutes after their wake time; evening means 19:00. Say the time you picked.
- Lasting facts about their life (people, birthdays, preferences, goals, health, sizes, routines): remember. Check the known facts first and don't save duplicates; if a fact changed, forget the old one and remember the new one.
- Ideas, thoughts, journal entries, things to think about: save_note.
- A day that will be heavy or busy at work: mark_busy. They don't want work details stored: save only that the day is busy and roughly why ("release day, late"), nothing confidential.
- Household tasks without a precise time: add_todo. Groceries: add_shopping. Money they spent: log_expense. A habit they did (match the habit by name in home.habits and use its id): log_habit.
- Changes to their routine or your settings (wake time, office days, tone, briefs): update_settings.
- Don't file small talk. One message can need several tools. After filing, confirm briefly what you saved.

About them
- settings.about is what they asked you to always keep in mind (goals, health, likes). Use it.
- Health and training: encourage, track and plan. For new pain, swelling or an injury, tell them to check with a doctor or physio. Never diagnose.`;

const TONE: Record<string, string> = { gentle: 'gentle', firm: 'firm', drill: 'drill' };

export function contextBlock(ctx: HomieContext): string {
  const s = homieSettings(ctx.settings);
  const { chat: _chat, ...rest } = ctx;
  return `Settings and current data (JSON). Times are the user's local time unless marked UTC.
${JSON.stringify({ ...rest, settings: { ...s, tone: TONE[s.tone] ?? 'firm' } })}`;
}

// ---------- tools ----------

const str = { type: 'string' } as const;
const nstr = { type: ['string', 'null'] } as const;

export const TOOLS: BetaToolUnion[] = [
  {
    name: 'add_reminder',
    description: 'Set a reminder that is sent to their phone at a local date and time.',
    strict: true,
    input_schema: { type: 'object', properties: { text: str, at: { type: 'string', description: 'Local time, YYYY-MM-DDTHH:MM' } }, required: ['text', 'at'], additionalProperties: false },
  },
  {
    name: 'remember',
    description: 'Save a lasting fact about their life to "Things Homie knows".',
    strict: true,
    input_schema: { type: 'object', properties: { text: str }, required: ['text'], additionalProperties: false },
  },
  {
    name: 'save_note',
    description: 'Save an idea, thought or journal entry.',
    strict: true,
    input_schema: { type: 'object', properties: { text: str }, required: ['text'], additionalProperties: false },
  },
  {
    name: 'mark_busy',
    description: 'Mark a day as busy at work (no work details), so personal plans avoid it.',
    strict: true,
    input_schema: { type: 'object', properties: { date: { type: 'string', description: 'YYYY-MM-DD' }, text: str }, required: ['date', 'text'], additionalProperties: false },
  },
  {
    name: 'complete_reminder',
    description: 'Mark one of their reminders as done, by id from items.',
    strict: true,
    input_schema: { type: 'object', properties: { id: str }, required: ['id'], additionalProperties: false },
  },
  {
    name: 'forget',
    description: 'Forget a fact, note, reminder or busy day, by id from items.',
    strict: true,
    input_schema: { type: 'object', properties: { id: str }, required: ['id'], additionalProperties: false },
  },
  {
    name: 'add_todo',
    description: 'Add a household to-do (shared with the family), with an optional due date.',
    strict: true,
    input_schema: { type: 'object', properties: { title: str, due_date: { type: ['string', 'null'], description: 'YYYY-MM-DD or null' } }, required: ['title', 'due_date'], additionalProperties: false },
  },
  {
    name: 'add_shopping',
    description: 'Add items to the household shopping list.',
    strict: true,
    input_schema: { type: 'object', properties: { items: { type: 'array', items: str } }, required: ['items'], additionalProperties: false },
  },
  {
    name: 'log_expense',
    description: 'Record money they spent (private to them unless they share expenses).',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        amount: { type: 'number', description: 'Rupees' },
        category: { type: 'string', enum: DEFAULT_EXPENSE_CATEGORIES },
        note: str,
        date: { type: ['string', 'null'], description: 'YYYY-MM-DD, null for today' },
      },
      required: ['amount', 'category', 'note', 'date'],
      additionalProperties: false,
    },
  },
  {
    name: 'log_habit',
    description: 'Log a habit for today, by habit id from home.habits. amount: null for a tick, or a number for count habits.',
    strict: true,
    input_schema: { type: 'object', properties: { habit_id: str, amount: { type: ['number', 'null'] }, note: nstr }, required: ['habit_id', 'amount', 'note'], additionalProperties: false },
  },
  {
    name: 'update_settings',
    description: 'Change their routine or assistant settings. Use null for anything not changing.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        wake: nstr,
        leave: nstr,
        homeBy: nstr,
        evening: nstr,
        commuteMin: { type: ['number', 'null'] },
        officeDays: { type: ['array', 'null'], items: { type: 'integer' }, description: '0 = Sunday' },
        tone: { type: ['string', 'null'], enum: ['gentle', 'firm', 'drill', null] },
        morningBrief: { type: ['boolean', 'null'] },
        eveningBrief: { type: ['boolean', 'null'] },
      },
      required: ['wake', 'leave', 'homeBy', 'evening', 'commuteMin', 'officeDays', 'tone', 'morningBrief', 'eveningBrief'],
      additionalProperties: false,
    },
  },
  {
    name: 'lookup',
    description:
      'Read more of their data. plans: trips and events with checklists (ids for add_plan_tasks / tick_plan_tasks). todos: household to-dos with ids. upkeep, bills, documents (titles and expiry). habit_logs: what was logged when, with notes (workouts, PRs). expenses: their own spending with totals by category. my_history: everything they asked you to keep, including done reminders and scout finds. from/to are YYYY-MM-DD or null; search filters by name or text.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        what: { type: 'string', enum: ['plans', 'todos', 'upkeep', 'bills', 'documents', 'habit_logs', 'expenses', 'my_history'] },
        from: nstr,
        to: nstr,
        search: nstr,
      },
      required: ['what', 'from', 'to', 'search'],
      additionalProperties: false,
    },
  },
  {
    name: 'add_plan',
    description: 'Add a trip, event or plan to the shared calendar, with an optional checklist (packing, bookings, to-dos).',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        title: str,
        kind: { type: 'string', enum: ['trip', 'event', 'holiday', 'other'] },
        start_date: { type: 'string', description: 'YYYY-MM-DD' },
        end_date: { type: ['string', 'null'], description: 'YYYY-MM-DD, null for one day' },
        destination: str,
        international: { type: 'boolean' },
        time: { type: ['string', 'null'], description: 'HH:MM or null' },
        notes: str,
        tasks: { type: 'array', items: { type: 'object', properties: { text: str, due: nstr }, required: ['text', 'due'], additionalProperties: false } },
      },
      required: ['title', 'kind', 'start_date', 'end_date', 'destination', 'international', 'time', 'notes', 'tasks'],
      additionalProperties: false,
    },
  },
  {
    name: 'add_plan_tasks',
    description: "Add checklist items to an existing plan (plan id from lookup 'plans').",
    strict: true,
    input_schema: {
      type: 'object',
      properties: { plan_id: str, tasks: { type: 'array', items: { type: 'object', properties: { text: str, due: nstr }, required: ['text', 'due'], additionalProperties: false } } },
      required: ['plan_id', 'tasks'],
      additionalProperties: false,
    },
  },
  {
    name: 'tick_plan_tasks',
    description: "Tick off checklist items of a plan (ids from lookup 'plans').",
    strict: true,
    input_schema: { type: 'object', properties: { plan_id: str, task_ids: { type: 'array', items: str } }, required: ['plan_id', 'task_ids'], additionalProperties: false },
  },
  {
    name: 'complete_todo',
    description: "Mark a household to-do done (id from lookup 'todos').",
    strict: true,
    input_schema: { type: 'object', properties: { id: str }, required: ['id'], additionalProperties: false },
  },
  {
    name: 'update_interests',
    description: 'Change what the daily scout watches for them (comedians, artists, stocks, topics, places).',
    strict: true,
    input_schema: { type: 'object', properties: { add: { type: 'array', items: str }, remove: { type: 'array', items: str } }, required: ['add', 'remove'], additionalProperties: false },
  },
  {
    name: 'save_find',
    description: 'Save something worth their attention that you found (a show, news, a deal) so they can see it later and it is not repeated.',
    strict: true,
    input_schema: { type: 'object', properties: { title: str, detail: str, url: nstr }, required: ['title', 'detail', 'url'], additionalProperties: false },
  },
  {
    name: 'notify',
    description: 'Send a notification to their phone now. Only for things worth interrupting them for; at most 6 a day.',
    strict: true,
    input_schema: { type: 'object', properties: { title: str, body: str }, required: ['title', 'body'], additionalProperties: false },
  },
];

const uuid = () => crypto.randomUUID();
const UUID = /^[0-9a-f-]{36}$/i;
const clip = (s: unknown, n = 500) => (typeof s === 'string' ? s.trim().slice(0, n) : '');

interface ToolOut {
  result: string;
  action?: HomieAction;
  error?: boolean;
}

// Runs one tool call. Bad input comes back as an error result Claude can correct.
export type Notify = (title: string, body: string) => Promise<string>;

type Row = Record<string, unknown> & { id: string };
const taskRows = (v: unknown) =>
  (Array.isArray(v) ? v : [])
    .map((t) => (t && typeof t === 'object' ? (t as Record<string, unknown>) : {}))
    .map((t) => ({ id: uuid(), text: clip(t.text, 200), due: isDate(t.due) ? t.due : null, done: false }))
    .filter((t) => t.text)
    .slice(0, 60);

export async function runTool(name: string, input: Record<string, unknown>, ctx: HomieContext, token: string, rpc: Rpc, notify?: Notify): Promise<ToolOut> {
  const s = homieSettings(ctx.settings);
  const today = localToday(s.tzOffsetMin);
  const nowIso = new Date().toISOString();
  const saveItem = async (item: Record<string, unknown>) => (await rpc('hm_homie_item_save', { p_token: token, p_item: item })) as { id: string };
  const fail = (msg: string): ToolOut => ({ result: msg, error: true });
  const own = (id: unknown) => typeof id === 'string' && ctx.items.some((i) => i.id === id);

  switch (name) {
    case 'add_reminder': {
      const text = clip(input.text);
      const at = typeof input.at === 'string' ? localToUtc(input.at, s.tzOffsetMin) : null;
      if (!text) return fail('text is empty');
      if (!at) return fail('at must be local YYYY-MM-DDTHH:MM');
      if (Date.parse(at) < Date.now() - 60_000) return fail('that time has already passed; pick a future time');
      const row = await saveItem({ kind: 'reminder', text, at });
      return { result: `saved, id ${row.id}`, action: { kind: 'reminder', label: `Reminder ${friendlyWhen(at, s.tzOffsetMin)}: ${text}`, itemId: row.id } };
    }
    case 'remember':
    case 'save_note': {
      const text = clip(input.text, 2000);
      if (!text) return fail('text is empty');
      const kind = name === 'remember' ? 'fact' : 'note';
      const row = await saveItem({ kind, text });
      return { result: `saved, id ${row.id}`, action: { kind, label: `${kind === 'fact' ? 'Noted' : 'Note saved'}: ${text}`, itemId: row.id } };
    }
    case 'mark_busy': {
      const text = clip(input.text, 200) || 'Busy';
      if (!isDate(input.date)) return fail('date must be YYYY-MM-DD');
      const row = await saveItem({ kind: 'busy', text, day: input.date });
      return { result: `saved, id ${row.id}`, action: { kind: 'busy', label: `Busy ${input.date}: ${text}`, itemId: row.id } };
    }
    case 'complete_reminder':
    case 'forget': {
      if (!own(input.id)) return fail('no item with that id');
      const item = ctx.items.find((i) => i.id === input.id)!;
      await saveItem(name === 'forget' ? { id: input.id, forgotten: true } : { id: input.id, done: true });
      return { result: 'done', action: { kind: name === 'forget' ? 'forget' : 'done', label: `${name === 'forget' ? 'Forgot' : 'Done'}: ${item.text}`, itemId: item.id } };
    }
    case 'add_todo': {
      const title = clip(input.title, 200);
      if (!title) return fail('title is empty');
      const due = input.due_date == null ? null : isDate(input.due_date) ? input.due_date : undefined;
      if (due === undefined) return fail('due_date must be YYYY-MM-DD or null');
      await rpc('hm_upsert', { p_token: token, p_table: 'hm_todos', p_rows: [{ id: uuid(), title, due_date: due, done: false, done_on: null, notes: '', created_at: nowIso }] });
      return { result: 'added', action: { kind: 'todo', label: `To-do: ${title}${due ? ` (due ${due})` : ''}` } };
    }
    case 'add_shopping': {
      const names = (Array.isArray(input.items) ? input.items : []).map((n) => clip(n, 80)).filter(Boolean).slice(0, 30);
      if (!names.length) return fail('no items');
      const rows = names.map((n) => ({ id: uuid(), item_id: null, name: n, note: '', bucket: 'quick', status: 'needed', source: 'manual', created_at: nowIso }));
      await rpc('hm_upsert', { p_token: token, p_table: 'hm_shopping', p_rows: rows });
      return { result: 'added', action: { kind: 'shopping', label: `Shopping: ${names.join(', ')}` } };
    }
    case 'log_expense': {
      const amount = typeof input.amount === 'number' && input.amount > 0 && input.amount < 10_000_000 ? Math.round(input.amount * 100) / 100 : 0;
      if (!amount) return fail('amount must be a positive number of rupees');
      const category = DEFAULT_EXPENSE_CATEGORIES.includes(input.category as string) ? (input.category as string) : 'Other';
      const date = input.date == null ? today : isDate(input.date) && input.date <= today ? input.date : null;
      if (!date) return fail('date must be YYYY-MM-DD, not in the future, or null');
      const note = clip(input.note, 200);
      await rpc('hm_upsert', { p_token: token, p_table: 'hm_expenses', p_rows: [{ id: uuid(), date, amount, category, note, paid_by: ctx.username, bill_id: null, source: 'manual', created_at: nowIso }] });
      return { result: 'logged', action: { kind: 'expense', label: `Spent ₹${amount.toLocaleString('en-IN')} · ${category}${note ? ` · ${note}` : ''}` } };
    }
    case 'log_habit': {
      const habit = ctx.home?.habits.find((h) => h.id === input.habit_id);
      if (!habit || !UUID.test(habit.id)) return fail('no habit with that id');
      const amount = typeof input.amount === 'number' && input.amount > 0 ? input.amount : habit.kind === 'count' ? 1 : habit.target || 1;
      const note = clip(input.note, 500);
      await rpc('hm_upsert', { p_token: token, p_table: 'hm_habit_logs', p_rows: [{ id: uuid(), habit_id: habit.id, date: today, amount, note, created_at: nowIso }] });
      return { result: 'logged', action: { kind: 'habit', label: `${habit.name}${habit.kind === 'count' ? ` +${amount}${habit.unit ? ` ${habit.unit}` : ''}` : ' ✓'}${note ? ` · ${note}` : ''}` } };
    }
    case 'update_settings': {
      const patch = cleanSettingsPatch(Object.fromEntries(Object.entries(input).filter(([, v]) => v !== null)));
      if (!Object.keys(patch).length) return fail('nothing valid to change (times are HH:MM)');
      const next = { ...s, ...patch };
      await rpc('hm_homie_save_settings', { p_token: token, p_settings: next });
      ctx.settings = next;
      return { result: 'saved', action: { kind: 'settings', label: `Settings: ${Object.entries(patch).map(([k, v]) => `${k} ${Array.isArray(v) ? v.join(',') : v}`).join(', ')}` } };
    }
    case 'lookup': {
      const what = String(input.what);
      const out = await rpc('hm_homie_lookup', {
        p_token: token,
        p_what: what,
        p_from: isDate(input.from) ? input.from : null,
        p_to: isDate(input.to) ? input.to : null,
        p_search: typeof input.search === 'string' ? input.search.slice(0, 80) : null,
      });
      return { result: JSON.stringify(out) };
    }
    case 'add_plan': {
      const title = clip(input.title, 200);
      if (!title) return fail('title is empty');
      if (!isDate(input.start_date)) return fail('start_date must be YYYY-MM-DD');
      const end = input.end_date == null ? input.start_date : isDate(input.end_date) && input.end_date >= input.start_date ? input.end_date : null;
      if (!end) return fail('end_date must be YYYY-MM-DD on or after start_date, or null');
      const kind = ['trip', 'event', 'holiday', 'other'].includes(input.kind as string) ? input.kind : 'other';
      const time = typeof input.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(input.time) ? input.time : '';
      const checklist = taskRows(input.tasks);
      await rpc('hm_upsert', {
        p_token: token,
        p_table: 'hm_plans',
        p_rows: [{ id: uuid(), title, kind, destination: clip(input.destination, 120), international: input.international === true, start_date: input.start_date, end_date: end, time, checklist, notes: clip(input.notes, 4000), created_at: nowIso }],
      });
      return { result: 'added', action: { kind: 'todo', label: `Plan: ${title} (${input.start_date}${end !== input.start_date ? ` to ${end}` : ''})${checklist.length ? `, ${checklist.length} checklist items` : ''}` } };
    }
    case 'add_plan_tasks':
    case 'tick_plan_tasks': {
      const plans = (await rpc('hm_homie_lookup', { p_token: token, p_what: 'plans', p_from: '1900-01-01', p_to: null, p_search: null })) as Row[];
      const plan = plans.find((p) => p.id === input.plan_id);
      if (!plan) return fail("no plan with that id; use lookup 'plans'");
      const list = (Array.isArray(plan.checklist) ? plan.checklist : []) as { id: string; text: string; due: string | null; done: boolean }[];
      let checklist = list;
      let label: string;
      if (name === 'add_plan_tasks') {
        const add = taskRows(input.tasks);
        if (!add.length) return fail('no tasks');
        checklist = [...list, ...add];
        label = `${plan.title}: added ${add.map((t) => t.text).join(', ')}`;
      } else {
        const ids = new Set(Array.isArray(input.task_ids) ? (input.task_ids as string[]) : []);
        const hit = list.filter((t) => ids.has(t.id));
        if (!hit.length) return fail('none of those task ids are on this plan');
        checklist = list.map((t) => (ids.has(t.id) ? { ...t, done: true } : t));
        label = `${plan.title}: ticked ${hit.map((t) => t.text).join(', ')}`;
      }
      await rpc('hm_upsert', { p_token: token, p_table: 'hm_plans', p_rows: [{ ...plan, checklist }] });
      return { result: 'saved', action: { kind: 'todo', label } };
    }
    case 'complete_todo': {
      const todos = (await rpc('hm_homie_lookup', { p_token: token, p_what: 'todos', p_from: null, p_to: null, p_search: null })) as Row[];
      const todo = todos.find((t) => t.id === input.id);
      if (!todo) return fail("no to-do with that id; use lookup 'todos'");
      await rpc('hm_upsert', { p_token: token, p_table: 'hm_todos', p_rows: [{ ...todo, done: true, done_on: today }] });
      return { result: 'done', action: { kind: 'todo', label: `Done: ${todo.title}` } };
    }
    case 'update_interests': {
      const add = Array.isArray(input.add) ? input.add : [];
      const remove = new Set((Array.isArray(input.remove) ? input.remove : []).map((x) => String(x).trim().toLowerCase()));
      const interests = cleanInterests([...s.interests.filter((i) => !remove.has(i.toLowerCase())), ...add]);
      const next = { ...s, interests };
      await rpc('hm_homie_save_settings', { p_token: token, p_settings: next });
      ctx.settings = next;
      return { result: `interests now: ${interests.join(', ') || 'none'}`, action: { kind: 'settings', label: `Interests: ${interests.join(', ') || 'none'}` } };
    }
    case 'save_find': {
      const title = clip(input.title, 150);
      if (!title) return fail('title is empty');
      const url = typeof input.url === 'string' && /^https?:\/\//.test(input.url) ? input.url.slice(0, 400) : '';
      const text = `Scout: ${title}. ${clip(input.detail, 800)}${url ? ` ${url}` : ''}`;
      const row = await saveItem({ kind: 'note', text });
      return { result: `saved, id ${row.id}`, action: { kind: 'note', label: `Saved find: ${title}`, itemId: row.id } };
    }
    case 'notify': {
      if (!notify) return fail('notifications are not available here');
      const title = clip(input.title, 80);
      const body = clip(input.body, 300);
      if (!title || !body) return fail('title and body are needed');
      return { result: await notify(title, body) };
    }
    default:
      return fail(`unknown tool ${name}`);
  }
}

// ---------- one chat turn ----------

function client(apiKey: string) {
  return new Anthropic({ apiKey, maxRetries: 2, timeout: 60_000 });
}

const textOf = (content: BetaContentBlock[]) =>
  content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { text: string }).text)
    .join('\n')
    .trim();

// Earlier chat as plain text turns (no tool calls), starting with the person.
export function historyMessages(chat: HomieChatLine[]): BetaMessageParam[] {
  const out: BetaMessageParam[] = [];
  for (const line of chat.slice(-20)) {
    if (!line.text.trim()) continue;
    if (!out.length && line.role !== 'user') continue;
    out.push({ role: line.role, content: line.text });
  }
  return out;
}

export interface TurnResult {
  reply: string;
  actions: HomieAction[];
}

export async function homieTurn(opts: { apiKey: string; model?: string; token: string; text: string; ctx: HomieContext; rpc: Rpc; notify?: Notify }): Promise<TurnResult> {
  const { ctx, token, rpc } = opts;
  const api = client(opts.apiKey);
  const system: BetaTextBlockParam[] = [
    { type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: contextBlock(ctx) },
  ];
  const messages: BetaMessageParam[] = [...historyMessages(ctx.chat), { role: 'user', content: opts.text }];
  const actions: HomieAction[] = [];
  let reply = '';

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const res = await api.beta.messages.create({
      model: opts.model || DEFAULT_MODEL,
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      system,
      tools: TOOLS,
      messages,
    });
    if (res.stop_reason === 'refusal') {
      reply = "Sorry, I can't help with that one.";
      break;
    }
    const said = textOf(res.content);
    if (said) reply = said;
    if (res.stop_reason !== 'tool_use') break;

    messages.push({ role: 'assistant', content: res.content });
    const results: BetaToolResultBlockParam[] = [];
    for (const block of res.content) {
      if (block.type !== 'tool_use') continue;
      let out: ToolOut;
      try {
        out = await runTool(block.name, (block.input ?? {}) as Record<string, unknown>, ctx, token, rpc, opts.notify);
      } catch (e) {
        out = { result: `failed: ${e instanceof Error ? e.message : String(e)}`, error: true };
      }
      if (out.action) actions.push(out.action);
      results.push({ type: 'tool_result', tool_use_id: block.id, content: out.result, is_error: out.error || undefined });
    }
    messages.push({ role: 'user', content: results });
  }
  if (!reply) reply = actions.length ? 'Done.' : "I'm here. What do you need?";
  return { reply, actions };
}

// ---------- morning and evening briefs ----------

const BRIEF_ASK = {
  morning:
    'Write my morning brief as a phone notification: at most 3 short sentences, under 300 characters, plain text. Cover what matters today: office day or not and when to leave, workout and knee exercises if those habits exist, any reminders, busy day, bills or plans today. End with one push in my tone. Nothing generic.',
  evening:
    "Write my evening wrap-up as a phone notification: at most 3 short sentences, under 300 characters, plain text. Say which of today's habits got done and which didn't, what's first tomorrow, and when to be in bed to hit my wake time (about 7.5 hours before it). Use my tone.",
};

// Written by Claude when the app has an API key, otherwise built from rules.
export async function writeBrief(opts: { apiKey?: string; model?: string; kind: 'morning' | 'evening'; ctx: HomieContext }): Promise<string | null> {
  if (!opts.apiKey) return buildBrief(opts.ctx as unknown as BriefContext, opts.kind);
  const res = await client(opts.apiKey).beta.messages.create({
    model: opts.model || DEFAULT_MODEL,
    max_tokens: 2000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low' },
    system: [
      { type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: contextBlock(opts.ctx) },
    ],
    messages: [{ role: 'user', content: BRIEF_ASK[opts.kind] }],
  });
  if (res.stop_reason === 'refusal') return null;
  return textOf(res.content) || null;
}
