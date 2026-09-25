/**
 * Credential normalisation and hashing limits shared by the registration,
 * login, verification and password-reset flows (#1283, #1285).
 *
 * These live in one place because the flows must agree: a rule enforced at
 * registration but not at login is not a rule, it is a way to permanently
 * lock a user out of their own account.
 */

/**
 * bcrypt hashes at most 72 bytes of input and **silently discards the rest**.
 *
 * `bcrypt.hash('P@ssw0rd!X'.repeat(20))` and the same string truncated to 72
 * bytes produce the identical digest. Without an explicit cap, two users whose
 * passwords share a 72-byte prefix are effectively the same account as far as
 * the verifier is concerned, and a user who appends characters to a forgotten
 * password ends up "changing" nothing. Rejecting over-long input is the only
 * way to make the property hold.
 */
export const BCRYPT_MAX_PASSWORD_BYTES = 72;

/** Upper bound in characters, chosen to sit inside the 72-byte budget for UTF-8. */
export const PASSWORD_MAX_LENGTH = 72;

export const PASSWORD_MIN_LENGTH = 8;

/** True when `password` encodes to at most {@link BCRYPT_MAX_PASSWORD_BYTES} bytes. */
export function isWithinBcryptLimit(password: string): boolean {
  return Buffer.byteLength(password, 'utf8') <= BCRYPT_MAX_PASSWORD_BYTES;
}

/**
 * Canonical form of an email address for storage and lookup.
 *
 * The domain is lowercased because DNS is case-insensitive. The local part is
 * also lowercased: RFC 5321 allows it to be case-sensitive, but in practice a
 * mixed-case local part has caused duplicate accounts on providers that treat
 * it case-insensitively, and the operational cost of a duplicate account
 * outweighs the theoretical case-sensitivity.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Trims and upper-cases a country code so `ng` and `NG` cannot create two
 * different filter groups.
 */
export function normalizeCountryCode(country: string): string {
  return country.trim().toUpperCase();
}
