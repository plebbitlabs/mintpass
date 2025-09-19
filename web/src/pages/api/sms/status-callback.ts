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

  console.log('Webhook received:', { 
    contentType: req.headers['content-type'],
    userAgent: req.headers['user-agent'],
    bodyKeys: Object.keys(req.body || {}),
  });

  // Accept either JSON or form-encoded; Twilio typically sends form-encoded
  let body: Record<string, unknown> = {};
  if (typeof req.headers['content-type'] === 'string' && req.headers['content-type'].includes('application/json')) {
    body = (req.body || {}) as Record<string, unknown>;
  } else {
    // Next parses form-encoded into req.body as an object as well
    body = (req.body || {}) as Record<string, unknown>;
  }

  const rawSid = (body['MessageSid'] ?? body['messagesid'] ?? body['sid'] ?? '') as unknown;
  const rawStatus = (body['MessageStatus'] ?? body['messagestatus'] ?? body['status'] ?? '') as unknown;
  const messageSid = String(rawSid || '');
  const messageStatus = String(rawStatus || '');
  const errorCode = body['ErrorCode'] ?? body['errorCode'] ?? body['error_code'];
  const errorMessage = body['ErrorMessage'] ?? body['errorMessage'] ?? body['error_message'];

  console.log('Webhook parsed data:', { 
    messageSid, 
    messageStatus, 
    errorCode, 
    errorMessage,
    fullBody: body,
  });

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
    console.log(`Successfully stored status for ${messageSid}:`, status);
  } catch (e) {
    console.error(`Failed to store status for ${messageSid}:`, e);
  }

  // Twilio expects 2xx; keep response minimal
  return res.status(200).json({ ok: true });
}


