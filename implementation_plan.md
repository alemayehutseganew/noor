# Implementation Plan

## Overview

Fix the Telegram bot handler ordering bug in `backend/src/bot/index.js` where `bot.on('text')` intercepts the `/invite` command (and other commands) when a user is in a `WAITING_FOR_RECEIPT` or `WAITING_FOR_WITHDRAW_AMOUNT` state, causing "Invalid receipt format" / "Invalid amount" errors instead of executing the command. The fix moves `bot.on('text')` to be the last handler before `module.exports`, adds a strict guard clause to ignore all commands, and ensures `/invite` clears any pending user state.

## Types

No type system changes. This is a JavaScript file with no TypeScript definitions.

## Files

### `backend/src/bot/index.js` (modify only)

1. **`bot.command(['invite', 'refer'], sendInvite)`** (line 156): Wrap in an async middleware that deletes `userStates[ctx.from.id]` before invoking `sendInvite`, so an in-progress deposit/withdraw flow is aborted when the user requests their invite link.

2. **`bot.on('text', ...)`** (lines 294–371): Add a strict guard clause at the top of the handler (after language resolution, inside the `try` block) that returns immediately when `ctx.message.text` starts with `/`. Then move the entire block to the bottom of the file, placing it after `bot.on('contact')` and `bot.on('message')`, immediately before `module.exports`.

No other files are modified. Translations, database logic, and UI are untouched, per the hard constraints.

## Functions

### Modified — `bot.command(['invite', 'refer'], ...)` in `backend/src/bot/index.js`
- **Current:** `bot.command(['invite', 'refer'], sendInvite)`
- **Change:** Replace with an inline async handler that calls `delete userStates[ctx.from.id]` then `await sendInvite(ctx)`.
- **Purpose:** Ensures `/invite` clears any pending deposit/withdraw state before responding.

### Modified — `bot.on('text', ...)` in `backend/src/bot/index.js`
- **Current:** Located at lines 294–371, before `bot.on('contact')` and `bot.on('message')`. No command guard.
- **Change:** (a) Insert `const text = ctx.message.text; if (text && text.startsWith('/')) { return }` as the first statement inside the `try` block. (b) Cut the entire block and paste it after `bot.on('message')` (line 419), immediately before `module.exports` (line 421).
- **Purpose:** Commands are no longer processed by the state-machine text handler; the text handler only runs for non-command text when a user is in a waiting state.

### Removed
- None. All existing handlers are preserved; only reordered and augmented.

## Classes

None.

## Dependencies

No new packages or dependency changes. Reuses existing `Telegraf`, `db`, `parseTelebirrSMS`, `creditVerifiedDeposit`, `getT`, `userStates`.

## Testing

- **Unit-level (manual/reasoning):** Verify that `bot.on('text')` is physically the last handler block before `module.exports`. Verify the guard clause `text.startsWith('/')` returns early before any `userStates` lookup. Verify `bot.command(['invite', 'refer'], ...)` deletes `userStates[ctx.from.id]` before calling `sendInvite`.
- **Runtime:** Start the bot, set a user state to `WAITING_FOR_RECEIPT` (via `/deposit`) or `WAITING_FOR_WITHDRAW_AMOUNT` (via `/withdraw`), then send `/invite`. Expected: the invite link is returned immediately; no "Invalid receipt format" or "Invalid amount" error.
- **Regression:** Send a receipt SMS while in `WAITING_FOR_RECEIPT` and a valid amount while in `WAITING_FOR_WITHDRAW_AMOUNT` to confirm the text handler still processes legitimate non-command input.

## Implementation Order

1. Edit `backend/src/bot/index.js`: wrap `bot.command(['invite', 'refer'], ...)` to clear `userStates[ctx.from.id]` before `sendInvite`.
2. Edit `backend/src/bot/index.js`: add the `text.startsWith('/')` guard clause at the top of the `bot.on('text')` handler body.
3. Edit `backend/src/bot/index.js`: cut the full `bot.on('text')` block and paste it after `bot.on('message')`, immediately before `module.exports`.
4. Verify final file order: commands/actions → `bot.on('contact')` → `bot.on('message')` → `bot.on('text')` → `module.exports`.
5. Run syntax check (`node --check backend/src/bot/index.js`) and smoke-test the `/invite` flow while in a deposit/withdraw state.
