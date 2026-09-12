# Agent Note: Phone-code login for the Web surface

Status: implemented

English | [中文](2026-09-11-web-phone-login.zh.md)

## Problem

The Web surface had no login page. Loopback browsers were admitted without an identity (`trustLoopback` relaxed the index gate), remote browsers received a plain 401, and the workbench greeting addressed the host OS account. The deployment needs phone-number registration and login with an SMS verification code, a branded login page, and a forced-login posture; WeChat scan login is deferred until a provider is available.

## Decision

Three pieces, each owning one concern:

**Forced login in the connection trust fence.** `trustLoopback` and its `ConnectionConfig` field are removed. `authorizeIndex` keeps the token exchange first — the printed `?token=` startup URL still mints the anonymous v1 session cookie and redirects to clean `/` — and sends every other unauthenticated index request a 303 to `/login`. `/api` RPC rejections stay 401; only index navigation redirects. Both cookie versions remain valid: v1 (anonymous, minted by the token exchange) and v2 (same payload plus a `subject` string naming the logged-in account), read through one decoder that checks the version.

**`@deepseek-ai/dsh-web-login` owns the login surface.** The host package serves the rendered `/login` page (left brand wall, right phone + 6-digit-code card, a WeChat placeholder marked coming soon), the auth-status route, the SMS send/verify routes, and the logout route. It reuses the composition's connection service for both directions of trust: `requestRejection` answers the Host/Origin fence (403) and passes the 401 that is this surface's caller, and a successful verification mints the session cookie through `issueSessionCookie`, so cookie serialization, signing, and lifetime stay in one place. Verification codes live in memory with cooldown, expiry, and attempt ceilings as Config; with no SMS provider wired, issuing prints the code on the server console under an explicit `[演示]` marker — raw console output, because the shipped web composition registers no logger exporter and the line is operator-facing like the `dsh web:` URL line. Accounts persist in the `web_login` storage domain keyed by phone, the masked number serving as the display name; first successful verification registers the account, so login and registration are one flow. The plugin also provides the `loginSession` Context service — the most recent login of this process life, in memory by design.

**The workbench greeting prefers the login identity.** `remoteSnapshot` resolves the greeting name at request time: the `loginSession` display name when a login exists, else the host OS account resolved at init. The workbench does not inject the web-login service; it reads it softly, because login is a surface-level row that a non-web composition never mounts.

## Alternatives considered

**Keeping loopback trust without login.** No identity reaches the greeting and remote access stays unusable; the login page would still be needed for the LAN case. Removed instead.

**Minting cookies inside web-login.** A second signer would split cookie signing and lifetime ownership away from the trust fence. Rejected; the fence owns trust end to end.

**WeChat scan login now.** It needs provider credentials and an approval flow. The page reserves the entry and the route set does not change when it arrives.

## Consequences

Every fresh browser passes the login page once per cookie lifetime; the printed startup URL continues to work unchanged. Deployments whose profile patch still sets `trustLoopback` fail loud at load — remove the line. The SMS channel is demo-grade: codes surface on the server console only, and wiring a real provider is a deployment concern. The `web_login` storage domain starts at schema version 1. Client-side session loss still surfaces as 401 on Remote calls; the shell's reconnect dialog remains the recovery path there.

## Testing

Connection tests cover the index redirect matrix (token exchange, authenticated, unauthenticated to `/login`), v1/v2 cookie round-trips, and the subject read. Web-login tests cover the page render, the trust fence pass-through, send/verify including cooldown, expiry, attempt exhaustion, and wrong-code accounting, logout, status, and storage persistence with the masked name. Workbench tests cover the greeting fallback to the host account and the preference for the login identity recorded after boot. Frontend-static tests assert the 303-to-`/login` redirect for unauthenticated index requests.
