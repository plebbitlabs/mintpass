import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { requireEnv, env } from './env';

// Single Redis instance for the app using Vercel KV credentials
const redis = new Redis({
  url: requireEnv('KV_REST_API_URL'),
  token: requireEnv('KV_REST_API_TOKEN'),
});

// Global IP rate limiter (used as default)
export const globalIpRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(env.RATE_LIMIT_MAX_REQUESTS, `${env.RATE_LIMIT_WINDOW_SECONDS} s`),
  analytics: true,
  prefix: 'rl:ip',
});

export function createRatelimit(prefix: string, maxRequests: number, windowSeconds: number) {
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(maxRequests, `${windowSeconds} s`),
    analytics: true,
    prefix,
  });
}


