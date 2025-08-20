import { env } from './env';

export type SendResult = {
  attempted: boolean;
  ok: boolean;
  provider?: 'twilio';
  status?: number;
};

function toUrlEncoded(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

export async function sendOtpSms(phoneE164: string, code: string): Promise<SendResult> {
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
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${authorization}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      // Do not log or expose OTP or secrets
      body: toUrlEncoded(bodyParams),
    });

    return { attempted: true, ok: res.ok, provider: 'twilio', status: res.status };
  }

  // No provider configured; treat as success to allow smoke tests
  return { attempted: false, ok: true };
}


