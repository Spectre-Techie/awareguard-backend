// awareguard-backend/utils/tokenUtils.js
import crypto from 'crypto';

/**
 * Generate a secure random token for password reset
 * @returns {string} Hex-encoded random token
 */
export function generateResetToken() {
    return crypto.randomBytes(32).toString('hex');
}

/**
 * Hash a token for secure storage
 * @param {string} token - Plain token to hash
 * @returns {string} Hashed token
 */
export function hashToken(token) {
    return crypto
        .createHash('sha256')
        .update(token)
        .digest('hex');
}

/**
 * Generate reset token and its hash
 * @returns {Object} { token, hashedToken, expires }
 */
export function createPasswordResetToken() {
    const token = generateResetToken();
    const hashedToken = hashToken(token);
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

    return {
        token,           // Send this to user via email
        hashedToken,     // Store this in database
        expires          // Token expiration time
    };
}
