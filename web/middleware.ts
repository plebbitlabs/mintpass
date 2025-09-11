import { NextRequest, NextResponse } from 'next/server';
import { policy } from './lib/policy';
import { verifyAdminTokenEdge } from './lib/admin-auth-edge';

export async function middleware(req: NextRequest) {
  // Block by country if configured (prefer Vercel header at edge)
  const headerCountry = req.headers.get('x-vercel-ip-country') || '';
  const country = headerCountry.toUpperCase();
  if (country && policy.BLOCKED_COUNTRIES.includes(country)) {
    return new NextResponse(JSON.stringify({ error: 'Access blocked in your region' }), {
      status: 451,
      headers: { 'content-type': 'application/json' },
    });
  }

  // Protect admin routes both API and page access at the edge where possible
  const { pathname } = req.nextUrl;
  const isAdminApi = pathname.startsWith('/api/admin');
  const isAdminPage = pathname === '/admin' || pathname.startsWith('/admin/');
  if (isAdminApi || isAdminPage) {
    const token = req.cookies.get('admin_session')?.value;
    const secret = process.env.ADMIN_SESSION_SECRET;
    try {
      if (!token || !secret) {
        if (isAdminApi) {
          return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'content-type': 'application/json' },
          });
        }
        const url = req.nextUrl.clone();
        url.pathname = '/';
        return NextResponse.redirect(url);
      }
      // Edge-safe verification
      const ok = await verifyAdminTokenEdge(token, secret);
      if (!ok) {
        if (isAdminApi) {
          return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'content-type': 'application/json' },
          });
        }
        const url = req.nextUrl.clone();
        url.pathname = '/';
        return NextResponse.redirect(url);
      }
    } catch {
      if (isAdminApi) {
        return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        });
      }
      const url = req.nextUrl.clone();
      url.pathname = '/';
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*', '/admin', '/admin/:path*'],
};


