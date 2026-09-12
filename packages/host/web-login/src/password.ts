/**
 * Password hashing with node:crypto scrypt. The stored hash is
 * self-describing (`scrypt$N$r$p$saltHex$hashHex`), so parameter changes do
 * not require a storage migration: old hashes keep verifying under their
 * recorded parameters.
 * @module @deepseek-ai/dsh-web-login/src/password
 */

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

/** scrypt cost parameters, fixed at the security-review defaults. */
const SCRYPT_N = 16_384
const SCRYPT_R = 8
const SCRYPT_P = 1

/** Derived key length in bytes; every hash stores exactly this many. */
const KEY_LENGTH = 32

/** Salt length in bytes. */
const SALT_LENGTH = 16

/**
 * Hash one password into the self-describing stored form.
 * @param password - the plaintext password (policy-validated by the caller).
 * @returns the `scrypt$N$r$p$saltHex$hashHex` string to store.
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_LENGTH)
  const hash = scryptSync(password, salt, KEY_LENGTH, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P })
  return `scrypt$${String(SCRYPT_N)}$${String(SCRYPT_R)}$${String(SCRYPT_P)}$${salt.toString('hex')}$${hash.toString('hex')}`
}

/**
 * Verify one password against a stored hash.
 * @param password - the presented plaintext password.
 * @param stored - the stored self-describing hash from {@link hashPassword}.
 * @returns true only when the password matches; a malformed stored hash
 *   verifies as false rather than throwing.
 */
export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  const [, n, r, p, saltHex, hashHex] = parts as [string, string, string, string, string, string]
  const salt = Buffer.from(saltHex, 'hex')
  const expected = Buffer.from(hashHex, 'hex')
  if (salt.length !== saltHex.length / 2 || expected.length !== KEY_LENGTH) return false
  const actual = scryptSync(password, salt, KEY_LENGTH, {
    N: Number(n), r: Number(r), p: Number(p),
  })
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
