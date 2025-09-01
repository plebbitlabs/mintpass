import { kv } from '@vercel/kv';
import { policy } from './policy';
import { hashIdentifier } from './hash';

function smsPhoneCooldownKey(phoneE164: string) {
  const h = hashIdentifier('phone', phoneE164);
  return `cd:sms:phone:${h}`;
}

function smsIpCooldownKey(ip: string) {
  const h = hashIdentifier('ip', ip);
  return `cd:sms:ip:${h}`;
}

function mintIpCooldownKey(ip: string) {
  const h = hashIdentifier('ip', ip);
  return `cd:mint:ip:${h}`;
}

export async function isSmsSendInCooldown(ip: string, phoneE164: string) {
  const [p, i] = await Promise.all([
    kv.get(smsPhoneCooldownKey(phoneE164)),
    kv.get(smsIpCooldownKey(ip)),
  ]);
  if (p || i) return true;
  // Legacy plaintext keys fallback
  const legacyP = await kv.get(`cd:sms:phone:${phoneE164}`);
  const legacyI = await kv.get(`cd:sms:ip:${ip}`);
  return Boolean(legacyP || legacyI);
}

export async function setSmsSendCooldown(ip: string, phoneE164: string) {
  const ttl = Number.isFinite(policy.SMS_SEND_COOLDOWN_SECONDS) && policy.SMS_SEND_COOLDOWN_SECONDS > 0
    ? policy.SMS_SEND_COOLDOWN_SECONDS
    : 120;
  await Promise.all([
    kv.set(smsPhoneCooldownKey(phoneE164), '1', { ex: ttl }),
    kv.set(smsIpCooldownKey(ip), '1', { ex: ttl }),
  ]);
}

export async function isMintIpInCooldown(ip: string) {
  const v = await kv.get(mintIpCooldownKey(ip));
  if (v) return true;
  const legacy = await kv.get(`cd:mint:ip:${ip}`);
  return Boolean(legacy);
}

export async function setMintIpCooldown(ip: string) {
  const ttl = Number.isFinite(policy.MINT_IP_COOLDOWN_SECONDS) && policy.MINT_IP_COOLDOWN_SECONDS > 0
    ? policy.MINT_IP_COOLDOWN_SECONDS
    : 7 * 24 * 60 * 60; // default 7 days
  await kv.set(mintIpCooldownKey(ip), '1', { ex: ttl });
}


