/**
 * In-memory SMS verification challenges: one live challenge per phone, with
 * send cooldown, expiry, and a wrong-attempt ceiling. Challenges are
 * disposable by design — a restart forgets them, and the account is the only
 * durable fact.
 * @module @deepseek-ai/dsh-web-login/src/sms
 */

import { randomInt } from 'node:crypto'

/** Send/verify policy, resolved once from the plugin config. */
export interface SmsChallengePolicy {
  /** Minimum gap between two sends for one phone, in milliseconds. */
  readonly cooldownMilliseconds: number
  /** How long one code stays verifiable, in milliseconds. */
  readonly validityMilliseconds: number
  /** Wrong verifications allowed before the challenge is destroyed. */
  readonly maxAttempts: number
}

/** One live challenge. */
interface Challenge {
  readonly code: string
  readonly expiresAt: number
  /** Earliest next send, epoch milliseconds. */
  readonly nextSendAt: number
  /** Wrong-code attempts remaining. */
  attemptsLeft: number
}

/** Result of {@link SmsChallengeStore.issue}. */
export type SmsIssue =
  | { readonly sent: true; readonly code: string }
  | { readonly sent: false; readonly cooldownSeconds: number }

/** Result of {@link SmsChallengeStore.verify}. */
export type SmsVerifyOutcome =
  | { readonly outcome: 'ok' }
  | { readonly outcome: 'no-challenge' }
  | { readonly outcome: 'expired' }
  | { readonly outcome: 'wrong'; readonly remainingAttempts: number }
  | { readonly outcome: 'exhausted' }

/** Verify outcomes that destroy the challenge. */
const TERMINAL_OUTCOMES: readonly SmsVerifyOutcome['outcome'][] = ['ok', 'expired', 'exhausted']

/** Issue and verify one SMS code per phone. */
export class SmsChallengeStore {
  private readonly challenges = new Map<string, Challenge>()

  constructor(private readonly policy: SmsChallengePolicy) {}

  /**
   * Issue a fresh code for one phone, or report the remaining cooldown. A
   * resend after cooldown replaces the code and resets attempts; an in-cooldown
   * request keeps the live challenge untouched.
   * @param phone - the requesting phone number.
   * @param now - current epoch milliseconds.
   * @returns the issued code, or the whole seconds until the next send.
   */
  issue(phone: string, now: number): SmsIssue {
    const existing = this.challenges.get(phone)
    if (existing !== undefined && now < existing.nextSendAt) {
      return { sent: false, cooldownSeconds: Math.ceil((existing.nextSendAt - now) / 1000) }
    }
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
    this.challenges.set(phone, {
      code,
      expiresAt: now + this.policy.validityMilliseconds,
      nextSendAt: now + this.policy.cooldownMilliseconds,
      attemptsLeft: this.policy.maxAttempts,
    })
    return { sent: true, code }
  }

  /**
   * Verify one code for one phone. A wrong code burns one attempt; the final
   * allowed wrong attempt destroys the challenge, so a fresh send is required.
   * @param phone - the verifying phone number.
   * @param code - the presented code, compared as an exact string.
   * @param now - current epoch milliseconds.
   * @returns the verify outcome; `expired`/`exhausted`/`ok` leave no challenge.
   */
  verify(phone: string, code: string, now: number): SmsVerifyOutcome {
    const challenge = this.challenges.get(phone)
    if (challenge === undefined) return { outcome: 'no-challenge' }
    if (now >= challenge.expiresAt) {
      this.challenges.delete(phone)
      return { outcome: 'expired' }
    }
    if (challenge.code !== code) {
      challenge.attemptsLeft -= 1
      if (challenge.attemptsLeft <= 0) {
        this.challenges.delete(phone)
        return { outcome: 'exhausted' }
      }
      return { outcome: 'wrong', remainingAttempts: challenge.attemptsLeft }
    }
    this.challenges.delete(phone)
    return { outcome: 'ok' }
  }

  /** Terminal outcomes as a test-observable predicate. */
  static isTerminal(outcome: SmsVerifyOutcome): boolean {
    return TERMINAL_OUTCOMES.includes(outcome.outcome)
  }
}
