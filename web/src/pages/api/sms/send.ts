import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { globalIpRatelimit } from '../../../../lib/rate-limit';
import { saveSmsCode } from '../../../../lib/kv';
import { assessIpReputation } from '../../../../lib/ip-reputation';
import { analyzePhone } from '../../../../lib/phone-intel';
import { getClientIp } from '../../../../lib/request-ip';
import { isSmsSendInCooldown, setSmsSendCooldown } from '../../../../lib/cooldowns';
import { sendOtpSms } from '../../../../lib/sms';
import { env } from '../../../../lib/env';
import { hashIdentifier } from '../../../../lib/hash';

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
  const ip = getClientIp(req);
  const hashedIp = hashIdentifier('ip', ip);
  const { success, limit, reset, remaining } = await globalIpRatelimit.limit(hashedIp);
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

  // Cooldown checks per IP and phone
  if (await isSmsSendInCooldown(ip, phoneE164)) {
    return res.status(429).json({ error: 'Please wait before requesting another code' });
  }

  // Reject disposable/VOIP/high-risk numbers if phone intelligence is configured
  const pcheck = await analyzePhone(phoneE164);
  if (pcheck.isHighRisk) {
    return res.status(400).json({ error: 'Phone number not eligible' });
  }

  const code = generateCode();
  await saveSmsCode(phoneE164, code);
  await setSmsSendCooldown(ip, phoneE164);

  // Attempt to send via configured SMS provider (Twilio preferred)
  // We do not include OTP or secrets in logs or responses.
  try {
    await sendOtpSms(phoneE164, code);
  } catch {
    // Swallow provider errors to avoid leaking details; rate limiting and cooldowns still apply.
  }

  // If a smoke test token is configured and provided via header, echo the code for debugging only
  const smokeHeader = (req.headers['x-smoke-test-token'] as string) || '';
  if (env.SMOKE_TEST_TOKEN && smokeHeader && env.SMOKE_TEST_TOKEN === smokeHeader) {
    return res.status(200).json({ ok: true, debugCode: code });
  }

  return res.status(200).json({ ok: true });
}


