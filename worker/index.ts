// Serves the built app, plus one API route: POST /api/feedback/run starts the
// owner's Claude scheduled task on new feedback. It needs the owner home's
// session and the master password (both checked in hm_feedback_request_run).
// The Claude token lives only here, as Worker secrets.
// POST /api/push/test and the hourly cron send phone notifications (worker/push.ts);
// they need the PUSH_SECRET Worker secret, whose sha256 is in hm_config.

import { WIDGET_BODY } from '../src/lib/widget';
import { sendPush, type PushTarget } from './push';

interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  SUPABASE_URL: string;
  SUPABASE_KEY: string; // publishable key, same one the app uses
  CLAUDE_FIRE_URL?: string; // secret: the scheduled task's Fire URL
  CLAUDE_FIRE_TOKEN?: string; // secret: the scheduled task's API token
  PUSH_SECRET?: string; // secret: lets the Worker read due notifications (hm_push_due)
}

const PUSH_SUBJECT = 'https://homemanager.sanglikardev.workers.dev';

interface PushBatch {
  vapid: JsonWebKey | null;
  items: (PushTarget & { id: string; title: string; body: string })[];
}

// Sends a batch; subscriptions the push service no longer knows are switched off.
async function deliver(env: Env, batch: PushBatch): Promise<{ sent: number; failed: number }> {
  if (!batch.vapid || !batch.items.length) return { sent: 0, failed: 0 };
  const gone: string[] = [];
  let sent = 0;
  let failed = 0;
  for (const it of batch.items) {
    try {
      const status = await sendPush(it, { title: it.title, body: it.body, url: '/' }, batch.vapid, PUSH_SUBJECT);
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

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

async function rpc(env: Env, fn: string, args: Record<string, unknown>) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: env.SUPABASE_KEY, authorization: `Bearer ${env.SUPABASE_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`${fn} failed: ${res.status}`);
  return res.json() as Promise<Record<string, unknown>>;
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
  return json({ ok: true, open: check.open, sessionUrl: out.claude_code_session_url ?? null });
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

  // Hourly: morning summaries whose local hour has come.
  async scheduled(_event: unknown, env: Env, ctx: { waitUntil: (p: Promise<unknown>) => void }) {
    if (!env.PUSH_SECRET) return;
    ctx.waitUntil(
      rpc(env, 'hm_push_due', { p_secret: env.PUSH_SECRET }).then((b) => deliver(env, b as unknown as PushBatch)),
    );
  },
};
