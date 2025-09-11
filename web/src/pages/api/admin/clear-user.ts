import type { NextApiRequest, NextApiResponse } from 'next';
import net from 'node:net';
import { z } from 'zod';
import { kv } from '@vercel/kv';
import { hashIdentifier } from '../../../../lib/hash';
import { requireAdmin } from '../../../../lib/admin-auth';

const Body = z.object({
  address: z.string().min(1).optional(),
  phoneE164: z.string().min(5).optional(),
  clearIpCooldowns: z.boolean().optional(),
  targetIp: z.string().trim().optional(),
}).refine(
  (data) => data.address || data.phoneE164,
  {
    message: "Either address or phoneE164 is required",
    path: ["address", "phoneE164"],
  }
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!requireAdmin(req, res)) return;

  const parse = Body.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'Invalid body' });

  const { address, phoneE164, clearIpCooldowns, targetIp } = parse.data;

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
    // Require explicit targetIp rather than using requester IP to avoid abuse
    const targetIpRaw = typeof targetIp === 'string' ? targetIp.trim() : undefined;
    if (targetIpRaw) {
      const isValidIp = net.isIP(targetIpRaw) > 0;
      if (!isValidIp) {
        return res.status(400).json({ error: 'Invalid targetIp' });
      }
      const hashedIp = hashIdentifier('ip', targetIpRaw);
      keysToDelete.push(
        `cd:mint:ip:${hashedIp}`,
        `cd:mint:ip:${targetIpRaw}`, // Legacy plaintext fallback
        `cd:sms:ip:${hashedIp}`,
        `cd:sms:ip:${targetIpRaw}` // Legacy plaintext fallback
      );
    } else {
      return res.status(400).json({ error: 'targetIp is required when clearIpCooldowns is true' });
    }
  }

  // Delete all keys and get actual deletion count
  let actualDeletedCount = 0;
  if (keysToDelete.length > 0) {
    try {
      const deleteResult = await kv.del(...keysToDelete);
      actualDeletedCount = typeof deleteResult === 'number' ? deleteResult : 0;
    } catch (err) {
      console.error('Failed to delete keys in clear-user', { address, phoneE164, keysToDelete, err });
      return res.status(500).json({ error: 'Failed to delete some keys' });
    }
  }

  // Debug info for development
  const debugInfo = process.env.NODE_ENV === 'development' ? {
    keysAttempted: keysToDelete,
    addressKeys: address ? 2 : 0,
    phoneKeys: phoneE164 ? 8 : 0, 
    ipCooldownKeys: clearIpCooldowns ? 4 : 0,
  } : undefined;

  return res.status(200).json({ 
    ok: true, 
    deletedKeys: actualDeletedCount,
    attemptedKeys: keysToDelete.length,
    message: `Successfully cleared ${actualDeletedCount} existing entries (checked ${keysToDelete.length} possible keys)`,
    debug: debugInfo
  });
}
