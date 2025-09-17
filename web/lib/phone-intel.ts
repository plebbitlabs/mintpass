import { z } from 'zod';

export type PhoneCheck = {
  phoneE164: string;
  isDisposable: boolean;
  isVoip: boolean;
  isHighRisk: boolean;
  carrierType?: string;
  provider?: 'abstractapi' | 'none';
};

const AbstractPhoneResp = z.object({
  valid: z.boolean().optional(),
  number: z.string().optional(),
  disposable: z.boolean().optional(),
  type: z.string().optional(), // e.g., 'mobile', 'voip'
  risk: z.number().optional(),
});

export async function analyzePhone(phoneE164: string): Promise<PhoneCheck> {
  const key = process.env.ABSTRACTAPI_PHONE_KEY;
  if (key) {
    try {
      const url = `https://phonevalidation.abstractapi.com/v1/?api_key=${encodeURIComponent(key)}&phone=${encodeURIComponent(phoneE164)}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      const data = await res.json();
      const parsed = AbstractPhoneResp.safeParse(data);
      if (parsed.success) {
        const t = (parsed.data.type || '').toLowerCase();
        const isVoip = t.includes('voip');
        const isDisposable = Boolean(parsed.data.disposable);
        const risk = parsed.data.risk ?? 0;
        const isHighRisk = isVoip || isDisposable || risk >= 70;
        return {
          phoneE164,
          isDisposable,
          isVoip,
          isHighRisk,
          carrierType: parsed.data.type,
          provider: 'abstractapi',
        };
      }
    } catch {
      // fall through to default
    }
  }
  return { phoneE164, isDisposable: false, isVoip: false, isHighRisk: false, provider: 'none' };
}


