import { z } from 'zod';

const envSchema = z.object({
  // Vercel KV / Upstash Redis
  KV_REST_API_URL: z.string().url(),
  KV_REST_API_TOKEN: z.string().min(1),

  // Secrets and provider keys (server-only)
  MINTER_PRIVATE_KEY: z.string().min(1).optional(),
  SMS_PROVIDER_API_KEY: z.string().optional(),
  SMS_SENDER_ID: z.string().optional(),
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
};

export function requireEnv<K extends keyof typeof env>(key: K): NonNullable<(typeof env)[K]> {
  const value = env[key];
  if (value === undefined || value === null || (typeof value === 'string' && value.length === 0)) {
    throw new Error(`Missing required env: ${String(key)}`);
  }
  return value as NonNullable<(typeof env)[K]>;
}


