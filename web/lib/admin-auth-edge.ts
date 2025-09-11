// Edge-safe admin token verification using Web Crypto API

function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    const h = bytes[i].toString(16).padStart(2, '0');
    out += h;
  }
  return out;
}

async function hmacSha256Hex(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return toHex(sig);
}

export async function verifyAdminTokenEdge(token: string | undefined, secret: string | undefined): Promise<boolean> {
  if (!token || !secret) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payloadB64, sig] = parts;
  try {
    // Validate formats up-front
    const isBase64Url = /^[A-Za-z0-9_-]+$/.test(payloadB64);
    // sha256 HMAC hex digest should be 64 lowercase hex chars
    const isHexSig = /^[0-9a-f]{64}$/.test(sig);
    if (!isBase64Url || !isHexSig) return false;

    const expected = await hmacSha256Hex(payloadB64, secret);
    if (expected.length !== sig.length) return false;
    // timing-safe equal polyfill
    let mismatch = 0;
    for (let i = 0; i < expected.length; i++) {
      mismatch |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
    }
    if (mismatch !== 0) return false;

    // Verify payload with robust validation
    try {
      // Normalize base64url and add required padding for robust decoding
      const normalized = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
      const paddingLen = (4 - (normalized.length % 4)) % 4;
      const padded = normalized + '='.repeat(paddingLen);
      const json = atob(padded);
      const payload = JSON.parse(json);
      
      // Validate payload structure
      if (!payload || typeof payload !== 'object') return false;
      const { v, iat, exp } = payload as { v: unknown; iat: unknown; exp: unknown };
      if (!Number.isFinite(v as number) || (v as number) !== 1) return false;
      if (!Number.isFinite(iat as number) || !Number.isFinite(exp as number)) return false;

      const now = Math.floor(Date.now() / 1000);
      const iatNum = Math.floor(iat as number);
      const expNum = Math.floor(exp as number);

      // iat must be in the past (<= now) but not older than 1 day
      const maxIatSkewSeconds = 24 * 60 * 60; // 1 day
      if (iatNum > now) return false;
      if (iatNum < now - maxIatSkewSeconds) return false;

      // exp must be in the future and not farther than 30 days from now
      const maxTtlSeconds = 30 * 24 * 60 * 60; // 30 days
      if (expNum <= now) return false;
      if (expNum > now + maxTtlSeconds) return false;

      return true;
    } catch {
      return false;
    }
  } catch {
    return false;
  }
}


