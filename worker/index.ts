// Serves the built app, plus one API route: POST /api/feedback/run starts the
// owner's Claude scheduled task on new feedback. It needs the owner home's
// session and the master password (both checked in hm_feedback_request_run).
// The Claude token lives only here, as Worker secrets.

interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  SUPABASE_URL: string;
  SUPABASE_KEY: string; // publishable key, same one the app uses
  CLAUDE_FIRE_URL?: string; // secret: the scheduled task's Fire URL
  CLAUDE_FIRE_TOKEN?: string; // secret: the scheduled task's API token
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
  if (!env.CLAUDE_FIRE_URL || !env.CLAUDE_FIRE_TOKEN) return json({ ok: false, reason: 'not_configured' });
  const { token, password } = (await req.json().catch(() => ({}))) as { token?: string; password?: string };
  if (!token || !password) return json({ ok: false, reason: 'wrong_password' });

  const check = await rpc(env, 'hm_feedback_request_run', { p_token: token, p_password: password });
  if (!check.ok) return json(check);

  const fire = await fetch(env.CLAUDE_FIRE_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.CLAUDE_FIRE_TOKEN}`,
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
    return env.ASSETS.fetch(req);
  },
};
