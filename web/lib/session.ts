import { randomBytes } from 'crypto';

// Generate a unique session ID for grouping related database entries
export function generateSessionId(): string {
  return randomBytes(16).toString('hex');
}

// Session-aware key generation for better data management
export function sessionKey(sessionId: string, type: string, identifier: string): string {
  return `session:${sessionId}:${type}:${identifier}`;
}

// Extract session ID from a session key
export function extractSessionId(sessionKey: string): string | null {
  const match = sessionKey.match(/^session:([^:]+):/);
  return match ? match[1] : null;
}
