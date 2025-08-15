import { NextRequest, NextResponse } from 'next/server';
import { policy } from './lib/policy';

export function middleware(req: NextRequest) {
  // Block by country if configured (prefer Vercel header at edge)
  const headerCountry = req.headers.get('x-vercel-ip-country') || '';
  const country = headerCountry.toUpperCase();
  if (country && policy.BLOCKED_COUNTRIES.includes(country)) {
    return new NextResponse(JSON.stringify({ error: 'Access blocked in your region' }), {
      status: 451,
      headers: { 'content-type': 'application/json' },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*'],
};


