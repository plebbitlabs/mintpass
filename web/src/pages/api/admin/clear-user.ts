import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { kv } from '@vercel/kv';
import { hashIdentifier } from '../../../../lib/hash';
import { getClientIp } from '../../../../lib/request-ip';

const Body = z.object({
  adminPassword: z.string().min(1),
  address: z.string().min(1).optional(),
  phoneE164: z.string().min(5).optional(),
  clearIpCooldowns: z.boolean().optional(),
}).refine(
  (data) => data.address || data.phoneE164,
  {
    message: "Either address or phoneE164 is required",
    path: ["address", "phoneE164"],
  }
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const parse = Body.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'Invalid body' });
  
  const { adminPassword, address, phoneE164, clearIpCooldowns } = parse.data;
  
  // Simple password protection - in production, use proper auth
  const envPassword = process.env.ADMIN_PASSWORD;
  const hasEnvPassword = Boolean(envPassword);
  const passwordsMatch = adminPassword === envPassword;
  
  if (!hasEnvPassword) {
    return res.status(500).json({ error: 'ADMIN_PASSWORD not configured in environment' });
  }
  
  if (!passwordsMatch) {
    // Log debug info server-side only (never send passwords in HTTP response)
    if (process.env.NODE_ENV === 'development' && envPassword) {
      console.error('[admin] Password mismatch:', {
        providedLength: adminPassword.length,
        expectedLength: envPassword.length,
        providedStart: adminPassword.substring(0, 2),
        expectedStart: envPassword.substring(0, 2),
      });
    }
    return res.status(401).json({ error: 'Invalid password' });
  }

  const keysToDelete: string[] = [];

  if (address) {
    const lowerAddr = address.toLowerCase();
    const hashedAddr = hashIdentifier('addr', lowerAddr);
    keysToDelete.push(
      `mint:address:${hashedAddr}`,
      `mint:address:${lowerAddr}` // Legacy plaintext fallback
    );
  }

  if (phoneE164) {
    const hashedPhone = hashIdentifier('phone', phoneE164);
    keysToDelete.push(
      `mint:phone:${hashedPhone}`,
      `mint:phone:${phoneE164}`, // Legacy plaintext fallback
      `sms:code:${hashedPhone}`,
      `sms:code:${phoneE164}`, // Legacy plaintext fallback
      `sms:verified:${hashedPhone}`,
      `sms:verified:${phoneE164}`, // Legacy plaintext fallback
      `cd:sms:phone:${hashedPhone}`,
      `cd:sms:phone:${phoneE164}` // Legacy plaintext fallback
    );
  }

  if (clearIpCooldowns) {
    const ip = getClientIp(req);
    const hashedIp = hashIdentifier('ip', ip);
    keysToDelete.push(
      `cd:mint:ip:${hashedIp}`,
      `cd:mint:ip:${ip}`, // Legacy plaintext fallback
      `cd:sms:ip:${hashedIp}`,
      `cd:sms:ip:${ip}` // Legacy plaintext fallback
    );
  }

  // Delete all keys and get actual deletion count
  let actualDeletedCount = 0;
  if (keysToDelete.length > 0) {
    const deleteResult = await kv.del(...keysToDelete);
    actualDeletedCount = typeof deleteResult === 'number' ? deleteResult : 0;
  }

  return res.status(200).json({ 
    ok: true, 
    deletedKeys: actualDeletedCount,
    attemptedKeys: keysToDelete.length,
    message: `Cleared ${actualDeletedCount} database entries (attempted ${keysToDelete.length})`
  });
}
