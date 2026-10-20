import { getToken, supabase } from './backend';

// Public half of the VAPID key pair; the private half is in hm_config (see migration 0012).
const VAPID_PUBLIC_KEY = 'BNg_SvPy-70bZ9Ho2LGwMtiB7OzelZsGGdeL5-jSVSDvENcp7Fe7agJhiIqbabnfkZmry5xj-LfwlGY29RkWlog';

export type PushSupport = 'ok' | 'install' | 'unsupported';

// iPhones only allow notifications for apps added to the Home Screen.
export function pushSupport(): PushSupport {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
  if (ios && !standalone) return 'install';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  return 'ok';
}

function keyBytes(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase().rpc(fn, { p_token: getToken(), ...args });
  if (error) throw new Error(error.message);
  return data as T;
}

async function registration() {
  return navigator.serviceWorker.getRegistration().then((r) => r ?? navigator.serviceWorker.register('/sw.js'));
}

export async function pushStatus(): Promise<{ on: boolean; hour: number }> {
  if (pushSupport() !== 'ok' || Notification.permission !== 'granted') return { on: false, hour: 8 };
  const sub = await (await registration()).pushManager.getSubscription();
  if (!sub) return { on: false, hour: 8 };
  const s = await rpc<{ active: boolean; hour: number | null }>('hm_push_status', { p_endpoint: sub.endpoint });
  return { on: s.active, hour: s.hour ?? 8 };
}

export async function enablePush(hour: number): Promise<void> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications are blocked. Allow them for this site in the phone or browser settings.');
  const reg = await registration();
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) }));
  const keys = sub.toJSON().keys ?? {};
  await rpc('hm_push_subscribe', { p_endpoint: sub.endpoint, p_p256dh: keys.p256dh, p_auth: keys.auth, p_hour: hour, p_tz: -new Date().getTimezoneOffset() });
}

export async function disablePush(): Promise<void> {
  const sub = await (await registration()).pushManager.getSubscription();
  if (!sub) return;
  await rpc('hm_push_unsubscribe', { p_endpoint: sub.endpoint });
  await sub.unsubscribe().catch(() => {});
}

export async function sendTestPush(): Promise<string> {
  const res = await fetch('/api/push/test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: getToken() }) });
  const out = (await res.json().catch(() => ({}))) as { ok?: boolean; reason?: string; sent?: number };
  if (out.ok && out.sent) return 'Sent. It should show up in a few seconds.';
  if (out.reason === 'not_configured') return 'Almost there: the PUSH_SECRET setting is not in Cloudflare yet.';
  if (out.reason === 'no_subscription') return 'Turn notifications on first.';
  return 'Could not send the test. Try again in a minute.';
}
