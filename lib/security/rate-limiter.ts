/**
 * Rate Limiter
 * Phase 3: Prevents abuse and scraping
 *
 * Uses Upstash Redis for distributed rate limiting
 */

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Initialize Redis client
let redis: Redis | null = null;

function getRedisClient(): Redis {
  if (!redis) {
    if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
      throw new Error('Upstash Redis credentials not configured');
    }

    redis = Redis.fromEnv();
  }
  return redis;
}

// Rate limiter cache (lazy initialization)
const rateLimitersCache: Record<string, Ratelimit> = {};

// Rate limiter type
export type RateLimitType = 'api' | 'sensitive' | 'admin' | 'fraudIntelligence' | 'webhook' | 'oauth';

// Rate limiter configurations
const rateLimiterConfigs = {
  api: { window: 100, duration: '60 s' as const, prefix: 'ratelimit:api' },
  sensitive: { window: 20, duration: '60 s' as const, prefix: 'ratelimit:sensitive' },
  admin: { window: 10, duration: '60 s' as const, prefix: 'ratelimit:admin' },
  fraudIntelligence: { window: 50, duration: '60 s' as const, prefix: 'ratelimit:fraud' },
  webhook: { window: 200, duration: '60 s' as const, prefix: 'ratelimit:webhook' },
  oauth: { window: 5, duration: '300 s' as const, prefix: 'ratelimit:oauth' }
} as const;

/**
 * Get or create a rate limiter for the given type
 * Uses lazy initialization to avoid startup errors when Redis is not configured
 *
 * @param type - Type of rate limiter
 * @returns Ratelimit instance
 */
function getRateLimiter(type: RateLimitType): Ratelimit {
  // Return cached limiter if exists
  if (rateLimitersCache[type]) {
    return rateLimitersCache[type];
  }

  // Create new limiter (lazy initialization)
  const config = rateLimiterConfigs[type];
  const redis = getRedisClient();

  rateLimitersCache[type] = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(config.window, config.duration),
    analytics: true,
    prefix: config.prefix
  });

  return rateLimitersCache[type];
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
}

/**
 * Check rate limit for an identifier
 *
 * @param identifier - Unique identifier (IP + session, merchant ID, etc.)
 * @param type - Type of rate limit to apply
 * @returns Rate limit result
 */
export async function checkRateLimit(
  identifier: string,
  type: RateLimitType = 'api'
): Promise<RateLimitResult> {
  try {
    // Get or create rate limiter (lazy initialization)
    const limiter = getRateLimiter(type);
    const result = await limiter.limit(identifier);

    // Log rate limit exceeded events
    if (!result.success) {
      console.warn(`Rate limit exceeded for ${type}: ${identifier}`);

      // Import dynamically to avoid circular dependency
      const { logAuditEvent } = await import('./audit-logger');
      await logAuditEvent({
        eventType: 'RATE_LIMIT_EXCEEDED',
        severity: 'MEDIUM',
        details: {
          identifier,
          type,
          limit: result.limit,
          reset: new Date(result.reset).toISOString()
        }
      });
    }

    return {
      success: result.success,
      limit: result.limit,
      remaining: result.remaining,
      reset: result.reset
    };
  } catch (error) {
    console.error('Error checking rate limit:', error);

    // On error, allow the request (fail open)
    return {
      success: true,
      limit: 0,
      remaining: 0,
      reset: Date.now()
    };
  }
}

/**
 * Get rate limit identifier from request
 * Combines IP address and session/merchant ID for more accurate limiting
 *
 * @param request - Next.js request object
 * @param sessionId - Optional session or merchant ID
 * @returns Unique identifier
 */
export function getRateLimitIdentifier(
  request: Request,
  sessionId?: string
): string {
  // Get IP address (handles Vercel proxies)
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0] ||
    request.headers.get('x-real-ip') ||
    'unknown';

  // Combine IP with session ID for more granular limiting
  if (sessionId) {
    return `${sessionId}-${ip}`;
  }

  return ip;
}

/**
 * Reset rate limit for an identifier (admin use only)
 *
 * @param identifier - Identifier to reset
 * @param type - Rate limit type
 * @returns True if successful
 */
export async function resetRateLimit(
  identifier: string,
  type: RateLimitType
): Promise<boolean> {
  try {
    const redis = getRedisClient();
    const prefix = `ratelimit:${type}`;
    const key = `${prefix}:${identifier}`;

    await redis.del(key);

    console.log(`Reset rate limit for ${type}: ${identifier}`);
    return true;
  } catch (error) {
    console.error('Error resetting rate limit:', error);
    return false;
  }
}

/**
 * Get rate limit status without checking (for display purposes)
 *
 * @param identifier - Identifier to check
 * @param type - Rate limit type
 * @returns Current rate limit status
 */
export async function getRateLimitStatus(
  identifier: string,
  type: RateLimitType
): Promise<{ remaining: number; limit: number; reset: number } | null> {
  try {
    const redis = getRedisClient();
    const prefix = `ratelimit:${type}`;
    const key = `${prefix}:${identifier}`;

    const data = await redis.get(key);

    if (!data) {
      // No rate limit data exists
      return null;
    }

    // Parse rate limit data (format depends on Upstash implementation)
    // This is a simplified version
    return {
      remaining: 0,
      limit: 0,
      reset: Date.now()
    };
  } catch (error) {
    console.error('Error getting rate limit status:', error);
    return null;
  }
}
