# Agent Note: Keep the members nav owner gate behind the declared hooks

Status: implemented

English | [中文](2026-09-12-members-nav-owner-gate-hook-order.zh.md)

## Problem

`WorkbenchNavAction` early-returned `null` for the `members` target when `!my.isOwner` — placed **before** the component's two `useState` declarations. The gate value starts `false` (`MY_VISITOR`) and flips to `true` once the `/auth/status` read resolves. On that flip the same mounted instance re-rendered through the gate and declared two extra hooks, so React threw error #310 ("Rendered more hooks than during the previous render") and the `sidebar.nav` slot entry crashed. The result hid every workbench nav row — including the owner's own members row — even though the bundle, the auth status, and the page itself were all correct. Non-owner sessions never flip the flag, which is why the crash only surfaced for the deployment owner.

## Decision

The owner gate moved below the hook declarations in [WorkbenchNavAction.tsx](../../../../packages/client/ui-workbench/src/client/WorkbenchNavAction.tsx), so every render of the component declares the same hook sequence regardless of `my.isOwner`. A [regression test](../../../../packages/client/ui-workbench/tests/nav-action.client.spec.tsx) re-renders one mounted `members` row across the `isOwner` flip and asserts the row appears without a hook-order error.

## Alternatives considered

**Gate inside the JSX (`{isOwner && row}`).** Keeps the hook order intact but leaves the conditional scattered across the two return paths the component already has (rail and wide). Rejected: the single early return is clearer and now provably safe.

**Wrap the slot entry in an error boundary.** Would mask the bug instead of fixing the hook order, and the crashed row would still disappear. Rejected.

## Consequences

The members row now appears for the owner as soon as the auth status reports ownership, and the sidebar's other rows render alongside it. Any future conditional hook in this component must stay behind all early returns or the same class of crash returns.
