# Sentinel

Sentinel is a telecom identity-continuity and transaction-risk engine prototype that correlates telecom, device, location, and transaction events to detect suspicious sequences.

## Project structure

- `server/` - Node.js and Express backend with in-memory event storage.
- `dashboard/` - React and Vite dashboard shell.
- `mobile/` - Expo React Native application for a physical Android phone.

## Prerequisites

- Node.js 20 or newer and npm.
- Expo Go installed on a physical Android phone.
- The phone and development computer connected to the same LAN for direct local testing.

## Start the server

```bash
cd server
npm install
cp .env.example .env
npm run dev
```

The server listens on port `4000` by default. Check it at http://localhost:4000/health.

## Start the dashboard

In a second terminal:

```bash
cd dashboard
npm install
cp .env.example .env
npm run dev
```

The dashboard opens at the Vite URL shown in the terminal and checks `GET /health` automatically.

## Start the Expo application

Set the backend URL to an address reachable by the phone. Do not use `localhost` for a physical phone because it points to the phone itself.

```bash
cd mobile
npm install
cp .env.example .env
# Edit .env and set EXPO_PUBLIC_API_URL to your computer's LAN IP.
npx expo start
```

Example:

```env
EXPO_PUBLIC_API_URL=http://192.168.1.25:4000
```

Scan the QR code with Expo Go, then press **Send Test Event**. The phone should show live device metadata, send `POST /events`, and display the returned event ID and receipt time. The server logs every received event.

If the phone and development machine cannot communicate over LAN, use an Expo-compatible tunnel or a deployed backend URL instead. Keep the URL configurable and reachable from the phone.

## Stage 1 scope

This stage intentionally uses in-memory events and does not include authentication, databases, risk scoring, transactions, telecom integrations, background location, or production deployment infrastructure.