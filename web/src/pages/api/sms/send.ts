import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { globalIpRatelimit } from '../../../../lib/rate-limit';
import { saveSmsCode } from '../../../../lib/kv';
import { assessIpReputation } from '../../../../lib/ip-reputation';
import { analyzePhone } from '../../../../lib/phone-intel';

const Body = z.object({
  phoneE164: z.string().min(5),
  address: z.string().min(1),
});

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Rate limit by IP
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
  const { success, limit, reset, remaining } = await globalIpRatelimit.limit(ip);
  res.setHeader('X-RateLimit-Limit', String(limit));
  res.setHeader('X-RateLimit-Remaining', String(remaining));
  res.setHeader('X-RateLimit-Reset', String(reset));
  if (!success) return res.status(429).json({ error: 'Too many requests' });

  const parse = Body.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'Invalid body' });
  const { phoneE164 } = parse.data;

  // Reject VPNs/proxies/cloud-provider IPs if IP intelligence is configured
  const rep = await assessIpReputation(req);
  if (rep.isVpnOrProxy || rep.isCloudProvider) {
    return res.status(400).json({ error: 'VPNs and proxies are not allowed' });
  }

  // Reject disposable/VOIP/high-risk numbers if phone intelligence is configured
  const pcheck = await analyzePhone(phoneE164);
  if (pcheck.isHighRisk) {
    return res.status(400).json({ error: 'Phone number not eligible' });
  }

  const code = generateCode();
  await saveSmsCode(phoneE164, code);

  // TODO: integrate SMS provider here using env.SMS_PROVIDER_API_KEY
  // For now, we do not expose the code in responses for security.

  return res.status(200).json({ ok: true });
}


