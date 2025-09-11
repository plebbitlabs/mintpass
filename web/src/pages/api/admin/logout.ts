import type { NextApiRequest, NextApiResponse } from 'next';
import { clearAdminSessionCookie } from '../../../../lib/admin-auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  // Strict CSRF protection: require Origin and validate protocol+host
  const origin = req.headers['origin'] as string | undefined;
  const host = req.headers['host'];
  const expectedHost = typeof host === 'string' ? host : undefined;
  if (!origin || !expectedHost) return res.status(403).json({ error: 'Invalid origin' });
  try {
    const u = new URL(origin);
    const isProd = process.env.NODE_ENV === 'production';
    if ((isProd && u.protocol !== 'https:') || u.host !== expectedHost) {
      return res.status(403).json({ error: 'Invalid origin' });
    }
  } catch {
    return res.status(403).json({ error: 'Invalid origin' });
  }

  clearAdminSessionCookie(res);
  return res.status(200).json({ ok: true });
}


