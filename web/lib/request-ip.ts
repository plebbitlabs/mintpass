import type { NextApiRequest } from 'next';

// Prefer Cloudflare/Vercel headers if present
export function getClientIp(req: NextApiRequest): string {
  const cf = (req.headers['cf-connecting-ip'] as string) || '';
  if (cf) return cf;
  const vercel = (req.headers['x-real-ip'] as string) || '';
  if (vercel) return vercel;
  const xf = (req.headers['x-forwarded-for'] as string) || '';
  const first = xf.split(',')[0]?.trim();
  return first || req.socket.remoteAddress || 'unknown';
}


