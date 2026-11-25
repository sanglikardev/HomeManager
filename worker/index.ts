// Serves the built app, plus one API route: POST /api/feedback/run starts the
// owner's Claude scheduled task on new feedback. It needs the owner home's
// session and the master password (both checked in hm_feedback_request_run).
// The Claude token lives only here, as Worker secrets.
// POST /api/push/test and the hourly cron send phone notifications (worker/push.ts);
// they need the PUSH_SECRET Worker secret, whose sha256 is in hm_config.

import { WIDGET_BODY } from '../src/lib/widget';
import { parseBankSms, smsHash } from '../src/lib/sms';
import { sendPush, type PushTarget } from './push';
import { homieTurn, writeBrief, type HomieContext } from './homie';

interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  SUPABASE_URL: string;
  SUPABASE_KEY: string; // publishable key, same one the app uses
  CLAUDE_FIRE_URL?: string; // secret: the scheduled task's Fire URL
  CLAUDE_FIRE_TOKEN?: string; // secret: the scheduled task's API token
  PUSH_SECRET?: string; // secret: lets the Worker read due notifications (hm_push_due)
  ANTHROPIC_API_KEY?: string; // secret: Homie, the personal assistant
  HOMIE_MODEL?: string; // optional: a different Claude model for Homie
}

const PUSH_SUBJECT = 'https://homemanager.sanglikardev.workers.dev';

interface PushBatch {
  vapid: JsonWebKey | null;
  items: (PushTarget & { id: string; title: string; body: string; url?: string; tag?: string })[];
}

// Sends a batch; subscriptions the push service no longer knows are switched off.
async function deliver(env: Env, batch: PushBatch): Promise<{ sent: number; failed: number }> {
  if (!batch.vapid || !batch.items.length) return { sent: 0, failed: 0 };
  const gone: string[] = [];
  let sent = 0;
  let failed = 0;
  for (const it of batch.items) {
    try {
      const status = await sendPush(it, { title: it.title, body: it.body, url: it.url ?? '/', tag: it.tag ?? 'homemanager-daily' }, batch.vapid, PUSH_SUBJECT);
      if (status === 404 || status === 410) gone.push(it.id);
      else if (status >= 200 && status < 300) sent++;
      else failed++;
    } catch {
      failed++;
    }
  }
  if (gone.length) await rpc(env, 'hm_push_gone', { p_secret: env.PUSH_SECRET, p_ids: gone });
  return { sent, failed };
}

async function pushTest(req: Request, env: Env): Promise<Response> {
  if (!env.PUSH_SECRET) return json({ ok: false, reason: 'not_configured' });
  const { token } = (await req.json().catch(() => ({}))) as { token?: string };
  if (!token) return json({ ok: false, reason: 'signin' });
  const batch = (await rpc(env, 'hm_push_test', { p_secret: env.PUSH_SECRET, p_token: token })) as unknown as PushBatch;
  if (!batch.items.length) return json({ ok: false, reason: 'no_subscription' });
  return json({ ok: true, ...(await deliver(env, batch)) });
}

// The date in the SMS, unless it is missing, in the future or over a year old: then today (India time).
function pickDate(d: string | null): string {
  const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
  if (!d || d > today || d < `${Number(today.slice(0, 4)) - 1}${today.slice(4)}`) return today;
  return d;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

async function rpc(env: Env, fn: string, args: Record<string, unknown>) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: env.SUPABASE_KEY, authorization: `Bearer ${env.SUPABASE_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(detail?.message ? `${fn}: ${detail.message}` : `${fn} failed: ${res.status}`);
  }
  // Functions that return nothing answer with an empty body.
  const body = await res.text();
  return (body ? JSON.parse(body) : null) as Record<string, unknown>;
}

// ---------- Homie ----------

const signedOut = (e: unknown) => e instanceof Error && /sign in again/i.test(e.message);

async function homieReply(env: Env, token: string, text: string) {
  const ctx = (await rpc(env, 'hm_homie_context', { p_token: token })) as unknown as HomieContext;
  await rpc(env, 'hm_homie_chat_add', { p_token: token, p_role: 'user', p_text: text });
  const out = await homieTurn({ apiKey: env.ANTHROPIC_API_KEY!, model: env.HOMIE_MODEL, token, text, ctx, rpc: (fn, args) => rpc(env, fn, args) });
  const saved = out.actions.length ? `${out.reply}\n\n${out.actions.map((a) => `• ${a.label}`).join('\n')}` : out.reply;
  await rpc(env, 'hm_homie_chat_add', { p_token: token, p_role: 'assistant', p_text: saved });
  return out;
}

// From the app: { token, text } -> { ok, reply, actions }.
async function homieChat(req: Request, env: Env): Promise<Response> {
  if (!env.ANTHROPIC_API_KEY) return json({ ok: false, reason: 'not_configured' });
  const { token, text } = (await req.json().catch(() => ({}))) as { token?: string; text?: string };
  if (!token) return json({ ok: false, reason: 'signin' });
  const msg = (text ?? '').trim().slice(0, 4000);
  if (!msg) return json({ ok: false, reason: 'empty' });
  try {
    return json({ ok: true, ...(await homieReply(env, token, msg)) });
  } catch (e) {
    if (signedOut(e)) return json({ ok: false, reason: 'signin' });
    return json({ ok: false, reason: 'error', message: e instanceof Error ? e.message : String(e) }, 502);
  }
}

// From the Siri Shortcut: ?k=<Siri key>, the words as ?text= or the body. Answers in plain text for Siri to speak.
async function homieSiri(req: Request, env: Env, url: URL): Promise<Response> {
  const say = (t: string, status = 200) => new Response(t, { status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
  if (!env.ANTHROPIC_API_KEY) return say("Homie isn't set up yet.", 503);
  let text = url.searchParams.get('text') ?? '';
  if (!text && req.method === 'POST') {
    const raw = await req.text();
    try {
      const j = JSON.parse(raw) as { text?: unknown };
      text = typeof j?.text === 'string' ? j.text : raw;
    } catch {
      text = new URLSearchParams(raw).get('text') ?? raw;
    }
  }
  text = text.trim().slice(0, 4000);
  if (!text) return say('I didn\'t catch that.');
  try {
    return say((await homieReply(env, url.searchParams.get('k') ?? '', text)).reply);
  } catch (e) {
    if (signedOut(e)) return say('This Siri key no longer works. Make a new one in Homie settings.', 401);
    return say('Something went wrong. Try again in a minute.', 502);
  }
}

interface HomieDue {
  vapid: JsonWebKey | null;
  reminders: { id: string; text: string; subs: (PushTarget & { id: string })[] }[];
  briefs: { account: string; kind: 'morning' | 'evening'; subs: (PushTarget & { id: string })[]; context: HomieContext }[];
}

// Every 5 minutes: due reminders, and the morning and evening briefs.
async function homieCron(env: Env) {
  if (!env.PUSH_SECRET) return;
  const due = (await rpc(env, 'hm_homie_due', { p_secret: env.PUSH_SECRET, p_briefs: !!env.ANTHROPIC_API_KEY })) as unknown as HomieDue;
  const items: PushBatch['items'] = [];
  for (const r of due.reminders) {
    for (const s of r.subs) items.push({ ...s, title: 'Reminder', body: r.text, url: '/#homie', tag: `homie-${r.id}` });
  }
  for (const b of due.briefs) {
    try {
      const text = await writeBrief({ apiKey: env.ANTHROPIC_API_KEY!, model: env.HOMIE_MODEL, kind: b.kind, ctx: b.context });
      if (!text) continue;
      await rpc(env, 'hm_homie_brief_save', { p_secret: env.PUSH_SECRET, p_account: b.account, p_text: text });
      const name = (b.context.settings?.name as string) || 'Homie';
      for (const s of b.subs) items.push({ ...s, title: `${name} · ${b.kind === 'morning' ? 'Good morning' : 'Evening wrap-up'}`, body: text, url: '/#homie', tag: `homie-${b.kind}` });
    } catch {
      // one failed brief must not stop the others
    }
  }
  await deliver(env, { vapid: due.vapid, items });
  // Removes old chat and forgotten items; missing until 0027 is run by hand.
  await rpc(env, 'hm_homie_cleanup', { p_secret: env.PUSH_SECRET }).catch(() => null);
}

async function runFeedback(req: Request, env: Env): Promise<Response> {
  const missing = (['CLAUDE_FIRE_URL', 'CLAUDE_FIRE_TOKEN'] as const).filter((k) => !env[k]);
  const { CLAUDE_FIRE_URL: fireUrl, CLAUDE_FIRE_TOKEN: fireToken } = env;
  if (!fireUrl || !fireToken) return json({ ok: false, reason: 'not_configured', missing });
  const { token, password } = (await req.json().catch(() => ({}))) as { token?: string; password?: string };
  if (!token || !password) return json({ ok: false, reason: 'wrong_password' });

  const check = await rpc(env, 'hm_feedback_request_run', { p_token: token, p_password: password });
  if (!check.ok) return json(check);

  const fire = await fetch(fireUrl.trim(), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${fireToken.trim()}`,
      'anthropic-beta': 'experimental-cc-routine-2026-04-01',
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ text: `Started from the app's Feedback screen. ${check.open} new item(s).` }),
  });
  if (!fire.ok) return json({ ok: false, reason: 'fire_failed', status: fire.status }, 502);
  const out = (await fire.json()) as { claude_code_session_url?: string };
  const sessionUrl = out.claude_code_session_url ?? null;
  // Link the waiting items to this session. A failure here must not hide that Claude started.
  if (sessionUrl) await rpc(env, 'hm_feedback_attach_session', { p_token: token, p_url: sessionUrl }).catch(() => null);
  return json({ ok: true, open: check.open, sessionUrl });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/api/feedback/run') {
      if (req.method !== 'POST') return json({ ok: false }, 405);
      try {
        return await runFeedback(req, env);
      } catch (e) {
        return json({ ok: false, reason: 'error', message: e instanceof Error ? e.message : String(e) }, 500);
      }
    }
    // iPhone widget (Scriptable): a small summary for the home whose widget key this is.
    if (url.pathname === '/api/widget.js') {
      return new Response(WIDGET_BODY, { headers: { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'max-age=300' } });
    }
    if (url.pathname === '/api/widget') {
      try {
        const out = await rpc(env, 'hm_widget', { p_key: url.searchParams.get('k') ?? '' });
        return new Response(JSON.stringify(out), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
      } catch {
        return json({ ok: false, error: true }, 502);
      }
    }
    // Habits widget: tick or untick a habit for today (the widget key only reaches its own home's habits).
    if (url.pathname === '/api/widget/toggle') {
      if (req.method !== 'POST') return json({ ok: false }, 405);
      const habit = url.searchParams.get('h') ?? '';
      if (!/^[0-9a-f-]{36}$/i.test(habit)) return json({ ok: false, reason: 'habit' }, 400);
      try {
        const out = await rpc(env, 'hm_widget_toggle', { p_key: url.searchParams.get('k') ?? '', p_habit: habit });
        return new Response(JSON.stringify(out), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
      } catch {
        return json({ ok: false, error: true }, 502);
      }
    }
    // Bank SMS from an iPhone Shortcuts automation: POST the message text, it becomes an expense.
    if (url.pathname === '/api/sms') {
      if (req.method !== 'POST' && req.method !== 'GET') return json({ ok: false }, 405);
      try {
        const ctype = req.headers.get('content-type') ?? '';
        // GET (or an empty body) can carry the message as ?text=, for Shortcuts setups where a body won't send.
        const raw = req.method === 'GET' ? '' : await req.text();
        let text = raw;
        if (ctype.includes('multipart/form-data')) {
          // Shortcuts' Form body: take the part named "text" (or the first part).
          const parts = raw.split(/\r?\n--[^\r\n]*/);
          const body = (part: string) => part.replace(/^[\s\S]*?\r?\n\r?\n/, '').replace(/\r?\n$/, '');
          const real = parts.filter((x) => /content-disposition/i.test(x));
          const hit = real.find((x) => /name="?text"?/i.test(x)) ?? real[0];
          text = hit ? body(hit) : '';
        } else if (ctype.includes('x-www-form-urlencoded')) {
          text = new URLSearchParams(raw).get('text') ?? '';
        } else {
          try {
            const j = JSON.parse(raw) as { text?: unknown };
            if (typeof j?.text === 'string') text = j.text;
          } catch {
            // plain text body
          }
        }
        if (!text.trim()) text = url.searchParams.get('text') ?? '';
        const parsed = parseBankSms(text.slice(0, 2000));
        if (!parsed) return json({ ok: true, added: false, reason: text.trim() ? 'not_a_spend' : 'empty_body', type: req.headers.get('content-type'), got: text.slice(0, 200) });
        const out = await rpc(env, 'hm_sms_expense', {
          p_key: url.searchParams.get('k') ?? '',
          p_amount: parsed.amount,
          p_date: pickDate(parsed.date),
          p_note: `${parsed.note}\n${text.replace(/\s+/g, ' ').trim()}`,
          p_hash: await smsHash(text),
        });
        return json({ ...out, added: !!out.ok && !out.duplicate }, out.ok ? 200 : 403);
      } catch (e) {
        return json({ ok: false, error: true, message: e instanceof Error ? e.message : String(e) }, 502);
      }
    }
    if (url.pathname === '/api/homie') {
      if (req.method !== 'POST') return json({ ok: false }, 405);
      return homieChat(req, env);
    }
    if (url.pathname === '/api/homie/siri') {
      if (req.method !== 'POST' && req.method !== 'GET') return json({ ok: false }, 405);
      return homieSiri(req, env, url);
    }
    if (url.pathname === '/api/push/test') {
      if (req.method !== 'POST') return json({ ok: false }, 405);
      try {
        return await pushTest(req, env);
      } catch (e) {
        return json({ ok: false, reason: 'error', message: e instanceof Error ? e.message : String(e) }, 500);
      }
    }
    return env.ASSETS.fetch(req);
  },

  // Hourly: morning summaries whose local hour has come, and habit reminders for this hour.
  // Every 5 minutes: Homie's reminders and briefs.
  async scheduled(event: { cron?: string }, env: Env, ctx: { waitUntil: (p: Promise<unknown>) => void }) {
    if (!env.PUSH_SECRET) return;
    if (event.cron === '0 * * * *') {
      ctx.waitUntil(rpc(env, 'hm_push_due', { p_secret: env.PUSH_SECRET }).then((b) => deliver(env, b as unknown as PushBatch)));
    }
    ctx.waitUntil(homieCron(env).catch(() => null));
  },
};
