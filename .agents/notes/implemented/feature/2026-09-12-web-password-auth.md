# Agent Note: Password credentials for the Web login surface

Status: implemented

English | [中文](2026-09-12-web-password-auth.zh.md)

## Problem

The login surface knew one factor: every sign-in needed an SMS code, so a returning user waited on a fresh code each time and the demo console carried the whole login story. The workbench needed a standing credential — password login as the default tab, self-service registration with a password, and a forgot-password path — while the SMS flow stayed for accounts without a credential and for challenge-backed credential writes. WeChat scan had to stay visible as a placeholder without a competing backend.

## Decision

**Credentials live beside accounts in the same domain.** The `web_login` domain gains a `credentials` table (per-phone `{passwordHash, createdAt, updatedAt}`); the version stays 1 under the same add-tables-in-place reasoning as the member model. [`src/password.ts`](../../../../packages/host/web-login/src/password.ts) hashes with scrypt (N=16384, r=8, p=1, per-hash random salt) into the self-describing string `scrypt$N$r$p$saltHex$hashHex`, so parameter upgrades can coexist with old hashes, and compares with `timingSafeEqual`. The policy is one zod schema in `spec.ts` (`passwordSchema`: 8–64 chars, at least one letter and one digit) shared by registration and reset; the page mirrors it client-side before any POST.

**Three routes extend the surface; the wire contract stays in `./shared`.** `POST /auth/register` (phone + code + password) verifies a live SMS challenge before writing account and credential — login and registration are no longer one flow, and an existing phone answers 409 `phone-registered`. `POST /auth/password/login` answers 400 `no-credential` for SMS-only accounts and 400 `wrong-password` otherwise; it never distinguishes which of the two was wrong beyond these codes. `POST /auth/password/reset` refuses unknown accounts (`no-account`) before touching the challenge, so probing cannot consume another phone's verification attempts, then verifies the challenge and replaces the hash. All three record `loginSession` and mint the cookie like every other login.

**"Remember me" is a persistence split inside the connection service, not a second cookie.** `mintSessionCookie`/`issueSessionCookie` take an optional `persistenceMilliseconds`: omitted keeps the configured default lifetime (persistent cookie), `0` requests `maxAgeSeconds: 0`, which the Set-Cookie serializer renders as a browser-session cookie (no `Max-Age`/`Expires`) while the signed payload keeps its full validity. The unchecked box therefore dies with the browser; the checked one survives it. The login page sends `remember: true` → undefined, unchecked → 0.

**The page becomes four tabs plus the reset panel.** Password login (autofocus, show/hide password, remember me, forgot link), SMS-code login with the optional invite field (unchanged flow), registration (code + password + confirm + agreement checkbox, auto-login on success, optional invite redeemed afterwards), and the WeChat tab that renders "coming soon" and calls nothing. The forgot link opens the reset panel without a tab of its own; front-end validation mirrors the wire rules (phone pattern, 6-digit code, password policy, match check) and every submit button carries loading/disabled states.

## Alternatives considered

**Storing passwords in the accounts table.** Accounts are profile facts (`displayName`, timestamps); not every account has a credential, and mixing an optional secret into every account record forces `passwordHash?` on all readers. A separate table keeps the optionality at the table level.

**bcrypt/argon2.** Both need a dependency for a flow with no cross-deployment hash-compatibility requirement; node's built-in scrypt with encoded parameters deletes the dependency and keeps the upgrade path.

**JWT or a separate "remember-me token".** The session cookie already carries the subject and lifetime; a second token would create a second trust path. The persistence argument reuses the minted cookie's signing and clearing.

**Hiding the WeChat tab until it ships.** The tab advertises the roadmap and keeps the layout stable; hiding it would change card height per tab. It renders the placeholder panel and performs no request.

## Consequences

Accounts registered before this change (SMS-only) keep working unchanged; their first password arrives through reset or registration-path upgrade via reset. `no-credential` on password login names the SMS-only case so the page can suggest the code tab. The reset route's `no-account` refusal before the challenge check means an attacker cannot distinguish "unregistered" from "wrong code" cheaply, but does learn registration status — accepted, matching the register route's 409. The demo SMS channel remains the challenge carrier for registration and reset, so those flows still print codes server-side; only everyday sign-in stops depending on the console.

## Testing

Web-login tests cover the register wire/policy rejections (weak, missing-digit, missing-letter, over-long passwords; no write on refusal), the 409 duplicate-phone path, the live-challenge requirement, credential persistence in the domain file with a `scrypt$` hash, password-login wire validation, `no-credential`/`wrong-password` with no identity recorded, the remember persistence split asserted on both the stubbed issuer arguments and the rendered Set-Cookie header (no `Max-Age` for the session cookie), and the reset lifecycle (unknown account, policy before challenge, rotation with old password failing and new passing). Connection tests cover the persistence override (`0` → session semantics, explicit lifetime, default fallback). Page tests assert the four tabs, the reset entry points, and the new form ids.
