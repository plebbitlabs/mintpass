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

    const data = await res.json() as Record<string, unknown>;

    console.log(`=== COMPLETE TWILIO API RESPONSE for ${messageSid} ===`);
    console.log('Raw response:', JSON.stringify(data, null, 2));
    console.log('All keys:', Object.keys(data));
    console.log('=== END TWILIO RESPONSE ===');

    // Check all possible field variations for error message
    const possibleErrorMessageFields = [
      'error_message', 'errorMessage', 'Error_Message', 'ErrorMessage',
      'message', 'Message', 'more_info', 'MoreInfo', 'detail', 'Detail',
      'description', 'Description', 'reason', 'Reason'
    ];
    
    console.log('Checking all possible error message fields:');
    possibleErrorMessageFields.forEach(field => {
      if (data[field] !== undefined) {
        console.log(`  ${field}:`, data[field]);
      }
    });

    // Extract basic fields
    const messageStatus = data.status as string;
    const errorCode = data.error_code ?? data.errorCode;
    const errorMessage = data.error_message ?? data.errorMessage ?? data.message ?? data.Message;

    console.log(`Extracted values:`, { messageStatus, errorCode, errorMessage });

    const status: SmsDeliveryStatus = {
      status: messageStatus || 'unknown',
      updatedAt: Date.now(),
    };

    // Add error code if present
    if (errorCode !== undefined && errorCode !== null) {
      if (typeof errorCode === 'string' || typeof errorCode === 'number') {
        status.errorCode = errorCode;
      }
    }
    
    // Add error message if present - only use official Twilio messages
    if (errorMessage && typeof errorMessage === 'string') {
      status.errorMessage = errorMessage;
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
  console.log(`=== KV STATUS CHECK for ${sid} ===`);
  console.log('KV result:', JSON.stringify(status, null, 2));
  console.log('=== END KV STATUS ===');
  
  const finalStatuses = ['delivered', 'failed', 'undelivered'];
  const isKvStatusFinal = status && finalStatuses.includes(status.status.toLowerCase());
  
  let dataSource = 'webhook/kv';
  
  // Query Twilio API if no KV data OR if KV shows transient status that might have changed
  if (!status || !isKvStatusFinal) {
    const reason = !status ? 'No webhook data' : `Non-final status: ${status.status}`;
    console.log(`${reason} for ${sid}, querying Twilio API directly`);
    const twilioStatus = await getTwilioMessageStatus(sid);
    if (twilioStatus) {
      status = twilioStatus;
      dataSource = 'twilio-api';
    }
  }
  
  if (!status) {
    console.log(`No status available for ${sid} from either KV or Twilio API`);
    return res.status(200).json({ status: 'unknown' });
  }
  
  // Add debug info about data source  
  const responseWithDebug = {
    ...status,
    _debug: {
      source: dataSource,
      timestamp: new Date().toISOString()
    }
  };
  
  console.log(`Returning status for ${sid}:`, responseWithDebug);
  return res.status(200).json(responseWithDebug);
}


