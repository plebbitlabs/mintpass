import { randomBytes } from 'crypto';

// Generate a unique session ID for grouping related database entries
export function generateSessionId(): string {
  return randomBytes(16).toString('hex');
}

// Session-aware key generation for better data management
export function sessionKey(sessionId: string, type: string, identifier: string): string {
  const values = { sessionId, type, identifier } as const;
  for (const [k, v] of Object.entries(values)) {
    if (typeof v !== 'string') throw new TypeError(`sessionKey: ${k} must be a string`);
    if (v.trim().length === 0) throw new TypeError(`sessionKey: ${k} must be non-empty`);
    if (!/^[^\s:]+$/.test(v)) throw new TypeError(`sessionKey: ${k} contains invalid characters`);
  }
  return `session:${sessionId}:${type}:${identifier}`;
}

// Extract session ID from a session key with DoS protection
export function extractSessionId(sessionKey: string): string | null {
  // Validate input
  if (typeof sessionKey !== 'string') return null;
  if (sessionKey.length > 1024) return null; // Prevent extremely long inputs
  
  // Use simple string operations instead of regex
  if (!sessionKey.startsWith('session:')) return null;
  
  const parts = sessionKey.split(':');
  if (parts.length < 3) return null; // Should have at least "session", sessionId, and type
  
  const sessionId = parts[1];
  
  // Validate session ID format (alphanumeric, reasonable length)
  if (!sessionId || sessionId.length === 0 || sessionId.length > 64) return null;
  if (!/^[a-zA-Z0-9]+$/.test(sessionId)) return null;
  
  return sessionId;
}
