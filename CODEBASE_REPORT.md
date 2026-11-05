# Codebase Report: Noor / GOBINGO

## 1. Executive Summary

Noor/GOBINGO is a Telegram Mini App built from a JavaScript React/Vite frontend and a Node.js/Express backend using PostgreSQL through Knex. The backend combines Telegram WebApp HMAC login, JWTs, Telegraf bot commands, Socket.IO game rooms, and a manual Telebirr receipt-verification flow. Database migrations run at server startup. The core game loop, card validation, and wallet ledger are implemented, but the code is not ready to handle real-money traffic safely: most user APIs trust caller-supplied user IDs rather than JWT identity, Socket.IO accepts unauthenticated connections, payment initiation/webhook routes call missing service functions, and a migration resets all wallet balances. The frontend lint command completes with warnings; its production build could not be verified because the installed Rolldown native binding is invalid. The backend test script is a placeholder.

## 2. Tech Stack & Architecture Diagram

**Stack**

- Backend: Node.js, CommonJS, Express 5, Knex 3, PostgreSQL (`pg`), Telegraf 4, Socket.IO 4, `jsonwebtoken`, and `bcryptjs`. See [backend/package.json](backend/package.json#L1-L26), [backend/knexfile.js](backend/knexfile.js#L1-L39).
- Frontend: JavaScript/JSX, React 19, React Router 7, Vite 8, Tailwind CSS 4, i18next, and `socket.io-client`. See [frontend/package.json](frontend/package.json#L1-L29) and [frontend/vite.config.js](frontend/vite.config.js#L1-L8).
- Persistence: PostgreSQL with raw Knex query-builder operations and migrations; no separate ORM/model layer.
- Authentication: Telegram WebApp `initData` HMAC verification issues a seven-day JWT; admin login issues a 24-hour JWT. See [backend/src/routes/auth.js](backend/src/routes/auth.js#L11-L85) and [backend/src/routes/admin.js](backend/src/routes/admin.js#L62-L72).
- Realtime: Socket.IO handles game events and wallet notifications. Game state and timers are held in process memory; Redis adapter setup is optional. See [backend/src/sockets/gameHandler.js](backend/src/sockets/gameHandler.js#L56-L92), [backend/src/sockets/gameHandler.js](backend/src/sockets/gameHandler.js#L257-L303), and [backend/src/server.js](backend/src/server.js#L109-L126).

```text
Telegram WebApp / Bot
       | initData / Telegram Bot API
       v
React + Vite frontend -- REST (VITE_API_URL) --> Express API
       | Socket.IO (VITE_SOCKET_URL)                    |
       v                                                +--> Knex --> PostgreSQL
  Game / wallet events                                  |
                                                        +--> links.et receipt verification
                                                        +--> Telebirr/CBE routes (incomplete)
```

The production backend entry point is [backend/src/server.js](backend/src/server.js#L1-L3), configured as `main` and the `start` target in the backend package manifest. [backend/index.js](backend/index.js#L1-L46) is a second, older server entry with different middleware and route mounts; the standalone `test-auth.js` imports that older entry instead of the production one.

## 3. Repository Structure

Annotated tree (application files; dependency trees and generated/binary assets omitted):

```text
.
├── README.md                         # brief local setup instructions
├── .gitignore                        # ignores .env files, node_modules, dist
├── backend/
│   ├── package.json / package-lock.json
│   ├── .env.example                  # backend configuration template
│   ├── src/
│   │   ├── server.js                 # active Express/Socket.IO bootstrap
│   │   ├── db.js, dbUrl.js           # Knex/PostgreSQL connection
│   │   ├── routes/                   # auth, rooms, payments, wallet, users, admin
│   │   ├── sockets/gameHandler.js    # room lifecycle, draws, claims, payouts
│   │   ├── bot/index.js              # Telegraf commands and receipt flow
│   │   ├── services/paymentService.js
│   │   └── utils/                    # cards, bingo validation, SMS parsing
│   ├── migrations/                   # 001–012 schema and data changes
│   ├── scripts/                      # data archival and admin seeding
│   ├── middleware/auth.js            # legacy/user JWT middleware
│   ├── index.js                      # legacy alternate server
│   └── test-auth.js                  # standalone auth smoke-test script
└── frontend/
    ├── package.json / package-lock.json
    ├── .env.example                  # Vite API/socket URL placeholders
    ├── vite.config.js                # React and Tailwind Vite plugins
    └── src/
        ├── App.jsx, main.jsx         # router, Telegram init, app mount
        ├── pages/                    # lobby, card selection, game, wallet, history, etc.
        ├── admin/                    # admin pages
        ├── services/                 # fetch wrapper and Socket.IO client
        ├── WalletContext.jsx         # wallet state
        ├── LanguageContext.jsx, i18n.js
        └── utils/                    # game sounds
```

The project has no TypeScript configuration, Docker/Compose file, or CI workflow in the inspected repository. No service worker or PWA manifest is present. Package lockfiles are present for both packages. The root [README.md](README.md#L1-L20) documents basic npm startup commands; its `BOT_TOKEN` example does not match the backend's `TELEGRAM_BOT_TOKEN` name.

## 4. Backend Analysis

### Entry points & lifecycle

[backend/src/server.js](backend/src/server.js#L37-L96) configures Express, CORS, JSON parsing, the health check, API mounts, 404 handling, and a final error handler. It attaches Socket.IO and optionally attempts to configure a Redis adapter. On startup it runs `db.migrate.latest()` and then listens on the configured port and launches the Telegram bot; migration errors are logged but do not prevent the server from starting ([backend/src/server.js](backend/src/server.js#L109-L150)). The health endpoint is `GET /health`.

The CORS policy allows configured local/production origins, any `*.vercel.app` origin, and requests without an `Origin` header ([backend/src/server.js](backend/src/server.js#L44-L65)). Routes do not share a global JWT guard; authorization is applied individually, mainly on admin endpoints.

### API endpoint table

All paths below are mounted under `/api` unless noted. “No auth” means the route itself has no authentication middleware; it does not mean that no input is required.

| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/health` | Health/status timestamp | None |
| POST | `/auth/login` | Verify Telegram init data, create/find user, issue JWT | Telegram HMAC payload |
| GET | `/auth/me` | Return current JWT user | User JWT |
| GET | `/rooms` | List waiting rooms | None |
| GET | `/rooms/active-cards?stake=` | List reserved cards for active rooms | None |
| POST | `/rooms/join` | Join/create a room and reserve a selected card | None; body user ID |
| GET | `/rooms/:roomId/cards?userId=` | Generate a room's card choices | None; body/query user ID |
| POST | `/rooms/:id/cards/:cardId` | Save a card selection | None; body user ID |
| POST | `/rooms/:id/select-cards` | Replace participant card selections | None; body user ID |
| GET | `/rooms/:id/my-cards?userId=` | Return participant's saved cards | None; query user ID |
| POST | `/payments/initiate` | Initiate Telebirr or CBE payment | None; body user ID |
| POST | `/payments/cbe/initiate` | Initiate CBE payment | None; body user ID |
| POST | `/payments/telebirr/webhook` | Handle Telebirr callback | None |
| POST | `/payments/cbe/webhook` | Handle CBE callback | None |
| GET | `/wallet/balance?userId=` | Read a user's balance | None; query user ID |
| POST | `/wallet/deposit` | Verify receipt and credit deposit | None; body user ID |
| POST | `/wallet/withdraw` | Submit withdrawal and debit balance | None; body user ID |
| GET | `/users/history?userId=` | Return recent room participation | None; query user ID |
| GET | `/users/leaderboard` | Return top balances | None |
| POST | `/admin/seed` | Provision the fixed admin account | Seed-token header |
| POST | `/admin/login` | Admin password login | None |
| GET | `/admin/stats` | Admin dashboard totals | Admin JWT |
| GET | `/admin/users` | Paginated user listing | Admin JWT |
| POST | `/admin/users/:id/adjust-balance` | Adjust wallet balance | Admin JWT |
| GET | `/admin/games` | List games and winners | Admin JWT |
| GET | `/admin/payments` | List payments | Admin JWT |
| POST | `/admin/payments/:id/approve` | Approve pending payment | Admin JWT |
| POST | `/admin/payments/:id/reject` | Reject pending payment/refund withdrawal | Admin JWT |
| POST | `/admin/reset-balances` | Reset all user balances | Admin JWT |
| POST | `/admin/archive-data` | Archive old records | Admin JWT; handler currently errors |

Route definitions and mounting: [backend/src/server.js](backend/src/server.js#L71-L82), [backend/src/routes/auth.js](backend/src/routes/auth.js#L37-L85), [backend/src/routes/rooms.js](backend/src/routes/rooms.js#L8-L324), [backend/src/routes/payments.js](backend/src/routes/payments.js#L1-L62), [backend/src/routes/wallet.js](backend/src/routes/wallet.js#L6-L66), [backend/src/routes/users.js](backend/src/routes/users.js#L5-L38), and [backend/src/routes/admin.js](backend/src/routes/admin.js#L20-L398).

### Database models & schema

The schema is migration-defined rather than represented by model classes. The current schema includes:

- `users`: Telegram ID, username/name, wallet balance, language, phone number, timestamps.
- `game_rooms`: stake, status, called-number JSON, winning pattern, timestamps. Migration 001 initially creates `rooms`, then 003 renames it to `game_rooms`.
- `room_participants`: room/user foreign keys, winner flag, joined timestamp.
- `room_card_selections`: room/user foreign keys, card ID/matrix/status; migration 004 renames the original card columns.
- `payments`: user, type/provider, amount/status, unique transaction reference, provider response.
- `admins`: unique username and password hash.
- `financial_ledger`: optional-linked user, transaction type/amount/reference/timestamps.

Schema and relationships are defined in [backend/migrations/001_initial_schema.js](backend/migrations/001_initial_schema.js#L1-L43), [backend/migrations/002_room_card_selections.js](backend/migrations/002_room_card_selections.js#L1-L14), [backend/migrations/003_rename_rooms_to_game_rooms.js](backend/migrations/003_rename_rooms_to_game_rooms.js#L1-L16), [backend/migrations/004_rename_card_columns.js](backend/migrations/004_rename_card_columns.js#L1-L15), [backend/migrations/005_add_language_to_users.js](backend/migrations/005_add_language_to_users.js#L1-L17), [backend/migrations/006_create_payments_table.js](backend/migrations/006_create_payments_table.js#L1-L19), [backend/migrations/007_create_admins_table.js](backend/migrations/007_create_admins_table.js#L1-L14), [backend/migrations/008_create_financial_ledger.js](backend/migrations/008_create_financial_ledger.js#L1-L16), and [backend/migrations/012_add_phone_number_to_users.js](backend/migrations/012_add_phone_number_to_users.js#L1-L15).

### Game logic modules (Bingo, rooms, cards)

- `POST /rooms/join` accepts a caller-supplied user ID, locks room selection by stake, reuses/creates a waiting room (up to 10 participants), and assigns the selected card. The room join flow uses PostgreSQL advisory and row locks ([backend/src/routes/rooms.js](backend/src/routes/rooms.js#L40-L185)).
- Card matrices are 5×5, use the standard B/I/N/G/O column ranges, and have a free center. The selected-card generator is deterministic by card number; the general generator is random ([backend/src/utils/cardGenerator.js](backend/src/utils/cardGenerator.js#L1-L58)).
- Socket.IO starts a 30-second countdown when at least two connected participants are ready; it charges eligible players the stake and records entry fees, then draws a unique number every three seconds ([backend/src/sockets/gameHandler.js](backend/src/sockets/gameHandler.js#L97-L196), [backend/src/sockets/gameHandler.js](backend/src/sockets/gameHandler.js#L257-L303)).
- Bingo claims are checked against the server's called numbers and stored card, not the client-sent marked-number list; supported patterns are rows, columns, both diagonals, and four corners ([backend/src/sockets/gameHandler.js](backend/src/sockets/gameHandler.js#L494-L558), [backend/src/utils/bingoValidator.js](backend/src/utils/bingoValidator.js#L1-L38)).
- Valid claims enter a three-second tie window. The winner pool is split after a 15% platform fee, credited to winners, and recorded in the ledger; rooms reset after five seconds ([backend/src/sockets/gameHandler.js](backend/src/sockets/gameHandler.js#L563-L625), [backend/src/sockets/gameHandler.js](backend/src/sockets/gameHandler.js#L56-L95)).
- Runtime room objects, draw timers, and called numbers live in memory. Draws are emitted but not written back to `game_rooms.called_numbers`, while reconnect handling reads the persisted value ([backend/src/sockets/gameHandler.js](backend/src/sockets/gameHandler.js#L257-L290), [backend/src/sockets/gameHandler.js](backend/src/sockets/gameHandler.js#L339-L382)).

### Telegram bot & Telebirr integration

The Telegraf bot provides `/start`, `/play`, `/balance`, `/deposit`, `/withdraw`, `/help`, and registration/contact flows. It launches after the HTTP server starts and uses Telegram polling ([backend/src/bot/index.js](backend/src/bot/index.js#L1-L10), [backend/src/bot/index.js](backend/src/bot/index.js#L90-L140), [backend/src/bot/index.js](backend/src/bot/index.js#L178-L224), [backend/src/bot/index.js](backend/src/bot/index.js#L267-L310)).

Receipt verification calls `https://links.et/api/verify` using `LINKS_ET_API_KEY`, checks the returned receipt/source/status/amount, and `processDeposit` credits the wallet in a database transaction ([backend/src/services/paymentService.js](backend/src/services/paymentService.js#L33-L107), [backend/src/services/paymentService.js](backend/src/services/paymentService.js#L109-L148)). The Mini App's manual deposit route invokes this direct-credit flow. By contrast, the bot receipt flow inserts a pending payment for later admin approval ([backend/src/routes/wallet.js](backend/src/routes/wallet.js#L22-L34), [backend/src/bot/index.js](backend/src/bot/index.js#L178-L224), [backend/src/routes/admin.js](backend/src/routes/admin.js#L247-L317)).

The separate payment routes import and call `initiateTelebirrPayment`, `initiateCBEBirrPayment`, `handleTelebirrWebhook`, and `handleCBEWebhook`, but none are exported by `paymentService.js`. Consequently, those routes cannot perform the advertised initiation/callback work and will fail when invoked ([backend/src/routes/payments.js](backend/src/routes/payments.js#L1-L7), [backend/src/routes/payments.js](backend/src/routes/payments.js#L10-L58), [backend/src/services/paymentService.js](backend/src/services/paymentService.js#L148)). No provider callback-signature verification is implemented in the visible route/service code.

## 5. Frontend Analysis

### Framework & routing

The app mounts React under `StrictMode` and uses `BrowserRouter`. Routes include lobby, card selection aliases, game, wallet, settings, history, leaderboard, and admin pages ([frontend/src/main.jsx](frontend/src/main.jsx#L1-L11), [frontend/src/App.jsx](frontend/src/App.jsx#L49-L78)). The admin route's frontend guard checks only for a local-storage token; actual authorization is server-side.

### Key components & screens

- **Lobby:** stake options, wallet balance, language switch, help/menu, links to wallet and card-selection flows ([frontend/src/pages/Lobby.jsx](frontend/src/pages/Lobby.jsx#L29-L55), [frontend/src/pages/Lobby.jsx](frontend/src/pages/Lobby.jsx#L70-L150)).
- **Card selection:** fetches active-card reservations and submits a single chosen card to `/rooms/join` ([frontend/src/pages/CardSelection.jsx](frontend/src/pages/CardSelection.jsx#L7-L60)).
- **Game room/card:** `GameScreen` subscribes to game and spectator events, displays called numbers/cards, and emits `claim_bingo` ([frontend/src/pages/GameScreen.jsx](frontend/src/pages/GameScreen.jsx#L25-L55), [frontend/src/pages/GameScreen.jsx](frontend/src/pages/GameScreen.jsx#L58-L200)). `Game.jsx` is a placeholder and is not the routed game screen.
- **Wallet/payment:** displays balance, manual Telebirr deposit-reference entry, and withdrawal form ([frontend/src/pages/Wallet.jsx](frontend/src/pages/Wallet.jsx#L12-L103), [frontend/src/pages/Wallet.jsx](frontend/src/pages/Wallet.jsx#L119-L200)).
- **History and leaderboard:** call the user history and public leaderboard endpoints ([frontend/src/pages/GameHistory.jsx](frontend/src/pages/GameHistory.jsx#L5-L18), [frontend/src/pages/Leaderboard.jsx](frontend/src/pages/Leaderboard.jsx#L5-L18)).
- **Admin:** dashboard, user, game, and payment screens are under `src/admin/`.

The lobby's Amharic instructions mention selecting up to two cards, but the active card-selection screen sends one card through `/rooms/join`; the multi-card backend endpoint is not wired to that screen ([frontend/src/pages/Lobby.jsx](frontend/src/pages/Lobby.jsx#L12-L24), [frontend/src/pages/CardSelection.jsx](frontend/src/pages/CardSelection.jsx#L32-L60)).

### State management & API layer

There is no Redux/Zustand store. `WalletContext` manages wallet balance and listens for `wallet_updated`; `LanguageContext` manages the language, with i18next resources in `i18n.js` ([frontend/src/WalletContext.jsx](frontend/src/WalletContext.jsx#L1-L75), [frontend/src/LanguageContext.jsx](frontend/src/LanguageContext.jsx#L1-L36), [frontend/src/i18n.js](frontend/src/i18n.js#L1-L38)).

`fetchApi` is a thin fetch wrapper that sets JSON headers but does not automatically attach the stored user JWT ([frontend/src/services/api.js](frontend/src/services/api.js#L1-L13)). The Socket.IO client sends a token in handshake auth ([frontend/src/services/socket.js](frontend/src/services/socket.js#L6-L18)). Tokens and user IDs are stored in `localStorage` by the app bootstrap ([frontend/src/App.jsx](frontend/src/App.jsx#L23-L47)).

### Telegram WebApp usage

On mount, the app calls `Telegram.WebApp.ready()` and `.expand()`, reads `initData`, and submits it to `/auth/login`; it stores the returned token/user ID and connects the socket ([frontend/src/App.jsx](frontend/src/App.jsx#L22-L47)). The Telegram WebApp SDK is loaded from Telegram's hosted script in [frontend/index.html](frontend/index.html#L1-L14).

## 6. Data Flow (one end-to-end user journey)

1. Telegram opens the Mini App. The frontend calls `ready`/`expand` and submits `initData` to `/api/auth/login` ([frontend/src/App.jsx](frontend/src/App.jsx#L23-L47)).
2. The backend derives the Telegram WebApp secret from `TELEGRAM_BOT_TOKEN`, checks the HMAC, parses the user, finds/creates the user row, and issues a JWT ([backend/src/routes/auth.js](backend/src/routes/auth.js#L11-L33), [backend/src/routes/auth.js](backend/src/routes/auth.js#L37-L80)).
3. The lobby shows the cached/refreshed balance. A stake selection navigates to card selection, which loads reserved cards and posts `stake`, `card_number`, and local-storage `dbUserId` to `/api/rooms/join` ([frontend/src/pages/Lobby.jsx](frontend/src/pages/Lobby.jsx#L40-L53), [frontend/src/pages/CardSelection.jsx](frontend/src/pages/CardSelection.jsx#L15-L60)).
4. The backend joins/creates a room, creates a participant and card selection, then the frontend connects to Socket.IO and emits `join_room` with the room and user IDs ([backend/src/routes/rooms.js](backend/src/routes/rooms.js#L40-L185), [frontend/src/pages/GameScreen.jsx](frontend/src/pages/GameScreen.jsx#L50-L55)).
5. Once enough players join, the server counts down, verifies balances, debits stakes, draws numbers, and broadcasts them ([backend/src/sockets/gameHandler.js](backend/src/sockets/gameHandler.js#L97-L196), [backend/src/sockets/gameHandler.js](backend/src/sockets/gameHandler.js#L257-L290)).
6. A player presses Bingo; the server validates the chosen card against its own called-number set, waits briefly for tied claims, pays winners, writes ledger entries, and sends `game_over` ([frontend/src/pages/GameScreen.jsx](frontend/src/pages/GameScreen.jsx#L194-L200), [backend/src/sockets/gameHandler.js](backend/src/sockets/gameHandler.js#L494-L625)).

**Identity caveat:** the REST and socket join steps pass user IDs from client-controlled storage/body fields. The HMAC-issued JWT is not consistently used to bind those operations to the authenticated user; see the risk assessment.

## 7. Integrations & External Services

- **Telegram Bot API / WebApp:** Telegraf bot and WebApp launch; HMAC validation uses the bot token ([backend/src/bot/index.js](backend/src/bot/index.js#L1-L10), [backend/src/routes/auth.js](backend/src/routes/auth.js#L11-L33)).
- **PostgreSQL:** primary persistence through Knex and `pg` ([backend/knexfile.js](backend/knexfile.js#L12-L39)).
- **links.et:** external receipt verification using a server-side API key ([backend/src/services/paymentService.js](backend/src/services/paymentService.js#L33-L55)).
- **Google Fonts:** loaded from Google Fonts in the HTML shell ([frontend/index.html](frontend/index.html#L5-L8)).
- **Telebirr:** manual receipt flow and a second bot-based pending-approval flow; receiver details appear in UI/config. Initiation/webhook handlers are incomplete as noted above.
- **CBE Birr:** routes are declared, but their service functions are missing.
- **Socket.IO:** game events and wallet updates. Redis clustering is optional in code, but the Redis packages are not declared in the backend dependency manifest ([backend/src/server.js](backend/src/server.js#L109-L126), [backend/package.json](backend/package.json#L10-L22)).

No cron scheduler or separate push-notification service was found. Game timers use `setTimeout`/`setInterval` in the Socket.IO handler.

## 8. Environment Variables & Setup

### Variables

Backend variables declared in `.env.example` or referenced in code:

| Variable | Use / status |
|---|---|
| `PORT` | HTTP port; defaults to 3001 in active server |
| `NODE_ENV` | Selects development/production config and PostgreSQL SSL behavior |
| `DATABASE_URL` | PostgreSQL connection string; alternatively `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` |
| `TELEGRAM_BOT_TOKEN` | Bot launch and Telegram init-data validation |
| `JWT_SECRET` | User, admin, and socket JWT signing/verification |
| `ADMIN_SEED_TOKEN` | Required seed endpoint header; must be at least 32 bytes |
| `TELEBIRR_RECEIVER_NUMBER`, `TELEBIRR_RECEIVER_NAME` | Marked required at startup; receiver values are also hard-coded in bot/UI flows |
| `LINKS_ET_API_KEY` | links.et receipt verification |
| `FRONTEND_URL` | CORS allowlist and bot WebApp URL |
| `REDIS_URL` | Optional Socket.IO adapter configuration |
| `MOCK_PAYMENTS` | Present in sample only; no application-code use found |
| `API_URL` | Declared as a bot default, but the resulting `API_BASE` is unused |

The required-variable check and backend sample are in [backend/src/server.js](backend/src/server.js#L4-L18) and [backend/.env.example](backend/.env.example#L1-L12); PostgreSQL fallback fields are in [backend/knexfile.js](backend/knexfile.js#L27-L36). The frontend requires `VITE_API_URL` and `VITE_SOCKET_URL`; the example currently leaves both blank ([frontend/.env.example](frontend/.env.example#L1-L2), [frontend/src/services/api.js](frontend/src/services/api.js#L1-L5)).

An ignored local `backend/.env` exists in the workspace; it contains a populated, non-placeholder `JWT_SECRET`. Its value is intentionally not reproduced here. The file is ignored by [`.gitignore`](.gitignore#L1-L3), and it is not tracked by Git. If that value is genuine and has ever been exposed, rotate it.

### Local development and migrations

The root README recommends:

```bash
cd backend
npm install
npm start

cd frontend
npm install
npm run dev
```

Set backend values in `backend/.env` and frontend URLs in `frontend/.env`; see [README.md](README.md#L5-L20), [backend/.env.example](backend/.env.example#L1-L12), and [frontend/.env.example](frontend/.env.example#L1-L2). The active backend applies pending migrations automatically at startup ([backend/src/server.js](backend/src/server.js#L131-L145)). An initial admin can be provisioned through the guarded seed endpoint or the `backend/scripts/seed_admin.js` script. No separate game-data seed is required by the active startup path.

## 9. Risks, Code Smells & Security Notes

1. **High — identity and authorization gaps.** Most user-facing routes have no JWT middleware and accept a caller-supplied `userId`; wallet balance, deposit, withdrawal, room joining/cards, and history can therefore act on user identifiers without proving ownership ([backend/src/routes/rooms.js](backend/src/routes/rooms.js#L40-L54), [backend/src/routes/wallet.js](backend/src/routes/wallet.js#L7-L49), [backend/src/routes/users.js](backend/src/routes/users.js#L6-L10)). Socket middleware accepts missing or invalid tokens and handlers trust supplied user IDs; membership checks do not bind them to a verified JWT principal ([backend/src/sockets/gameHandler.js](backend/src/sockets/gameHandler.js#L312-L323), [backend/src/sockets/gameHandler.js](backend/src/sockets/gameHandler.js#L494-L529), [backend/src/sockets/gameHandler.js](backend/src/sockets/gameHandler.js#L711-L724)).
2. **High — payment functionality is incomplete and inconsistent.** Payment initiation/webhook routes call unexported functions, and bot deposits require admin approval while Mini App deposits credit immediately after receipt verification ([backend/src/routes/payments.js](backend/src/routes/payments.js#L1-L58), [backend/src/services/paymentService.js](backend/src/services/paymentService.js#L109-L148), [backend/src/bot/index.js](backend/src/bot/index.js#L178-L224), [backend/src/routes/wallet.js](backend/src/routes/wallet.js#L22-L34)).
3. **High — automatic balance-reset migration.** Migration 010 sets every existing `users.wallet_balance` to zero, while startup automatically runs pending migrations. On a database where this migration has not yet been applied, this can erase real balances ([backend/migrations/010_reset_all_balances.js](backend/migrations/010_reset_all_balances.js#L1-L9), [backend/src/server.js](backend/src/server.js#L131-L138)).
4. **High — unsafe secret fallbacks.** User and admin JWT code falls back to known development strings when `JWT_SECRET` is absent ([backend/src/routes/auth.js](backend/src/routes/auth.js#L9), [backend/src/middleware/adminAuth.js](backend/src/middleware/adminAuth.js#L1-L3), [backend/src/sockets/gameHandler.js](backend/src/sockets/gameHandler.js#L7-L8)). The startup check only logs missing settings and still proceeds.
5. **Medium — weak financial input/transaction boundaries.** The REST withdrawal check and wallet decrement/payment insert are separate operations; amount/provider validation is limited, and the balance read/check is not locked in that route ([backend/src/routes/wallet.js](backend/src/routes/wallet.js#L38-L62)). Admin subtract-balance also has no nonnegative-balance guard ([backend/src/routes/admin.js](backend/src/routes/admin.js#L134-L181)).
6. **Medium — permissive CORS and public financial data.** Any `*.vercel.app` origin is allowed ([backend/src/server.js](backend/src/server.js#L44-L64)), and the unauthenticated leaderboard returns user names and wallet balances ([backend/src/routes/users.js](backend/src/routes/users.js#L28-L35)).
7. **Medium — Telegram login replay window.** `initData` is HMAC-checked, but the code does not enforce freshness of its `auth_date` and compares hashes with ordinary string equality ([backend/src/routes/auth.js](backend/src/routes/auth.js#L11-L35)).
8. **Medium — in-memory game state.** Draws and timers are not durably checkpointed; a process restart can leave database room status out of sync with game execution ([backend/src/sockets/gameHandler.js](backend/src/sockets/gameHandler.js#L257-L303), [backend/src/sockets/gameHandler.js](backend/src/sockets/gameHandler.js#L339-L382)).
9. **Medium — known runtime defects.** `/admin/archive-data` imports `archiveData` but calls the undefined `archiveOldData`; payment routes have missing service exports ([backend/src/routes/admin.js](backend/src/routes/admin.js#L7-L8), [backend/src/routes/admin.js](backend/src/routes/admin.js#L388-L395), [backend/src/services/paymentService.js](backend/src/services/paymentService.js#L148)).
10. **Quality/testing gaps.** Backend `npm test` is explicitly a failing placeholder; `test-auth.js` is a standalone smoke test against the legacy `backend/index.js`, not the active server. Frontend lint exits successfully but reports unused imports/variables, swallowed catch parameters, and React hook warnings ([backend/package.json](backend/package.json#L4-L8), [backend/test-auth.js](backend/test-auth.js#L1-L16), [backend/index.js](backend/index.js#L1-L46)). `crypto` is listed as an npm dependency although code uses Node's built-in `crypto` module ([backend/package.json](backend/package.json#L10-L22), [backend/src/routes/auth.js](backend/src/routes/auth.js#L1-L2)). No direct SQL-injection issue was evident in the reviewed Knex queries; room-lock SQL uses a bound parameter ([backend/src/routes/rooms.js](backend/src/routes/rooms.js#L64-L65)). No TODO/FIXME comments or automated frontend test runner were found. Package age/security freshness was not assessed against an external registry.

**Validation performed:** `npm --prefix frontend run lint` passed with warnings. `npm --prefix frontend run build` failed before compiling because the installed Rolldown native binding is invalid/missing for this Windows environment. `npm --prefix backend test` failed because the package's test script intentionally exits with “no test specified.”

## 10. Recommendations

### Critical

- Bind every user operation to a verified JWT identity; require authenticated sockets and derive user identity from the token rather than payload fields.
- Remove known JWT fallbacks and fail startup when required secrets are absent. Rotate the local JWT secret if it is real or was ever shared.
- Review the balance-reset migration before production deployment; prevent accidental application to a database with real balances.

### High

- Implement or remove the payment-initiation and webhook routes; verify provider signatures/statuses and make deposit/withdrawal processing atomic, idempotent, and auditable.
- Add strict amount/provider/card/user validation and transaction/row-lock protections to all wallet operations.
- Fix the archive route's handler reference and make startup fail closed when migrations fail.

### Medium

- Persist game state/draws or provide restart-safe room recovery; decide and enforce a single-card versus multi-card UX.
- Enforce Telegram `auth_date` freshness (and constant-time hash comparison) during WebApp login.
- Narrow the CORS allowlist and review whether public leaderboard balances should be disclosed.
- Add integration tests for auth, room lifecycle, payment verification, wallet accounting, migrations, and the active server entry point.

### Low

- Resolve the frontend lint warnings, remove unused code/imports and the obsolete alternate server where appropriate.
- Populate/document frontend environment placeholders and reconcile README's `BOT_TOKEN` name with `TELEGRAM_BOT_TOKEN`.
- Add a dependency freshness/security review and CI checks for build, lint, migrations, and tests.
