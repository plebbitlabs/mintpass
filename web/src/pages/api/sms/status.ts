import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { getSmsDeliveryStatus } from '../../../../lib/kv';

const Query = z.object({ sid: z.string().min(10) });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const parse = Query.safeParse(req.query);
  if (!parse.success) return res.status(400).json({ error: 'Invalid query' });
  const { sid } = parse.data;
  const status = await getSmsDeliveryStatus(sid);
  if (!status) return res.status(200).json({ status: 'unknown' });
  return res.status(200).json(status);
}


