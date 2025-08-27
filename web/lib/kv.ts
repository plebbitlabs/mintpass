import { kv } from '@vercel/kv';

const CODE_TTL_SECONDS = 5 * 60; // 5 minutes

function codeKey(phoneE164: string) {
  return `sms:code:${phoneE164}`;
}

function verifiedKey(phoneE164: string) {
  return `sms:verified:${phoneE164}`;
}

function mintedKey(address: string) {
  return `mint:address:${address.toLowerCase()}`;
}

function phoneMintedKey(phoneE164: string) {
  return `mint:phone:${phoneE164}`;
}

export async function saveSmsCode(phoneE164: string, code: string) {
  await kv.set(codeKey(phoneE164), code, { ex: CODE_TTL_SECONDS });
}

export async function readSmsCode(phoneE164: string) {
  return kv.get<string>(codeKey(phoneE164));
}

export async function clearSmsCode(phoneE164: string) {
  await kv.del(codeKey(phoneE164));
}

export async function markPhoneVerified(phoneE164: string) {
  await kv.set(verifiedKey(phoneE164), '1', { ex: CODE_TTL_SECONDS });
}

export async function isPhoneVerified(phoneE164: string) {
  const v = await kv.get<string | number>(verifiedKey(phoneE164));
  // Normalize potential numeric deserialization from KV
  return String(v) === '1';
}

export async function markMinted(address: string, phoneE164: string) {
  // Persist indefinitely to prevent reuse; can add TTL policy later if needed
  await kv.set(mintedKey(address), phoneE164);
  await kv.set(phoneMintedKey(phoneE164), address.toLowerCase());
}

export async function hasMinted(address: string) {
  const v = await kv.get<string>(mintedKey(address));
  return typeof v === 'string' && v.length > 0;
}

export async function hasPhoneMinted(phoneE164: string) {
  const v = await kv.get<string>(phoneMintedKey(phoneE164));
  return typeof v === 'string' && v.length > 0;
}


