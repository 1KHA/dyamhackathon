import { NextRequest, NextResponse } from 'next/server';
// Import the minimal jwt/verify submodule, not the package root — the root
// index also pulls in jose's JWE (encryption) code path, which references
// CompressionStream/DecompressionStream and is not Edge Runtime safe.
import { jwtVerify } from 'jose/jwt/verify';

/**
 * Safety net for /api/admin/*: rejects any request with no valid JWT at all,
 * before it reaches a route handler.
 *
 * This is deliberately coarse — "some valid token exists" — not "the caller
 * is an admin". A few admin-prefixed routes (mentors GET, mentor availability
 * GET) are legitimately called by participants browsing mentors before
 * booking, so the admin-vs-any-role distinction stays in each route's own
 * requireAdmin()/verifyToken() check (src/lib/notification-auth.ts). This
 * middleware exists so a future route that forgets an auth check entirely
 * still can't be called anonymously.
 *
 * Runs on the Edge runtime (Next.js middleware constraint), hence `jose`
 * instead of `jsonwebtoken` — the latter depends on Node's `crypto` module,
 * which isn't available here.
 */

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Public — no cookie exists yet at this point in the flow
const PUBLIC_ADMIN_PATHS = ['/api/admin/login'];

export async function middleware(request: NextRequest) {
  if (PUBLIC_ADMIN_PATHS.includes(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get('token')?.value;

  if (!token) {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
  }

  try {
    await jwtVerify(token, new TextEncoder().encode(JWT_SECRET));
  } catch {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/admin/:path*'],
};
