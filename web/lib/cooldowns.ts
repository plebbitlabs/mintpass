import { kv } from '@vercel/kv';
import { env } from './env';

function smsPhoneCooldownKey(phoneE164: string) {
  return `cd:sms:phone:${phoneE164}`;
}

function smsIpCooldownKey(ip: string) {
  return `cd:sms:ip:${ip}`;
}

function mintIpCooldownKey(ip: string) {
  return `cd:mint:ip:${ip}`;
}

export async function isSmsSendInCooldown(ip: string, phoneE164: string) {
  const [p, i] = await Promise.all([
    kv.get(smsPhoneCooldownKey(phoneE164)),
    kv.get(smsIpCooldownKey(ip)),
  ]);
  return Boolean(p || i);
}

export async function setSmsSendCooldown(ip: string, phoneE164: string) {
  const ttl = Number.isFinite(env.SMS_SEND_COOLDOWN_SECONDS) && env.SMS_SEND_COOLDOWN_SECONDS > 0
    ? env.SMS_SEND_COOLDOWN_SECONDS
    : 120;
  await Promise.all([
    kv.set(smsPhoneCooldownKey(phoneE164), '1', { ex: ttl }),
    kv.set(smsIpCooldownKey(ip), '1', { ex: ttl }),
  ]);
}

export async function isMintIpInCooldown(ip: string) {
  const v = await kv.get(mintIpCooldownKey(ip));
  return Boolean(v);
}

export async function setMintIpCooldown(ip: string) {
  const ttl = Number.isFinite(env.MINT_IP_COOLDOWN_SECONDS) && env.MINT_IP_COOLDOWN_SECONDS > 0
    ? env.MINT_IP_COOLDOWN_SECONDS
    : 7 * 24 * 60 * 60; // default 7 days
  await kv.set(mintIpCooldownKey(ip), '1', { ex: ttl });
}


