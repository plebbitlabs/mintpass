import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { getSmsDeliveryStatus, setSmsDeliveryStatus, type SmsDeliveryStatus } from '../../../../lib/kv';
import { env } from '../../../../lib/env';

const Query = z.object({ sid: z.string().min(10) });

// Query Twilio API directly for message status
async function getTwilioMessageStatus(messageSid: string): Promise<SmsDeliveryStatus | null> {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) {
    console.log('Twilio credentials not configured, cannot query API directly');
    return null;
  }

  try {
    const accountSid = env.TWILIO_ACCOUNT_SID;
    const authToken = env.TWILIO_AUTH_TOKEN;
    const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages/${encodeURIComponent(messageSid)}.json`;
    
    const authorization = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${authorization}`,
        'Accept': 'application/json',
      },
    });

    if (!res.ok) {
      console.error(`Twilio API error ${res.status}:`, await res.text().catch(() => 'Failed to read response'));
      return null;
    }

    const data = await res.json() as {
      status?: string;
      error_code?: number | string;
      error_message?: string;
    };

    console.log(`Twilio API status for ${messageSid}:`, { 
      status: data.status, 
      errorCode: data.error_code, 
      errorMessage: data.error_message 
    });

    const status: SmsDeliveryStatus = {
      status: data.status || 'unknown',
      updatedAt: Date.now(),
    };

    if (data.error_code !== undefined && data.error_code !== null) {
      status.errorCode = data.error_code;
    }
    if (data.error_message && typeof data.error_message === 'string') {
      status.errorMessage = data.error_message;
    }

    // Only cache final statuses to avoid caching transient ones like "accepted" or "queued"
    const finalStatuses = ['delivered', 'failed', 'undelivered'];
    const isFinalStatus = finalStatuses.includes(status.status.toLowerCase());
    
    if (isFinalStatus) {
      try {
        await setSmsDeliveryStatus(messageSid, status);
        console.log(`Cached final status for ${messageSid}:`, status.status);
      } catch (e) {
        console.error('Failed to cache Twilio API status in KV:', e);
      }
    } else {
      console.log(`Not caching transient status for ${messageSid}:`, status.status);
    }

    return status;
  } catch (e) {
    console.error('Error querying Twilio API for message status:', e);
    return null;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const parse = Query.safeParse(req.query);
  if (!parse.success) return res.status(400).json({ error: 'Invalid query' });
  const { sid } = parse.data;
  
  // First try to get status from KV (webhook data)
  let status = await getSmsDeliveryStatus(sid);
  console.log(`KV status for ${sid}:`, status);
  
  const finalStatuses = ['delivered', 'failed', 'undelivered'];
  const isKvStatusFinal = status && finalStatuses.includes(status.status.toLowerCase());
  
  // Query Twilio API if no KV data OR if KV shows transient status that might have changed
  if (!status || !isKvStatusFinal) {
    const reason = !status ? 'No webhook data' : `Non-final status: ${status.status}`;
    console.log(`${reason} for ${sid}, querying Twilio API directly`);
    const twilioStatus = await getTwilioMessageStatus(sid);
    if (twilioStatus) {
      status = twilioStatus;
    }
  }
  
  if (!status) {
    console.log(`No status available for ${sid} from either KV or Twilio API`);
    return res.status(200).json({ status: 'unknown' });
  }
  
  return res.status(200).json(status);
}


