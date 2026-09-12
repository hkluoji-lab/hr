# Agent Note: Phone and password registration without an SMS code

Status: implemented

English | [中文](2026-09-12-web-registration-without-sms.zh.md)

## Problem

`POST /auth/register` demanded a live SMS challenge beside the password, so a deployment with no SMS provider could not create an account at all: the only working path to a standing credential was SMS login followed by password reset. The Web login surface needed a registration that stands on a phone number and a password alone, while deployments that do run an SMS channel keep the challenge on the same route.

## Decision

**The demand is a Config field, not a second route.** `requireRegistrationCode` (default `false`) decides whether `POST /auth/register` asks for `code`; the same route serves both policies. `readRegisterFields` reads `['phone', 'password']` or `['phone', 'code', 'password']` accordingly and returns `[phone, code | undefined, validPassword]`, so the handler verifies a challenge only when a code arrived: `if (code !== undefined && !verifyChallenge(res, phone, code)) return`. A code sent while the deployment does not demand one is ignored, not rejected — an extra field must not decide the policy.

**The page renders what the deployment demands.** `renderLoginPage({ requireRegistrationCode })` omits the `#reg-code` label, input, and send button when the demand is off, prints a hint that no SMS code is needed, and serializes the same fact into the page script as `var REG_CODE`. The submit path then validates and posts `code` only under that flag, and `bindSend` is skipped for the absent button rather than guarded inside. The field's absence is the honest rendering: a disabled input would still promise a code that no route issues.

**`RegisterPayload.code` becomes optional.** The wire type states the conditional requirement in one place, next to the route constant whose doc now reads "phone and password (plus an SMS code when the deployment demands one)". Password reset keeps its own reader (`readCredentialFields`) and always demands a challenge, because a credential write onto an existing account has no other proof of ownership.

## Alternatives considered

**Requiring a challenge whenever a code is present.** That would let the client choose the policy; the deployment owns it, so the server reads only the fields the policy names.

**Dropping the SMS demand entirely.** A deployment that later wires a provider would have no route to turn on; the Config field keeps that door open with no second implementation.

**A separate password-only route.** Two routes for one account-creation decision would duplicate the duplicate-phone 409, the credential write, and the cookie minting, and would leave clients choosing between them.

## Consequences

The shipped Web composition registers accounts with no SMS provider, so the demo console is no longer on the critical path for a new account. Deployments that set `requireRegistrationCode: true` keep the previous behavior, including the `no-challenge`/`bad-code` answers, and the page then renders the code field with its send button. Registration remains open to any phone that matches `^1\d{10}$`: with the challenge off, nothing proves the caller owns the number, and the account is only ever reachable through the credential it just set.

## Testing

Web-login tests cover the default path (register from a phone and a password, `HttpOnly` cookie, `passwordHash`/`scrypt$` in the domain file, immediate password login), the configured path (`bad-request` without a code field, `no-challenge` for a code with no live challenge, success with a code from the demo console), the wire/policy refusals before any write, the duplicate-phone 409, and the page rendering both ways (`#reg-code`/`#reg-send` absent with `var REG_CODE = false` and present with `true`).
