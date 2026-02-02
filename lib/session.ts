/**
 * Simple cookie-based session management
 * NO NextAuth - just simple encrypted cookies
 *
 * Stores: shop_domain, merchant_id
 */

import { cookies } from 'next/headers';
import { encrypt, decrypt } from './crypto';
import { getEnvVar, isProduction } from './utils';
import type { SessionData } from './types';

// Session configuration
const SESSION_COOKIE_NAME = 'rg_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

/**
 * Create a new session
 * Encrypts session data and stores in HTTP-only cookie
 *
 * @param shopDomain - Shopify store domain
 * @param merchantId - Merchant ID from database
 */
export async function createSession(
  shopDomain: string,
  merchantId: string
): Promise<void> {
  const sessionData: SessionData = {
    shop_domain: shopDomain,
    merchant_id: merchantId,
  };

  // Encrypt session data
  const { encrypted, iv, authTag } = encrypt(
    JSON.stringify(sessionData),
    merchantId
  );

  // Combine encrypted data, IV, and auth tag (separated by '.')
  const sessionValue = `${encrypted}.${iv}.${authTag}`;

  // Set cookie
  cookies().set(SESSION_COOKIE_NAME, sessionValue, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  });
}

/**
 * Get current session
 * Decrypts and returns session data
 *
 * @returns Session data or null if no session
 */
export async function getSession(): Promise<SessionData | null> {
  // DEVELOPMENT MODE: Bypass auth for local testing
  // Set ENABLE_DEV_SESSION=true in .env.local to enable
  if (!isProduction() && process.env.ENABLE_DEV_SESSION === 'true') {
    console.log('[DEV MODE] Using mock session for local testing');
    return {
      shop_domain: 'test-fashion-store.myshopify.com',
      merchant_id: '11111111-1111-1111-1111-111111111111', // Matches test data merchant ID
    };
  }

  const sessionCookie = cookies().get(SESSION_COOKIE_NAME);

  if (!sessionCookie || !sessionCookie.value) {
    return null;
  }

  try {
    // Split session value into components
    const [encrypted, iv, authTag] = sessionCookie.value.split('.');

    if (!encrypted || !iv || !authTag) {
      return null;
    }

    // We need merchant_id to decrypt, but it's in the encrypted data
    // Use global salt for session decryption
    const decrypted = decrypt(encrypted, iv, authTag);
    const sessionData: SessionData = JSON.parse(decrypted);

    return sessionData;
  } catch (error) {
    console.error('Failed to decrypt session:', error);
    return null;
  }
}

/**
 * Destroy current session
 * Deletes the session cookie
 */
export async function destroySession(): Promise<void> {
  cookies().delete(SESSION_COOKIE_NAME);
}

/**
 * Require authentication
 * Throws error if no valid session
 * Use in API routes and server components
 *
 * @returns Session data
 * @throws Error if not authenticated
 */
export async function requireAuth(): Promise<SessionData> {
  const session = await getSession();

  if (!session) {
    throw new Error('Authentication required');
  }

  return session;
}

/**
 * Get merchant ID from session
 * Convenience method
 *
 * @returns Merchant ID or null
 */
export async function getMerchantId(): Promise<string | null> {
  const session = await getSession();
  return session?.merchant_id || null;
}

/**
 * Get shop domain from session
 * Convenience method
 *
 * @returns Shop domain or null
 */
export async function getShopDomain(): Promise<string | null> {
  const session = await getSession();
  return session?.shop_domain || null;
}

/**
 * Check if user is authenticated
 *
 * @returns True if authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
  const session = await getSession();
  return session !== null;
}

/**
 * Refresh session (extend expiry)
 * Call this on authenticated page loads
 */
export async function refreshSession(): Promise<void> {
  const session = await getSession();

  if (session) {
    // Re-create session with same data (resets expiry)
    await createSession(session.shop_domain, session.merchant_id);
  }
}
