// Web Push with nothing but WebCrypto: payload encryption (RFC 8291, aes128gcm)
// and the VAPID signature (RFC 8292). Works in the Worker and in Node for tests.

const enc = new TextEncoder();

export function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const b of u) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of parts) {
    out.set(p, i);
    i += p.length;
  }
  return out;
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8));
}

// Encrypts one push message for a browser subscription (p256dh and auth from PushSubscription.toJSON()).
export async function encryptPayload(payload: string, p256dh: string, auth: string, salt = crypto.getRandomValues(new Uint8Array(16))): Promise<Uint8Array> {
  const uaPublic = fromB64url(p256dh);
  const authSecret = fromB64url(auth);
  const local = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
  const asPublic = new Uint8Array((await crypto.subtle.exportKey('raw', local.publicKey)) as ArrayBuffer);
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privateKey, 256));

  const ikm = await hkdf(authSecret, shared, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const body = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(enc.encode(payload), new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 16, 0]); // record size 4096
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, body);
}

// The VAPID Authorization header for one push service.
export async function vapidAuth(endpoint: string, privateJwk: JsonWebKey, subject: string): Promise<string> {
  const header = b64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64url(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })));
  const key = await crypto.subtle.importKey('jwk', privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${header}.${claims}`));
  const publicKey = b64url(concat(new Uint8Array([4]), fromB64url(privateJwk.x!), fromB64url(privateJwk.y!)));
  return `vapid t=${header}.${claims}.${b64url(sig)}, k=${publicKey}`;
}

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

// Sends one notification. Returns the push service's status: 404/410 means the subscription is gone.
export async function sendPush(target: PushTarget, message: object, privateJwk: JsonWebKey, subject: string): Promise<number> {
  const body = await encryptPayload(JSON.stringify(message), target.p256dh, target.auth);
  const res = await fetch(target.endpoint, {
    method: 'POST',
    headers: {
      authorization: await vapidAuth(target.endpoint, privateJwk, subject),
      'content-encoding': 'aes128gcm',
      'content-type': 'application/octet-stream',
      ttl: '43200',
      urgency: 'normal',
    },
    body,
  });
  return res.status;
}
