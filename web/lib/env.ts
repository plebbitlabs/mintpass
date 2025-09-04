import { z } from 'zod';

const envSchema = z.object({
  // Vercel KV / Upstash Redis
  KV_REST_API_URL: z.string().url(),
  KV_REST_API_TOKEN: z.string().min(1),

  // Secrets and provider keys (server-only)
  MINTER_PRIVATE_KEY: z.string().min(1).optional(),
  SMS_PROVIDER_API_KEY: z.string().optional(), // legacy/generic
  SMS_SENDER_ID: z.string().optional(),        // generic sender id/from

  // Twilio (preferred)
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_MESSAGING_SERVICE_SID: z.string().optional(),

  // On-chain Mint (Base Sepolia)
  MINTPASSV1_ADDRESS_BASE_SEPOLIA: z.string().optional(),
  MINTPASSV2_ADDRESS_BASE_SEPOLIA: z
    .string()
    .optional()
    .refine((v) => !v || /^0x[a-fA-F0-9]{40}$/.test(v), {
      message: 'MINTPASSV2_ADDRESS_BASE_SEPOLIA must be a valid 0x-prefixed Ethereum address',
    }),
  BASE_SEPOLIA_RPC_URL: z.string().url().optional(),

  // Preview-only smoke test helper
  SMOKE_TEST_TOKEN: z.string().optional(),
  // Keyed hashing pepper for identifiers (HMAC key)
  HASH_PEPPER: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env as Record<string, string>);

if (!parsed.success) {
  // Do not crash builds in early scaffolding if envs are missing; warn instead
  // Runtime handlers will validate critical vars per-route.
  console.warn('[env] Missing or invalid environment variables:', parsed.error.flatten().fieldErrors);
}

export const env = {
  KV_REST_API_URL: process.env.KV_REST_API_URL,
  KV_REST_API_TOKEN: process.env.KV_REST_API_TOKEN,
  MINTER_PRIVATE_KEY: process.env.MINTER_PRIVATE_KEY,
  SMS_PROVIDER_API_KEY: process.env.SMS_PROVIDER_API_KEY,
  SMS_SENDER_ID: process.env.SMS_SENDER_ID,
  TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
  TWILIO_MESSAGING_SERVICE_SID: process.env.TWILIO_MESSAGING_SERVICE_SID,
  MINTPASSV1_ADDRESS_BASE_SEPOLIA: process.env.MINTPASSV1_ADDRESS_BASE_SEPOLIA,
  MINTPASSV2_ADDRESS_BASE_SEPOLIA: process.env.MINTPASSV2_ADDRESS_BASE_SEPOLIA,
  BASE_SEPOLIA_RPC_URL: process.env.BASE_SEPOLIA_RPC_URL,
  SMOKE_TEST_TOKEN: process.env.SMOKE_TEST_TOKEN,
  HASH_PEPPER: process.env.HASH_PEPPER,
};

export function requireEnv<K extends keyof typeof env>(key: K): NonNullable<(typeof env)[K]> {
  const value = env[key];
  if (value === undefined || value === null || (typeof value === 'string' && value.length === 0)) {
    throw new Error(`Missing required env: ${String(key)}`);
  }
  return value as NonNullable<(typeof env)[K]>;
}


