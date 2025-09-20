import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { globalIpRatelimit } from '../../../../lib/rate-limit';
import { saveSmsCode, addIpAssociationForPhone, addIpAssociationForAddress } from '../../../../lib/kv';
import { assessIpReputation } from '../../../../lib/ip-reputation';
import { analyzePhone } from '../../../../lib/phone-intel';
import { getClientIp } from '../../../../lib/request-ip';
import { isSmsSendInCooldown, setSmsSendCooldown, getSmsSendCooldownRemaining } from '../../../../lib/cooldowns';
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
  const { phoneE164, address } = parse.data;

  // Reject VPNs/proxies/cloud-provider IPs if IP intelligence is configured
  const rep = await assessIpReputation(req);
  if (rep.isVpnOrProxy || rep.isCloudProvider) {
    return res.status(400).json({ error: 'VPNs and proxies are not allowed' });
  }

  // Cooldown checks per IP and phone
  if (await isSmsSendInCooldown(ip, phoneE164)) {
    let remainingSeconds = 0;
    try {
      remainingSeconds = await getSmsSendCooldownRemaining(ip, phoneE164);
    } catch {
      remainingSeconds = 0;
    }
    const remainingTime = remainingSeconds > 0 ? `${remainingSeconds}s` : '';
    const errorMessage = remainingTime 
      ? `Please wait ${remainingTime} before requesting another code`
      : 'Please wait before requesting another code';
    if (remainingSeconds > 0) res.setHeader('Retry-After', String(remainingSeconds));
    return res.status(429).json({ error: errorMessage, cooldownSeconds: remainingSeconds });
  }

  // Reject disposable/VOIP/high-risk numbers if phone intelligence is configured
  const pcheck = await analyzePhone(phoneE164);
  // Allow high-risk numbers only in Preview environment to enable testing
  const isPreviewEnv = ((process.env.VERCEL_ENV || '').toLowerCase() === 'preview');
  if (!isPreviewEnv && pcheck.isHighRisk) {
    return res.status(400).json({ error: 'Phone number not eligible' });
  }

  const code = generateCode();
  await saveSmsCode(phoneE164, code);
  await setSmsSendCooldown(ip, phoneE164);

  // Index hashed IP associations for phone and address for admin tooling
  try {
    await Promise.all([
      addIpAssociationForPhone(phoneE164, ip),
      addIpAssociationForAddress(address, ip),
    ]);
  } catch {}

  // Attempt to send via configured SMS provider (Twilio preferred)
  // We do not include OTP or secrets in logs or responses.
  // For local dev (localhost/127.0.0.1/.local), skip StatusCallback because Twilio cannot reach it.
  const hostHeader = String(req.headers['x-forwarded-host'] || req.headers['host'] || '').trim();
  const lowerHost = hostHeader.toLowerCase();
  const isLocalHost = !lowerHost || lowerHost.includes('localhost') || lowerHost.startsWith('127.0.0.1') || lowerHost.startsWith('[::1]') || lowerHost.endsWith('.local');
  const xfp = (req.headers['x-forwarded-proto'] as string | undefined) || 'https';
  const proto = (xfp.includes(',') ? xfp.split(',')[0] : xfp).trim();
  const scheme = proto === 'http' && !isLocalHost ? 'https' : proto; // prefer https when not local
  const statusCallbackUrl = isLocalHost || !hostHeader ? undefined : `${scheme}://${hostHeader}/api/sms/status-callback`;

  console.log('SMS send configuration:', {
    host: hostHeader,
    isLocalHost,
    scheme,
    statusCallbackUrl,
    phone: hashIdentifier('phone', phoneE164),
  });

  const result = await sendOtpSms(phoneE164, code, {
    timeoutMs: 5000,
    maxRetries: 1,
    baseDelayMs: 300,
    statusCallbackUrl,
  });

  if (!result.ok) {
    // Compute remaining cooldown to help the client display a countdown if needed
    let remainingSeconds = 0;
    try {
      remainingSeconds = await getSmsSendCooldownRemaining(ip, phoneE164);
    } catch {
      remainingSeconds = 0;
    }

    // Map provider errors to generic client-facing messages without leaking details
    const isClientError = typeof result.status === 'number' && result.status >= 400 && result.status < 500;
    const statusCode = isClientError ? 400 : 502;
    const errorMessage = isClientError
      ? 'Unable to deliver SMS to this number. Service is not available for this destination yet.'
      : 'SMS provider error. Please try again later.';

    // Log minimal diagnostic info with hashed phone (no PII or OTP)
    try {
      console.warn('SMS send failed', {
        phone: hashIdentifier('phone', phoneE164),
        status: result.status,
        provider: result.provider,
        code: result.errorCode,
        message: result.errorMessage,
      });
    } catch {}

    // Include safe provider diagnostic so the client can display it to the user
    const providerError = result.provider
      ? {
          provider: result.provider,
          status: result.status,
          code: result.errorCode,
          message: result.errorMessage,
        }
      : undefined;

    return res.status(statusCode).json({ error: errorMessage, cooldownSeconds: remainingSeconds, providerError });
  }

  // If a smoke test token is configured and provided via header, echo the code for debugging only
  const smokeHeader = (req.headers['x-smoke-test-token'] as string) || '';
  if (env.SMOKE_TEST_TOKEN && smokeHeader && env.SMOKE_TEST_TOKEN === smokeHeader) {
    return res.status(200).json({ ok: true, debugCode: code, sid: result.sid, initialStatus: result.initialStatus });
  }

  return res.status(200).json({ ok: true, sid: result.sid, initialStatus: result.initialStatus });
}


