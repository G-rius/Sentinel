# Sentinel

Sentinel is a telecom identity-continuity and transaction-risk engine prototype that correlates telecom, device, location, and transaction events to detect suspicious sequences.

## Project structure

- `server/` - Express API, Prisma schema/migrations, trust engine, and Socket.IO events.
- `dashboard/` - React operations dashboard with live trust, event timeline, simulators, and transaction decisions.
- `mobile/` - Expo app with device metadata, event submission, and trust refresh.

## Prerequisites

- Node.js 20 or newer and npm.
- PostgreSQL 16 or newer, running locally or at a reachable development URL.
- Expo Go compatible with the Expo SDK version in `mobile/package.json` for physical-device testing.

## Start the server

Create `server/.env` from the example and set `DATABASE_URL` to your PostgreSQL instance:

```bash
cd server
npm install
cp .env.example .env
npx prisma migrate deploy
npm run db:seed
npm run dev
```

For a new local schema migration during development, use `npm run db:migrate`. The API defaults to port `4000`; `GET /health` reports both API and database health.

## Start the dashboard

In another terminal:

```bash
cd dashboard
npm install
cp .env.example .env
npm run dev
```

Set `VITE_API_URL` in `dashboard/.env` to the backend URL reachable by the browser. For local development this is usually `http://localhost:4000`; in Codespaces use the forwarded port 4000 URL. The server's default development CORS config accepts local Vite and Codespaces forwarded dashboard origins.

## Stage 2 demo

The seeded `demo-user` starts at trust `90`. The dashboard simulators make real backend requests. Try this sequence:

1. Press **SIM replacement**. Trust becomes `60` and the decision is `STEP_UP`.
2. Press **Device change**. Trust becomes `35` and the decision is `BLOCK`.
3. Evaluate a `KSh 24,000` transfer. The attempt is stored and its status is `BLOCKED`.

The event timeline, trust score, transaction history, and Socket.IO `trustUpdated` broadcast all use data processed by the backend. The integration test covers this flow with PostgreSQL.

## Start the Expo application

Set `EXPO_PUBLIC_API_URL` in `mobile/.env` to a backend URL reachable from the phone. A physical phone cannot use `localhost` for a backend running on the development computer.

```bash
cd mobile
npm install
cp .env.example .env
# Edit .env with your LAN or forwarded backend URL.
npx expo start --tunnel --clear
```

Scan the new QR code in Expo Go. The app displays device metadata and current trust, submits a test event, and has a **Refresh Trust** control. For a local phone/computer network, use the computer's LAN IP. For a remote workspace, use its forwarded backend URL.

## API and checks

- `GET /health`
- `POST /events`
- `GET /users/:id/trust`
- `GET /users/:id/events`
- `POST /simulate`
- `GET /transactions`
- `POST /transactions`

With PostgreSQL migrated and seeded, run the core integration test with `cd server && npm test`.

## Current limits

Scoring is deterministic and demo-oriented. There is no authentication, real carrier integration, Africa's Talking, or production deployment setup. Physical-device runtime behavior still needs a manual Expo Go check; the project dependencies have been aligned to the SDK 57 compatibility matrix.