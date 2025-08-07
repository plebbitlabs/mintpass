import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { clearSmsCode, markPhoneVerified, readSmsCode } from '../../../../lib/kv';

const Body = z.object({
  phoneE164: z.string().min(5),
  code: z.string().length(6),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const parse = Body.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'Invalid body' });
  const { phoneE164, code } = parse.data;

  const stored = await readSmsCode(phoneE164);
  if (!stored) return res.status(400).json({ error: 'Code expired or not found' });
  if (stored !== code) return res.status(400).json({ error: 'Invalid code' });

  await markPhoneVerified(phoneE164);
  await clearSmsCode(phoneE164);
  return res.status(200).json({ ok: true });
}


