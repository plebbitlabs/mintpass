import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { AdminAuth, setAdminSessionCookie, createAdminToken } from '../../../../lib/admin-auth';
import { getAdminPassword } from '../../../../lib/env';
import { getClientIp } from '../../../../lib/request-ip';
import { createRatelimit, ratelimitKeyForIp } from '../../../../lib/rate-limit';
import { timingSafeEqual, createHash } from 'crypto';

const Body = z.object({ password: z.string().min(1) });

const loginRatelimit = createRatelimit('rl:admin:login', 10, 60); // 10 per minute per IP

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Rate limit by IP
  const ip = getClientIp(req);
  const key = ratelimitKeyForIp(ip);
  const { success } = await loginRatelimit.limit(key);
  if (!success) return res.status(429).json({ error: 'Too many login attempts' });

  const parse = Body.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'Invalid body' });

  const envPassword = getAdminPassword();
  if (!envPassword) return res.status(500).json({ error: 'ADMIN_PASSWORD not configured' });

  // timing-safe compare of hashed values to normalize length
  const providedHash = createHash('sha256').update(parse.data.password).digest();
  const expectedHash = createHash('sha256').update(envPassword).digest();
  const ok = timingSafeEqual(providedHash, expectedHash);
  if (!ok) return res.status(401).json({ error: 'Invalid password' });

  const token = createAdminToken();
  setAdminSessionCookie(res, token, AdminAuth.DEFAULT_SESSION_TTL_SECONDS);
  return res.status(200).json({ ok: true });
}


