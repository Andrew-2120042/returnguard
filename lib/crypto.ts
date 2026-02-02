/**
 * Crypto utilities for encrypting/decrypting Shopify access tokens
 * Uses AES-256-GCM with PBKDF2 key derivation and authentication tags
 *
 * ISSUE #9 FIX: Proper PBKDF2 key derivation + auth tags for security
 */

import crypto from 'crypto';
import { getEnvVar } from './utils';

// Constants
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128 bits
const AUTH_TAG_LENGTH = 16; // 128 bits
const PBKDF2_ITERATIONS = 100000; // OWASP recommendation
const PBKDF2_KEYLEN = 32; // 256 bits
const PBKDF2_DIGEST = 'sha256';

/**
 * Derive encryption key from master key using PBKDF2
 * Uses a fixed salt per merchant (or global salt)
 *
 * @param masterKey - The ENCRYPTION_KEY from env
 * @param salt - Salt for key derivation (can be merchant_id or fixed)
 * @returns Derived key (32 bytes)
 */
function deriveKey(masterKey: string, salt: string): Buffer {
  return crypto.pbkdf2Sync(
    masterKey,
    salt,
    PBKDF2_ITERATIONS,
    PBKDF2_KEYLEN,
    PBKDF2_DIGEST
  );
}

/**
 * Encrypt data using AES-256-GCM
 *
 * @param plaintext - Data to encrypt (e.g., access token)
 * @param merchantId - Used as salt for key derivation (optional)
 * @returns Object with encrypted data, IV, and auth tag
 */
export function encrypt(
  plaintext: string,
  merchantId?: string
): {
  encrypted: string;
  iv: string;
  authTag: string;
  keyVersion: number;
} {
  const masterKey = getEnvVar('ENCRYPTION_KEY');

  // Use merchant ID as salt for per-merchant keys, or fixed salt
  const salt = merchantId || 'returngaurd-fixed-salt-v1';

  // Derive key using PBKDF2
  const key = deriveKey(masterKey, salt);

  // Generate random IV
  const iv = crypto.randomBytes(IV_LENGTH);

  // Create cipher
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  // Encrypt
  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  // Get authentication tag
  const authTag = cipher.getAuthTag();

  return {
    encrypted,
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    keyVersion: 1, // For future key rotation
  };
}

/**
 * Decrypt data using AES-256-GCM
 *
 * @param encrypted - Encrypted data (base64)
 * @param iv - Initialization vector (base64)
 * @param authTag - Authentication tag (base64)
 * @param merchantId - Used as salt for key derivation (optional)
 * @returns Decrypted plaintext
 */
export function decrypt(
  encrypted: string,
  iv: string,
  authTag: string,
  merchantId?: string
): string {
  const masterKey = getEnvVar('ENCRYPTION_KEY');

  // Use same salt as encryption
  const salt = merchantId || 'returngaurd-fixed-salt-v1';

  // Derive key using PBKDF2
  const key = deriveKey(masterKey, salt);

  // Convert IV and auth tag from base64
  const ivBuffer = Buffer.from(iv, 'base64');
  const authTagBuffer = Buffer.from(authTag, 'base64');

  // Create decipher
  const decipher = crypto.createDecipheriv(ALGORITHM, key, ivBuffer);

  // Set auth tag
  decipher.setAuthTag(authTagBuffer);

  // Decrypt
  let decrypted = decipher.update(encrypted, 'base64', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Encrypt Shopify access token for storage
 *
 * @param accessToken - Shopify access token
 * @param merchantId - Merchant ID for salt
 * @returns Encrypted token data
 */
export function encryptAccessToken(
  accessToken: string,
  merchantId: string
): {
  access_token_encrypted: string;
  access_token_iv: string;
  access_token_auth_tag: string;
  encryption_key_version: number;
} {
  const { encrypted, iv, authTag, keyVersion } = encrypt(accessToken, merchantId);

  return {
    access_token_encrypted: encrypted,
    access_token_iv: iv,
    access_token_auth_tag: authTag,
    encryption_key_version: keyVersion,
  };
}

/**
 * Decrypt Shopify access token from storage
 *
 * @param encryptedToken - Encrypted token (base64)
 * @param iv - Initialization vector (base64)
 * @param authTag - Authentication tag (base64)
 * @param merchantId - Merchant ID for salt
 * @returns Decrypted access token
 */
export function decryptAccessToken(
  encryptedToken: string,
  iv: string,
  authTag: string,
  merchantId: string
): string {
  return decrypt(encryptedToken, iv, authTag, merchantId);
}

/**
 * Hash a value using SHA-256 (for non-reversible hashing)
 * Used for things like webhook verification, not encryption
 *
 * @param value - Value to hash
 * @returns Hex-encoded hash
 */
export function hash(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/**
 * Generate a secure random token
 *
 * @param length - Length in bytes (default 32)
 * @returns Hex-encoded random token
 */
export function generateToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Validate encryption key format
 * Ensures the ENCRYPTION_KEY is valid before using it
 *
 * @param key - Key to validate
 * @returns True if valid
 */
export function validateEncryptionKey(key: string): boolean {
  // Should be 64 hex characters (32 bytes)
  return /^[a-f0-9]{64}$/i.test(key);
}

/**
 * Test encryption/decryption roundtrip
 * Used for health checks
 *
 * @returns True if encryption works correctly
 */
export function testEncryption(): boolean {
  try {
    const testData = 'test-access-token-12345';
    const testMerchantId = 'test-merchant-id';

    const { encrypted, iv, authTag } = encrypt(testData, testMerchantId);
    const decrypted = decrypt(encrypted, iv, authTag, testMerchantId);

    return decrypted === testData;
  } catch (error) {
    console.error('Encryption test failed:', error);
    return false;
  }
}

/**
 * Key rotation utility (for future use)
 * Re-encrypts data with a new key version
 *
 * @param encryptedData - Old encrypted data
 * @param iv - Old IV
 * @param authTag - Old auth tag
 * @param merchantId - Merchant ID
 * @param newKeyVersion - New key version
 * @returns Re-encrypted data
 */
export function rotateKey(
  encryptedData: string,
  iv: string,
  authTag: string,
  merchantId: string,
  newKeyVersion: number
): {
  encrypted: string;
  iv: string;
  authTag: string;
  keyVersion: number;
} {
  // Decrypt with old key
  const plaintext = decrypt(encryptedData, iv, authTag, merchantId);

  // Re-encrypt with new key (would use different master key in production)
  const result = encrypt(plaintext, merchantId);

  return {
    ...result,
    keyVersion: newKeyVersion,
  };
}

/**
 * Wrapper for Phase 3 compatibility
 * Simplified interface for decrypting access tokens
 *
 * @param encryptedToken - Encrypted token string
 * @param iv - Initialization vector
 * @param authTag - Authentication tag
 * @param merchantId - Merchant ID for key derivation
 * @returns Decrypted access token
 */
export function decryptToken(
  encryptedToken: string,
  iv: string,
  authTag: string,
  merchantId: string
): string {
  return decryptAccessToken(encryptedToken, iv, authTag, merchantId);
}

// Validate encryption key on module load (fail fast if invalid)
if (process.env.ENCRYPTION_KEY) {
  const key = process.env.ENCRYPTION_KEY;
  if (!validateEncryptionKey(key)) {
    console.warn(
      'WARNING: ENCRYPTION_KEY is not in the correct format. ' +
      'Expected 64 hex characters. Generate with: ' +
      'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
}
