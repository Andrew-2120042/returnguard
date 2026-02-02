/**
 * Next.js Middleware
 * Phase 3: Request filtering, rate limiting, and security headers
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { checkRateLimit, getRateLimitIdentifier, type RateLimitType } from '@/lib/security/rate-limiter';

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Skip rate limiting for static files and internal Next.js routes
  if (
    path.startsWith('/_next') ||
    path.startsWith('/static') ||
    path.includes('.')
  ) {
    return NextResponse.next();
  }

  // Only apply rate limiting to API routes
  if (path.startsWith('/api')) {
    // Determine rate limit type based on endpoint
    let limitType: RateLimitType = 'api';

    if (path.startsWith('/api/auth/shopify/callback')) {
      limitType = 'oauth';
    } else if (
      path.startsWith('/api/data/customers') ||
      path.startsWith('/api/fraud/intelligence')
    ) {
      limitType = 'sensitive';
    } else if (
      path.startsWith('/api/fraud/policies') ||
      path.startsWith('/api/settings') ||
      path.startsWith('/api/admin')
    ) {
      limitType = 'admin';
    } else if (path.startsWith('/api/fraud/analyze')) {
      limitType = 'fraudIntelligence';
    } else if (path.startsWith('/api/webhooks')) {
      limitType = 'webhook';
    }

    // Get identifier (IP + session if available)
    const sessionCookie = request.cookies.get('merchant_id');
    const identifier = getRateLimitIdentifier(
      request,
      sessionCookie?.value
    );

    // Check rate limit
    const { success, limit, remaining, reset } = await checkRateLimit(
      identifier,
      limitType
    );

    if (!success) {
      // Rate limit exceeded
      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          message: 'Too many requests. Please try again later.',
          limit,
          reset: new Date(reset).toISOString()
        },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': limit.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': reset.toString(),
            'Retry-After': Math.ceil((reset - Date.now()) / 1000).toString()
          }
        }
      );
    }

    // Add rate limit headers to response
    const response = NextResponse.next();
    response.headers.set('X-RateLimit-Limit', limit.toString());
    response.headers.set('X-RateLimit-Remaining', remaining.toString());
    response.headers.set('X-RateLimit-Reset', reset.toString());

    // Add security headers
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('X-XSS-Protection', '1; mode=block');
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains'
    );

    return response;
  }

  // For non-API routes, just add security headers
  const response = NextResponse.next();
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set(
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains'
  );

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)'
  ]
};
