import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { clearSmsCode, markPhoneVerified, readSmsCode, addIpAssociationForPhone } from '../../../../lib/kv';
import { env } from '../../../../lib/env';
import { globalIpRatelimit } from '../../../../lib/rate-limit';
import { getClientIp } from '../../../../lib/request-ip';
import { hashIdentifier } from '../../../../lib/hash';

const Body = z.object({
  phoneE164: z.string().min(5),
  code: z.string().length(6),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Global IP rate limiting
  const ip = getClientIp(req);
  const hashedIp = hashIdentifier('ip', ip);
  const { success, limit, reset, remaining } = await globalIpRatelimit.limit(hashedIp);
  res.setHeader('X-RateLimit-Limit', String(limit));
  res.setHeader('X-RateLimit-Remaining', String(remaining));
  res.setHeader('X-RateLimit-Reset', String(reset));
  if (!success) return res.status(429).json({ error: 'Too many requests' });

  const parse = Body.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'Invalid body' });
  const { phoneE164, code } = parse.data;

  const stored = await readSmsCode(phoneE164);
  if (!stored) return res.status(400).json({ error: 'Code expired or not found' });

  // Normalize both sides to string to tolerate provider/SDK returning numbers
  const storedStr = typeof stored === 'string' ? stored : String(stored);
  const codeStr = String(code);

  const smokeHeader = (req.headers['x-smoke-test-token'] as string) || '';
  const isSmoke = Boolean(env.SMOKE_TEST_TOKEN && smokeHeader && env.SMOKE_TEST_TOKEN === smokeHeader);
  if (storedStr !== codeStr) {
    if (isSmoke) {
      return res.status(400).json({ error: 'Invalid code', debug: { posted: codeStr, stored: storedStr } });
    }
    return res.status(400).json({ error: 'Invalid code' });
  }

  await markPhoneVerified(phoneE164);
  await clearSmsCode(phoneE164);
  // Index hashed IP association on verify as well (covers flows where send indexing failed)
  try {
    const ip = getClientIp(req);
    await addIpAssociationForPhone(phoneE164, ip);
  } catch {}
  return res.status(200).json({ ok: true });
}


