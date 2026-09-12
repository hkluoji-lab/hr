/**
 * The `loginSession` Context service: the identity of the most recent login
 * this process life. In-memory by design — the durable account lives in the
 * `web-login` storage domain; this service answers "who just logged in" for
 * host surfaces such as the workbench greeting without a domain read.
 * @module @deepseek-ai/dsh-web-login/src/session
 */

/** Identity recorded by one successful verification. */
export interface LoginIdentity {
  /** The account phone number (the cookie subject). */
  readonly phone: string
  /** The masked display name shown in UI. */
  readonly displayName: string
}

/** Most-recent-login holder provided as `ctx.loginSession`. */
export class LoginSession {
  private identity: LoginIdentity | undefined

  /**
   * Record one successful login, replacing any previous identity.
   * @param identity - the phone and masked display name of the login.
   */
  record(identity: LoginIdentity): void {
    this.identity = identity
  }

  /**
   * The display name of the most recent login this process life.
   * @returns the display name, or undefined before the first login.
   */
  displayName(): string | undefined {
    return this.identity?.displayName
  }

  /**
   * The phone of the most recent login this process life.
   * @returns the phone, or undefined before the first login.
   */
  phone(): string | undefined {
    return this.identity?.phone
  }
}
