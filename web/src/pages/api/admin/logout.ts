import type { NextApiRequest, NextApiResponse } from 'next';
import { clearAdminSessionCookie } from '../../../../lib/admin-auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  // Basic CSRF protection: validate same-origin via Origin/Referer headers
  const origin = req.headers['origin'] as string | undefined;
  const referer = req.headers['referer'] as string | undefined;
  const host = req.headers['host'];
  const expectedHost = typeof host === 'string' ? host : undefined;

  const isSameOrigin = (() => {
    const check = (url: string | undefined) => {
      if (!url || !expectedHost) return false;
      try {
        const u = new URL(url);
        return u.host === expectedHost;
      } catch {
        return false;
      }
    };
    // Accept if either Origin or Referer matches our host
    return check(origin) || check(referer);
  })();

  if (!isSameOrigin) {
    return res.status(403).json({ error: 'Invalid origin' });
  }

  clearAdminSessionCookie(res);
  return res.status(200).json({ ok: true });
}


