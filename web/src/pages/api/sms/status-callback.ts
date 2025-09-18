import type { NextApiRequest, NextApiResponse } from 'next';
import { setSmsDeliveryStatus, type SmsDeliveryStatus } from '../../../../lib/kv';

// Twilio will POST x-www-form-urlencoded fields. We only store minimal delivery state.
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '100kb',
    },
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Accept either JSON or form-encoded; Twilio typically sends form-encoded
  let body: Record<string, unknown> = {};
  if (typeof req.headers['content-type'] === 'string' && req.headers['content-type'].includes('application/json')) {
    body = (req.body || {}) as Record<string, unknown>;
  } else {
    // Next parses form-encoded into req.body as an object as well
    body = (req.body || {}) as Record<string, unknown>;
  }

  const messageSid = String(body['MessageSid'] || body['MessageSid'.toLowerCase()] || body['sid'] || '');
  const messageStatus = String(body['MessageStatus'] || body['MessageStatus'.toLowerCase()] || body['status'] || '');
  const errorCode = body['ErrorCode'] ?? body['errorCode'] ?? body['error_code'];
  const errorMessage = body['ErrorMessage'] ?? body['errorMessage'] ?? body['error_message'];

  if (!messageSid) return res.status(400).json({ error: 'Missing MessageSid' });
  if (!messageStatus) return res.status(400).json({ error: 'Missing MessageStatus' });

  const status: SmsDeliveryStatus = {
    status: messageStatus,
    updatedAt: Date.now(),
  };
  if (typeof errorCode === 'string' || typeof errorCode === 'number') status.errorCode = errorCode as string | number;
  if (typeof errorMessage === 'string') status.errorMessage = errorMessage as string;

  try {
    await setSmsDeliveryStatus(messageSid, status);
  } catch {}

  // Twilio expects 2xx; keep response minimal
  return res.status(200).json({ ok: true });
}


