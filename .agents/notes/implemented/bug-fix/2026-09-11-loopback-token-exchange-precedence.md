# Agent Note: Exchange the launch token before loopback index trust

Status: implemented

English | [中文](2026-09-11-loopback-token-exchange-precedence.zh.md)

## Problem

`BrowserAuth.authorizeIndex` checked `trustLoopback` before the `?token=` exchange. A `dsh web` deployment with `trustLoopback: true` therefore served index.html directly for the printed root URL on `127.0.0.1`, never minting the authority-bound cookie, while `/api` dispatch still required that cookie. Every browser window without a previously minted cookie — a fresh incognito window, a cleared profile — loaded the shell and then had every Remote call fail with `HTTP 401` (surfaced, for example, as `directory picker failed: ... transport failure for /api/directoryPicker/pick: HTTP 401`), and no URL could repair the state because the exchange path was unreachable on loopback.

## Decision

[authorizeIndex](../../../../packages/client/connection/src/browser-auth.ts) now runs the token-exchange branch first and applies loopback trust only to tokenless requests. A valid `?token=` root request mints the cookie and redirects to clean `/` regardless of `trustLoopback`; a wrong token returns 401 even on loopback, matching the non-loopback behavior and the 401 text's own instruction to reopen the printed URL; a tokenless loopback request keeps serving index.html, so the documented bare-URL convenience is unchanged. The `/api` fence stays cookie-only with no loopback tier.

## Alternatives considered

**Trust loopback `/api` requests too.** Dropping the cookie check on loopback would let any local browser context drive the agent without a session, and the documented contract keeps `/api` cookie checks unchanged. Rejected.

**Tell deployments to drop `trustLoopback: true`.** That restores minting but sacrifices the bare-URL access the flag exists for, and every deployment setting the flag inherits the trap. Rejected.

## Consequences

Under `trustLoopback: true`, a stale-token URL now returns the 401 page instead of silently opening an unauthenticated shell — the failure moves to the earliest resolvable point. Windows that already hold a valid cookie are unaffected. [browser-auth.host.spec.ts](../../../../packages/client/connection/tests/browser-auth.host.spec.ts) covers the mint under loopback trust and the stale-token 401.
