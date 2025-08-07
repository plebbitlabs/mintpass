import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { hasMinted, hasPhoneMinted, isPhoneVerified } from '../../../lib/kv';

const Body = z.object({
  address: z.string().min(1),
  phoneE164: z.string().min(5),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const parse = Body.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'Invalid body' });
  const { address, phoneE164 } = parse.data;

  const [mintedAddr, mintedPhone, verified] = await Promise.all([
    hasMinted(address),
    hasPhoneMinted(phoneE164),
    isPhoneVerified(phoneE164),
  ]);

  const eligible = !mintedAddr && !mintedPhone && verified;
  return res.status(200).json({ eligible, mintedAddr, mintedPhone, verified });
}


