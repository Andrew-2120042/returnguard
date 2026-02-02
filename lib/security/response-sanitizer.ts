/**
 * Response Sanitizer
 * Phase 3: Prevents sensitive data from being sent to clients
 *
 * CRITICAL: All API responses must be sanitized before sending to client
 */

const SENSITIVE_KEYS = [
  'access_token',
  'shopify_access_token',
  'api_key',
  'api_secret',
  'password',
  'encryption_key',
  'shopify_api_key',
  'shopify_api_secret',
  'session_secret',
  'salt_secret_key',
  'access_token_encrypted',
  'access_token_iv',
  'access_token_auth_tag',
  'webhook_secret',
  'private_key',
  'secret_key',
  'client_secret',
  'bearer',
  'authorization'
];

/**
 * Sanitize an object by replacing sensitive keys with [REDACTED]
 * Recursively processes nested objects and arrays
 *
 * @param data - Data to sanitize
 * @returns Sanitized data
 */
export function sanitizeResponse(data: any): any {
  if (data === null || data === undefined) {
    return data;
  }

  // Handle arrays
  if (Array.isArray(data)) {
    return data.map((item) => sanitizeResponse(item));
  }

  // Handle objects
  if (typeof data === 'object') {
    const sanitized: any = {};

    for (const key in data) {
      // Check if key is sensitive
      const isSensitive = SENSITIVE_KEYS.some((sensitiveKey) =>
        key.toLowerCase().includes(sensitiveKey.toLowerCase())
      );

      if (isSensitive) {
        // Replace with [REDACTED]
        sanitized[key] = '[REDACTED]';

        // Log security warning
        console.warn(`🔒 Sanitized sensitive field: ${key}`);
      } else {
        // Recursively sanitize nested objects
        sanitized[key] = sanitizeResponse(data[key]);
      }
    }

    return sanitized;
  }

  // Return primitive values as-is
  return data;
}

/**
 * Sanitize multiple responses at once
 *
 * @param responses - Array of responses to sanitize
 * @returns Array of sanitized responses
 */
export function sanitizeMultipleResponses(responses: any[]): any[] {
  return responses.map((response) => sanitizeResponse(response));
}

/**
 * Check if data contains any sensitive information
 * Returns true if sensitive data is found (meaning it should NOT be sent)
 *
 * @param data - Data to check
 * @returns True if sensitive data found
 */
export function containsSensitiveData(data: any): boolean {
  if (!data || typeof data !== 'object') {
    return false;
  }

  const dataStr = JSON.stringify(data).toLowerCase();

  for (const key of SENSITIVE_KEYS) {
    if (dataStr.includes(key.toLowerCase())) {
      return true;
    }
  }

  return false;
}

/**
 * Validate that a response is safe to send to the client
 * Throws an error if sensitive data is detected
 *
 * @param data - Data to validate
 * @throws Error if sensitive data is found
 */
export function assertSafeResponse(data: any): void {
  if (containsSensitiveData(data)) {
    console.error('🚨 SECURITY ALERT: Attempted to expose sensitive data in API response');
    throw new Error('Response contains sensitive data and cannot be sent');
  }
}

/**
 * Sanitize and prepare data for API response
 * Use this as the final step before returning data to the client
 *
 * @param data - Data to prepare
 * @param checkOnly - If true, only checks without sanitizing (throws on sensitive data)
 * @returns Sanitized data
 */
export function prepareApiResponse(data: any, checkOnly: boolean = false): any {
  if (checkOnly) {
    assertSafeResponse(data);
    return data;
  }

  return sanitizeResponse(data);
}
