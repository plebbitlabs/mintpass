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
    const expected = await hmacSha256Hex(payloadB64, secret);
    if (expected.length !== sig.length) return false;
    // timing-safe equal polyfill
    let mismatch = 0;
    for (let i = 0; i < expected.length; i++) {
      mismatch |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
    }
    if (mismatch !== 0) return false;

    // Verify exp with robust validation
    try {
      const json = atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'));
      const payload = JSON.parse(json);
      
      // Validate payload structure
      if (!payload || typeof payload !== 'object') return false;
      if (!Number.isFinite(payload.v) || !Number.isFinite(payload.exp)) return false;
      if (payload.v !== 1) return false;
      
      const now = Math.floor(Date.now() / 1000);
      return now < payload.exp;
    } catch {
      return false;
    }
  } catch {
    return false;
  }
}


