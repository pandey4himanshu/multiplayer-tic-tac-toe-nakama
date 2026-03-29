# Multiplayer Tic-Tac-Toe with Nakama

This project is a multiplayer Tic-Tac-Toe game built with React on the frontend and Nakama on the backend.

## Tech stack

- React
- TypeScript
- Vite
- Nakama
- Docker Compose
- CockroachDB

## Features completed

- Real-time multiplayer Tic-Tac-Toe
- Server-authoritative game logic
- Server-side move validation
- Room creation
- Room discovery and join flow
- Automatic matchmaking
- Disconnect handling
- Timed mode
- Leaderboard with score, wins, losses, draws, and streak data
- Responsive frontend UI

## Project structure

The frontend code is inside the `frontend` folder.

The Nakama match logic is inside `nakama/modules/index.js`.

Local Docker setup is defined in `docker-compose.yml`.

Production-oriented Docker setup is added in `docker-compose.prod.yml`.

## How it works

The frontend handles player login, room creation, room join, matchmaking, live board updates, and leaderboard display.

The backend runs the actual game state on the server. Turn order, move validation, win detection, draw handling, disconnect handling, timed mode, and leaderboard updates are controlled in the Nakama match handler.

## Local setup

### Requirements

- Node.js 20 or later
- npm
- Docker Desktop

### Start the backend

```bash
make up
```

This starts CockroachDB and Nakama locally.

Backend endpoints:

- API: `http://127.0.0.1:7350`
- Console: `http://127.0.0.1:7351`

### Start the frontend

```bash
cd frontend
npm install
npm run build
npx vite preview --host 0.0.0.0 --port 4174
```

Then open:

- `http://localhost:4174`

## Environment configuration

For local frontend configuration, create a `.env` file inside `frontend` if needed.

Example values:

```bash
VITE_NAKAMA_HOST=127.0.0.1
VITE_NAKAMA_PORT=7350
VITE_NAKAMA_SCHEME=http
VITE_NAKAMA_SERVER_KEY=defaultkey
```

For production-oriented Nakama configuration, `.env.nakama.example` is included at the project root.

For production-oriented frontend configuration, `frontend/.env.production.example` is included.

## How to test multiplayer

1. Open the app in two browser tabs.
2. Enter two different player names.
3. Create a room in one tab and join it from the other tab, or use automatic matchmaking in both tabs.
4. Play turns from both tabs and verify that the board updates in real time.
5. Test timed mode and disconnect handling.

## Submission status

The main application, local Docker setup, game logic, matchmaking flow, timed mode, and leaderboard tracking are completed in this repository.

The repository is initialized locally with Git and is ready to be pushed.

Actual public deployment and pushing to a GitHub or GitLab remote still require the target account credentials and deployment target details.
