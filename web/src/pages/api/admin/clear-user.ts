import type { NextApiRequest, NextApiResponse } from 'next';
import net from 'node:net';
import { z } from 'zod';
import { kv } from '@vercel/kv';
import { hashIdentifier } from '../../../../lib/hash';
import { requireAdmin } from '../../../../lib/admin-auth';
import { createRatelimit } from '../../../../lib/rate-limit';

const Body = z
  .object({
    address: z.string().min(1).optional(),
    phoneE164: z.string().min(5).optional(),
    clearIpCooldowns: z.boolean().optional(),
    targetIp: z.string().trim().optional(),
  })
  .refine(
    (data) =>
      Boolean(data.address) ||
      Boolean(data.phoneE164) ||
      (Boolean(data.clearIpCooldowns) && typeof data.targetIp === 'string' && data.targetIp.trim().length > 0),
    {
      message: 'Provide address or phoneE164, or set clearIpCooldowns with targetIp',
      path: ['address', 'phoneE164', 'targetIp'],
    }
  );

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!requireAdmin(req, res)) return;

  const parse = Body.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: 'Invalid body' });

  const { address, phoneE164, clearIpCooldowns, targetIp } = parse.data;
  const adminIp = (req.headers['cf-connecting-ip'] as string) || (req.headers['x-real-ip'] as string) || req.socket.remoteAddress || 'unknown';
  // Lightweight rate limit for clear operations
  const clearLimit = createRatelimit('rl:admin:clear', 10, 60); // 10 per minute per project
  const { success: allowClear } = await clearLimit.limit('all');
  if (!allowClear) return res.status(429).json({ error: 'Too many clear requests' });

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
      // Audit intent prior to deletion
      try {
        const ts = new Date().toISOString();
        console.info('[AUDIT] admin_clear_ip_cooldowns_intent', { ts, actor: adminIp, targetIp: targetIpRaw });
      } catch {}
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
      // Audit failure (avoid PII; hash already applied in keys)
      try {
        const ts = new Date().toISOString();
        const actor = req.headers['cf-connecting-ip'] || req.headers['x-real-ip'] || req.socket.remoteAddress || 'unknown';
        console.error('[AUDIT] admin_clear_user_failed', { ts, actor, attemptedKeys: keysToDelete.length, error: 'kv_del_failed' });
      } catch {}
      console.error('Failed to delete keys in clear-user', { address, phoneE164, keysToDelete, err });
      return res.status(500).json({ error: 'Failed to delete some keys' });
    }
  }

  // Debug info for development (derive counts from keysToDelete)
  const debugInfo = process.env.NODE_ENV === 'development' ? ((): {
    keysAttempted: string[];
    addressKeys: number;
    phoneKeys: number;
    ipCooldownKeys: number;
  } => {
    let addressKeys = 0;
    let phoneKeys = 0;
    let ipCooldownKeys = 0;
    if (address) {
      // Two address keys are added when address is provided
      addressKeys = keysToDelete.filter((k) => k.startsWith('mint:address:')).length;
    }
    if (phoneE164) {
      // Eight phone-related keys are added when phoneE164 is provided
      const phonePrefixes = ['mint:phone:', 'sms:code:', 'sms:verified:', 'cd:sms:phone:'];
      phoneKeys = keysToDelete.filter((k) => phonePrefixes.some((p) => k.startsWith(p))).length;
    }
    if (clearIpCooldowns) {
      // Four IP cooldown keys are added when clearIpCooldowns is set
      const ipPrefixes = ['cd:mint:ip:', 'cd:sms:ip:'];
      ipCooldownKeys = keysToDelete.filter((k) => ipPrefixes.some((p) => k.startsWith(p))).length;
    }
    return {
      keysAttempted: keysToDelete,
      addressKeys,
      phoneKeys,
      ipCooldownKeys,
    };
  })() : undefined;

  // Audit success
  try {
    const ts = new Date().toISOString();
    const actor = req.headers['cf-connecting-ip'] || req.headers['x-real-ip'] || req.socket.remoteAddress || 'unknown';
    console.info('[AUDIT] admin_clear_user_success', { ts, actor, attemptedKeys: keysToDelete.length, deletedKeys: actualDeletedCount });
  } catch {}

  return res.status(200).json({ 
    ok: true, 
    deletedKeys: actualDeletedCount,
    attemptedKeys: keysToDelete.length,
    message: `Successfully cleared ${actualDeletedCount} existing entries (checked ${keysToDelete.length} possible keys)`,
    debug: debugInfo
  });
}
