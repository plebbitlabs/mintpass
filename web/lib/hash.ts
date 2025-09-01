import { createHmac } from 'crypto';
import { env } from './env';

// Deterministic keyed hashing for identifiers with domain separation.
// If HASH_PEPPER is not set, returns the original value for backward compatibility.
export function hashIdentifier(kind: 'phone' | 'ip' | 'addr' | 'generic', value: string): string {
  const pepper = env.HASH_PEPPER;
  if (pepper && pepper.length > 0) {
    return createHmac('sha256', pepper).update(`${kind}:${value}`).digest('hex');
  }
  return value;
}


