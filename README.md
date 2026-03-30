# Multiplayer Tic-Tac-Toe with Nakama

This project is a multiplayer Tic-Tac-Toe game built with a React frontend and a Nakama backend. The game uses a server-authoritative approach, so all match state, move validation, turn handling, win detection, disconnect handling, and timed mode logic run on the backend.

## Tech stack

- React
- TypeScript
- Vite
- Nakama
- Docker
- CockroachDB for local development
- PostgreSQL-compatible hosted database for cloud deployment

## What is included

- Responsive web interface designed to work well on desktop and mobile
- Real-time board updates
- Player names, symbols, match status, and turn state in the UI
- Server-side move validation
- Room creation and room discovery
- Manual room joining
- Automatic matchmaking
- Disconnect handling
- Timed mode with turn countdown and timeout loss
- Support for multiple simultaneous matches through separate Nakama match instances
- Backend and frontend deployment on Render

## Live deployment

- Frontend: [https://multiplayer-tic-tac-toe-nakama-frontend.onrender.com](https://multiplayer-tic-tac-toe-nakama-frontend.onrender.com)
- Nakama backend: [https://multiplayer-tic-tac-toe-nakama.onrender.com](https://multiplayer-tic-tac-toe-nakama.onrender.com)
- Health check: [https://multiplayer-tic-tac-toe-nakama.onrender.com/healthcheck](https://multiplayer-tic-tac-toe-nakama.onrender.com/healthcheck)
- Repository: [https://github.com/pandey4himanshu/multiplayer-tic-tac-toe-nakama](https://github.com/pandey4himanshu/multiplayer-tic-tac-toe-nakama)

## Architecture

The frontend is responsible for login, room browsing, room creation, matchmaking, board rendering, and live updates from Nakama.

The backend uses Nakama authoritative matches. Every room runs as its own match instance, which keeps the game state isolated from other rooms. The server checks whether a move is valid before applying it and then broadcasts the updated state to connected players.

There are two ways to start a game:

- Open a room and let another player join it from the room list
- Use matchmaking in two clients with the same mode selected

## Setup and installation

### Requirements

- Node.js 20 or newer
- npm
- Docker Desktop

### Run locally

Start the backend:

```bash
make up
```

This starts CockroachDB and Nakama locally.

Local backend endpoints:

- API: `http://127.0.0.1:7350`
- Console: `http://127.0.0.1:7351`

Start the frontend:

```bash
cd frontend
npm install
npm run build
npx vite preview --host 0.0.0.0 --port 4174
```

Then open `http://localhost:4174`.

## Deployment notes

The current cloud deployment uses Render for both the frontend and the Nakama service. The backend is configured through environment variables, including the database connection string and Nakama keys.

For the frontend deployment, the important environment variables are:

- `VITE_NAKAMA_HOST`
- `VITE_NAKAMA_PORT`
- `VITE_NAKAMA_SCHEME`
- `VITE_NAKAMA_SERVER_KEY`

For the backend deployment, the important environment variables are:

- `NAKAMA_DATABASE_ADDRESS`
- `NAKAMA_SERVER_KEY`
- `NAKAMA_SESSION_KEY`
- `NAKAMA_REFRESH_KEY`
- `NAKAMA_HTTP_KEY`
- `NAKAMA_CONSOLE_USERNAME`
- `NAKAMA_CONSOLE_PASSWORD`
- `NAKAMA_CONSOLE_SIGNING_KEY`

Example environment files are included in the repository:

- `.env.nakama.example`
- `frontend/.env.production.example`

## How to test multiplayer

1. Open the frontend in two browser tabs.
2. Enter a different player name in each tab.
3. Either create a room in one tab and join it in the other, or click `Find Match` in both tabs with the same mode selected.
4. Play a full round and confirm that turns and board updates are synchronized.
5. Switch to timed mode and verify that the countdown is shown and the match ends on timeout.

## Current note

The main multiplayer flow, room system, matchmaking, timed mode, and deployment are working. The leaderboard persistence path is implemented in the backend and frontend, and the latest backend change for leaderboard writes should be deployed before final submission verification.
