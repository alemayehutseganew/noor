# Implementation Plan

## Overview

Allow a player who has already joined a room to change their selected bingo card at any point before the game starts (during WAITING and COUNTDOWN). The change is performed by reusing the existing card-selection screen in "change mode" (passed via `roomId` query param), which calls a dedicated `POST /rooms/:id/select-cards` endpoint that replaces the user's card selection in `room_card_selections` without touching `room_participants` (no duplicate participants). The countdown timer and room state remain untouched. When the player returns to the Game Screen, the socket `join_room` flow re-fetches their updated card via the existing `my_cards` event.

## Types

No new types or interfaces. Existing data shapes reused:
- `room_card_selections` row: `{ room_id, card_id, user_id, card (JSON matrix), status }`
- Card object returned to frontend: `{ id, matrix }`
- `GameScreen` query params: `roomId`, `stake`, `spectator`

## Files

- `backend/src/routes/rooms.js` — modify `POST /:id/select-cards` route.
- `backend/src/sockets/gameHandler.js` — modify `join_room` handler to allow an existing participant to rejoin during `COUNTDOWN` (not forced into spectator mode), so a returning player keeps their updated card.
- `frontend/src/pages/GameScreen.jsx` — add "Change Card" button shown while `!gameStarted`; navigate to `/select-cards?roomId=...&stake=...`.
- `frontend/src/pages/CardSelection.jsx` — read `roomId` from query params; branch between change mode (select-cards) and join mode (join); update title; navigate back to game on success.
- `frontend/src/i18n.js` — add `changeCard` / `changeYourCard` keys (en + am) for the new button/title.

## Functions

### Backend — `backend/src/routes/rooms.js`
- Modify `router.post('/:id/select-cards', ...)`:
  - Accept single-card input (`cardId` or `card_number`) in addition to `cardIds[]`.
  - Validate card numbers (1–400) and reject cards already taken by *other* users.
  - Delete only the current user's existing selections for the room, then insert the new one (no participant insert/update → no duplicates).
  - Generate the matrix with `generateCardFromNumber(cardId)` (not random `generateSingleCard()`), so the stored card matches its id.
  - Restrict to `WAITING`/`COUNTDOWN` room status.
  - Return `{ success, count, cards: [{ id, matrix }], roomId, stake }`.
  - Wrap delete+insert in a transaction with the same advisory lock used by `/join` to avoid races.

### Backend — `backend/src/sockets/gameHandler.js`
- Modify `socket.on('join_room', ...)`:
  - Compute `isExistingParticipant`.
  - Do not emit `game_in_progress` / force spectator when an existing participant rejoins during `COUNTDOWN` (allow them through so `my_cards` is re-emitted with the updated card).
  - Keep spectator behavior for `PLAYING`/`CLAIMING`/`ENDED` and for non-participants.

### Frontend — `frontend/src/pages/GameScreen.jsx`
- Add `handleChangeCard` → `navigate(`/select-cards?roomId=${roomId}&stake=${stake}`)`.
- Render a small outlined "Change Card" button while `!gameStarted && !isSpectator`, in the countdown overlay and/or below the card.
- Keep all existing socket logic; on remount the existing `join_room` → `my_cards` flow syncs the new card (Phase 4).

### Frontend — `frontend/src/pages/CardSelection.jsx`
- Read `roomId = searchParams.get('roomId')`.
- Title: `changeYourCard` when `roomId` present, else `selectCard`.
- `handleCardSelect`: if `roomId`, call `POST /rooms/${roomId}/select-cards` with `{ cardId: cardNumber }`; else existing `/rooms/join` flow.
- On success in change mode: `navigate(`/game?roomId=${roomId}&stake=${stake}`)`.
- Keep taken-card fetching and error handling.

### Frontend — `frontend/src/i18n.js`
- Add `changeCard` and `changeYourCard` (en + am).

## Classes

None.

## Dependencies

No new packages. Reuses existing `generateCardFromNumber`, `userAuth`, `fetchApi`, `useSearchParams`, `useNavigate`.

## Testing

- Backend: verify `select-cards` updates (not duplicates) the user's `room_card_selections`; returns updated card details; rejects taken cards and out-of-range ids; rejects when game in progress; does not alter `room_participants` or room status/countdown.
- Frontend manual: countdown shows Change Card; clicking navigates to selection with roomId; selecting a card calls select-cards (not join) and returns to game; new card displayed; button gone after game starts.
- Socket: returning player during countdown receives `my_cards` with the new card and is not put in spectator mode.

## Implementation Order

1. Backend `rooms.js` — fix `select-cards` (single-card support, correct matrix generation, transaction + lock, return card details).
2. Backend `gameHandler.js` — adjust `join_room` to allow existing participants during COUNTDOWN.
3. Frontend `CardSelection.jsx` — add roomId/change-mode branch.
4. Frontend `GameScreen.jsx` — add Change Card button + navigation.
5. Frontend `i18n.js` — add keys.
6. Verify syntax/build and manual smoke test.
