import { createHmac, timingSafeEqual } from 'crypto';
import type { NextApiRequest, NextApiResponse } from 'next';
import { getAdminSessionSecret } from './env';

const ADMIN_COOKIE_NAME = 'admin_session';
const DEFAULT_SESSION_TTL_SECONDS = 12 * 60 * 60; // 12 hours

type AdminTokenPayload = {
  v: 1;
  iat: number; // seconds since epoch
  exp: number; // seconds since epoch
};

function base64urlEncode(input: string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function sign(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('hex');
}

export function createAdminToken(expiresInSeconds = DEFAULT_SESSION_TTL_SECONDS): string {
  const secret = getAdminSessionSecret();
  if (!secret) throw new Error('ADMIN_SESSION_SECRET not configured');
  const now = Math.floor(Date.now() / 1000);
  const payload: AdminTokenPayload = { v: 1, iat: now, exp: now + expiresInSeconds };
  const payloadB64 = base64urlEncode(JSON.stringify(payload));
  const sig = sign(payloadB64, secret);
  return `${payloadB64}.${sig}`;
}

export function verifyAdminToken(token: string | undefined): boolean {
  if (!token) return false;
  const secret = getAdminSessionSecret();
  if (!secret) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payloadB64, sig] = parts;
  // Pre-validate signature format to fixed-length hex (64 chars for sha256)
  if (!/^[0-9a-fA-F]{64}$/.test(sig)) return false;
  const expected = sign(payloadB64, secret);
  const a = Buffer.from(sig, 'hex');
  const b = Buffer.from(expected, 'hex');
  // Use timingSafeEqual on same-length buffers
  if (!timingSafeEqual(a, b)) return false;
  try {
    const json = Buffer.from(payloadB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const payload = JSON.parse(json) as AdminTokenPayload;
    if (payload.v !== 1) return false;
    const now = Math.floor(Date.now() / 1000);
    return now < payload.exp;
  } catch {
    return false;
  }
}

function appendSetCookie(res: NextApiResponse, newCookie: string) {
  const existing = res.getHeader('Set-Cookie');
  const existingCookies = existing ? (Array.isArray(existing) ? existing : [existing]) : [];
  res.setHeader('Set-Cookie', [...existingCookies, newCookie]);
}

export function setAdminSessionCookie(res: NextApiResponse, token: string, maxAgeSeconds = DEFAULT_SESSION_TTL_SECONDS) {
  const isProd = process.env.NODE_ENV === 'production';
  const cookie = `${ADMIN_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds};${isProd ? ' Secure;' : ''}`;
  appendSetCookie(res, cookie);
}

export function clearAdminSessionCookie(res: NextApiResponse) {
  const isProd = process.env.NODE_ENV === 'production';
  const cookie = `${ADMIN_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0;${isProd ? ' Secure;' : ''}`;
  appendSetCookie(res, cookie);
}

export function isAdminRequest(req: NextApiRequest): boolean {
  const token = req.cookies?.[ADMIN_COOKIE_NAME];
  return verifyAdminToken(token);
}

export function requireAdmin(req: NextApiRequest, res: NextApiResponse): boolean {
  if (isAdminRequest(req)) return true;
  res.status(401).json({ error: 'Unauthorized' });
  return false;
}

export const AdminAuth = {
  ADMIN_COOKIE_NAME,
  DEFAULT_SESSION_TTL_SECONDS,
  createAdminToken,
  verifyAdminToken,
  setAdminSessionCookie,
  clearAdminSessionCookie,
  isAdminRequest,
  requireAdmin,
};


