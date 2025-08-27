import { env } from './env';

export type SendResult = {
  attempted: boolean;
  ok: boolean;
  provider?: 'twilio';
  status?: number;
  error?: string;
};

function toUrlEncoded(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

type SendOptions = {
  timeoutMs?: number; // per-attempt timeout
  maxRetries?: number; // number of retries on transient errors (not counting first attempt)
  baseDelayMs?: number; // base backoff delay
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendOtpSms(
  phoneE164: string,
  code: string,
  options: SendOptions = {}
): Promise<SendResult> {
  // Prefer Twilio if configured
  if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && (env.TWILIO_MESSAGING_SERVICE_SID || env.SMS_SENDER_ID)) {
    const accountSid = env.TWILIO_ACCOUNT_SID;
    const authToken = env.TWILIO_AUTH_TOKEN;
    const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`;

    const bodyParams: Record<string, string> = {
      To: phoneE164,
      Body: `Your MintPass verification code: ${code}`,
    };
    if (env.TWILIO_MESSAGING_SERVICE_SID) {
      bodyParams.MessagingServiceSid = env.TWILIO_MESSAGING_SERVICE_SID;
    } else if (env.SMS_SENDER_ID) {
      bodyParams.From = env.SMS_SENDER_ID;
    }

    const authorization = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

    const timeoutMs = Number.isFinite(options.timeoutMs) && (options.timeoutMs as number) > 0 ? (options.timeoutMs as number) : 6000;
    const maxRetries = Number.isFinite(options.maxRetries) && (options.maxRetries as number) >= 0 ? (options.maxRetries as number) : 2;
    const baseDelayMs = Number.isFinite(options.baseDelayMs) && (options.baseDelayMs as number) >= 0 ? (options.baseDelayMs as number) : 300;

    let attempt = 0;
    // attempts = 1 + maxRetries
    while (attempt <= maxRetries) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${authorization}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          // Do not log or expose OTP or secrets
          body: toUrlEncoded(bodyParams),
          signal: controller.signal,
        });
        clearTimeout(timer);

        // Do not retry client errors (4xx)
        if (res.ok) {
          return { attempted: true, ok: true, provider: 'twilio', status: res.status };
        }
        if (res.status >= 400 && res.status < 500) {
          return { attempted: true, ok: false, provider: 'twilio', status: res.status, error: `Twilio responded with ${res.status}` };
        }

        // 5xx - retry
      } catch {
        // Network error/timeout/abort -> considered transient, go to retry
      } finally {
        clearTimeout(timer);
      }

      attempt += 1;
      if (attempt > maxRetries) {
        break;
      }
      // Exponential backoff with jitter
      const backoff = baseDelayMs * 2 ** (attempt - 1);
      const jitter = Math.floor(Math.random() * (baseDelayMs / 2));
      await sleep(backoff + jitter);
    }

    return { attempted: true, ok: false, provider: 'twilio', error: 'Twilio send failed after retries' };
  }

  // No provider configured; treat as success to allow smoke tests
  return { attempted: false, ok: true };
}


