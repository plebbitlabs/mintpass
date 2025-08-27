export type Policy = {
  // Country codes (ISO alpha-2) that are blocked at the edge middleware
  BLOCKED_COUNTRIES: string[];

  // Global rate limit window and allowance per IP
  RATE_LIMIT_WINDOW_SECONDS: number;
  RATE_LIMIT_MAX_REQUESTS: number;

  // Cooldowns
  SMS_SEND_COOLDOWN_SECONDS: number; // per-IP and per-phone cooldown for requesting SMS
  MINT_IP_COOLDOWN_SECONDS: number;  // per-IP cooldown after a successful mint
};

// Non-secret anti-abuse policy (committed defaults).
// Adjust these values via code review; secrets remain in env variables.
export const policy: Policy = {
  BLOCKED_COUNTRIES: [],
  RATE_LIMIT_WINDOW_SECONDS: 60,
  RATE_LIMIT_MAX_REQUESTS: 10,
  SMS_SEND_COOLDOWN_SECONDS: 120,
  MINT_IP_COOLDOWN_SECONDS: 7 * 24 * 60 * 60, // 7 days
};


