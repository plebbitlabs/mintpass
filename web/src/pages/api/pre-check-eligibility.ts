import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { hasMinted, hasPhoneMinted } from '../../../lib/kv';
import { globalIpRatelimit } from '../../../lib/rate-limit';
import { getClientIp } from '../../../lib/request-ip';
import { hashIdentifier } from '../../../lib/hash';

const Body = z.object({
  address: z.string().min(1),
  phoneE164: z.string().min(5),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Global IP rate limiting
  const ip = getClientIp(req);
  const hashedIp = hashIdentifier('ip', ip);
  const { success, limit, reset, remaining } = await globalIpRatelimit.limit(hashedIp);
  res.setHeader('X-RateLimit-Limit', String(limit));
  res.setHeader('X-RateLimit-Remaining', String(remaining));
  res.setHeader('X-RateLimit-Reset', String(reset));
  if (!success) return res.status(429).json({ error: 'Too many requests' });

  const parse = Body.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'Invalid body' });
  const { address, phoneE164 } = parse.data;

  const [mintedAddr, mintedPhone] = await Promise.all([
    hasMinted(address),
    hasPhoneMinted(phoneE164),
  ]);

  const eligible = !mintedAddr && !mintedPhone;
  return res.status(200).json({ 
    eligible, 
    mintedAddr, 
    mintedPhone,
    reason: !eligible 
      ? mintedAddr 
        ? 'Address has already minted a MintPass NFT'
        : 'Phone number has already been used to mint a MintPass NFT'
      : null
  });
}
