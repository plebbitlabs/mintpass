import { kv } from '@vercel/kv';
import { hashIdentifier } from './hash';

const CODE_TTL_SECONDS = 5 * 60; // 5 minutes

function codeKey(phoneE164: string) {
  const h = hashIdentifier('phone', phoneE164);
  return `sms:code:${h}`;
}

function verifiedKey(phoneE164: string) {
  const h = hashIdentifier('phone', phoneE164);
  return `sms:verified:${h}`;
}

function mintedKey(address: string) {
  const lower = address.toLowerCase();
  const h = hashIdentifier('addr', lower);
  return `mint:address:${h}`;
}

function phoneMintedKey(phoneE164: string) {
  const h = hashIdentifier('phone', phoneE164);
  return `mint:phone:${h}`;
}

export async function saveSmsCode(phoneE164: string, code: string) {
  await kv.set(codeKey(phoneE164), code, { ex: CODE_TTL_SECONDS });
}

export async function readSmsCode(phoneE164: string) {
  // Try hashed key; if missing, fall back to legacy plaintext key for backwards compatibility
  const primary = await kv.get<string>(codeKey(phoneE164));
  if (primary !== null && primary !== undefined) return primary;
  const legacyKey = `sms:code:${phoneE164}`;
  return kv.get<string>(legacyKey);
}

export async function clearSmsCode(phoneE164: string) {
  await kv.del(codeKey(phoneE164));
  // Also remove legacy key if present
  await kv.del(`sms:code:${phoneE164}`);
}

export async function markPhoneVerified(phoneE164: string) {
  await kv.set(verifiedKey(phoneE164), '1', { ex: CODE_TTL_SECONDS });
}

export async function isPhoneVerified(phoneE164: string) {
  let v = await kv.get<string | number>(verifiedKey(phoneE164));
  if (v === null || v === undefined) {
    v = await kv.get<string | number>(`sms:verified:${phoneE164}`);
  }
  // Normalize potential numeric deserialization from KV
  return String(v) === '1';
}

export async function markMinted(address: string, phoneE164: string) {
  // Persist indefinitely to prevent reuse; can add TTL policy later if needed
  await kv.set(mintedKey(address), phoneE164);
  await kv.set(phoneMintedKey(phoneE164), address.toLowerCase());
  // Optionally, we could migrate legacy keys here, but we avoid writing plaintext keys.
}

export async function hasMinted(address: string) {
  let v = await kv.get<string>(mintedKey(address));
  if (!(typeof v === 'string' && v.length > 0)) {
    v = await kv.get<string>(`mint:address:${address.toLowerCase()}`);
  }
  return typeof v === 'string' && v.length > 0;
}

export async function hasPhoneMinted(phoneE164: string) {
  let v = await kv.get<string>(phoneMintedKey(phoneE164));
  if (!(typeof v === 'string' && v.length > 0)) {
    v = await kv.get<string>(`mint:phone:${phoneE164}`);
  }
  return typeof v === 'string' && v.length > 0;
}

// --- Associations: phone/address -> hashed IPs ---
function phoneIpsKey(phoneE164: string) {
  const h = hashIdentifier('phone', phoneE164);
  return `assoc:phone:ips:${h}`;
}

function addressIpsKey(address: string) {
  const lower = address.toLowerCase();
  const h = hashIdentifier('addr', lower);
  return `assoc:addr:ips:${h}`;
}

/**
 * Record the hashed IP used with a given phone number.
 * Stores only the hashed IP to avoid retaining plaintext IPs.
 */
export async function addIpAssociationForPhone(phoneE164: string, ip: string) {
  const ipHash = hashIdentifier('ip', ip);
  try {
    await kv.sadd(phoneIpsKey(phoneE164), ipHash);
  } catch {}
}

/**
 * Record the hashed IP used with a given wallet address.
 * Stores only the hashed IP to avoid retaining plaintext IPs.
 */
export async function addIpAssociationForAddress(address: string, ip: string) {
  const ipHash = hashIdentifier('ip', ip);
  try {
    await kv.sadd(addressIpsKey(address), ipHash);
  } catch {}
}

/** Get all hashed IPs associated with a given phone number. */
export async function getHashedIpsForPhone(phoneE164: string): Promise<string[]> {
  try {
    const ips = await kv.smembers<string[]>(phoneIpsKey(phoneE164));
    return Array.isArray(ips) ? ips.filter((v): v is string => typeof v === 'string' && v.length > 0) : [];
  } catch {
    return [];
  }
}

/** Get all hashed IPs associated with a given wallet address. */
export async function getHashedIpsForAddress(address: string): Promise<string[]> {
  try {
    const ips = await kv.smembers<string[]>(addressIpsKey(address));
    return Array.isArray(ips) ? ips.filter((v): v is string => typeof v === 'string' && v.length > 0) : [];
  } catch {
    return [];
  }
}

// --- SMS Delivery Status by Message SID ---
function smsStatusKey(messageSid: string) {
  // We hash the SID to avoid leaking raw identifiers in DB keys
  const h = hashIdentifier('generic', messageSid);
  return `sms:status:${h}`;
}

export type SmsDeliveryStatus = {
  status: string; // queued, sending, sent, delivered, undelivered, failed, etc.
  errorCode?: number | string;
  errorMessage?: string;
  updatedAt: number; // epoch ms
};

export async function setSmsDeliveryStatus(messageSid: string, status: SmsDeliveryStatus) {
  try {
    await kv.set(smsStatusKey(messageSid), status, { ex: 60 * 60 }); // keep for 1 hour
  } catch {}
}

export async function getSmsDeliveryStatus(messageSid: string): Promise<SmsDeliveryStatus | null> {
  try {
    const v = await kv.get<SmsDeliveryStatus>(smsStatusKey(messageSid));
    if (v && typeof v === 'object' && typeof (v as { status?: unknown }).status === 'string') {
      return v as SmsDeliveryStatus;
    }
    return null;
  } catch {
    return null;
  }
}


