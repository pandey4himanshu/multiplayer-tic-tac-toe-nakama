import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  STATE_OPCODE,
  SYSTEM_OPCODE,
  authenticate,
  createRoom,
  decodeState,
  decodeSystemMessage,
  getLeaderboard,
  getSession,
  getSocket,
  joinMatch,
  leaveMatch,
  leaveMatchmaking,
  listRooms,
  onMatchData,
  onMatchFound,
  sendMove,
  startMatchmaking,
} from "./lib/nakama";
import type { LeaderboardEntry, MatchState, Mode, RoomSummary } from "./types";

const initialState: MatchState = {
  board: Array(9).fill(""),
  status: "waiting",
  winner: "",
  winningLine: [],
  nextSymbol: "X",
  moveCount: 0,
  roomName: "",
  mode: "classic",
  turnDeadline: null,
  players: [],
};

export default function App() {
  const [username, setUsername] = useState("");
  const [isReady, setIsReady] = useState(false);
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [mode, setMode] = useState<Mode>("classic");
  const [roomName, setRoomName] = useState("Corner Table");
  const [matchId, setMatchId] = useState<string | null>(null);
  const [matchState, setMatchState] = useState<MatchState>(initialState);
  const [ticket, setTicket] = useState<string | null>(null);
  const [statusText, setStatusText] = useState("Pick a name to begin.");
  const [countdown, setCountdown] = useState<number | null>(null);

  const me = getSession();
  const myPlayer = useMemo(
    () => matchState.players.find((player) => player.userId === me?.user_id) ?? null,
    [matchState.players, me?.user_id],
  );
  const isMyTurn = myPlayer?.symbol === matchState.nextSymbol && matchState.status === "playing";
  const activeRooms = rooms.length;
  const activeModeLabel = mode === "timed" ? "Clock Mode" : "Quick Duel";

  useEffect(() => {
    if (!isReady) {
      return;
    }

    let active = true;

    getSocket().then(() => {
      if (!active) {
        return;
      }

      onMatchFound(async (matched) => {
        setStatusText("Match found. Joining room...");
        const joined = await joinMatch(matched.matchId);
        setMatchId(joined.matchId);
        setStatusText("Match joined. Game on.");
      });

      onMatchData((message) => {
        if (message.op_code === STATE_OPCODE) {
          const next = decodeState(message);
          setMatchState(next);
          if (next.status === "finished" || next.status === "draw") {
            setTicket(null);
          }
        }
        if (message.op_code === SYSTEM_OPCODE) {
          const system = decodeSystemMessage(message);
          setStatusText(system.message);
        }
      });
    });

    refreshLobby();

    return () => {
      active = false;
    };
  }, [isReady]);

  useEffect(() => {
    if (!matchState.turnDeadline) {
      setCountdown(null);
      return;
    }
    const interval = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((matchState.turnDeadline! - Date.now()) / 1000));
      setCountdown(remaining);
    }, 300);
    return () => window.clearInterval(interval);
  }, [matchState.turnDeadline]);

  async function refreshLobby() {
    const [roomResult, leaderboardResult] = await Promise.all([listRooms(), getLeaderboard()]);
    setRooms(roomResult.rooms);
    setLeaderboard(leaderboardResult.entries);
  }

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    await authenticate(username || "Guest");
    setIsReady(true);
    setStatusText("Connected to Nakama. Create a room or queue matchmaking.");
  }

  async function handleCreateRoom() {
    const result = await createRoom(roomName, mode);
    const joined = await joinMatch(result.matchId);
    setMatchId(joined.matchId);
    setStatusText("Room created. Waiting for opponent...");
    await refreshLobby();
  }

  async function handleJoinRoom(nextMatchId: string) {
    const joined = await joinMatch(nextMatchId);
    setMatchId(joined.matchId);
    setStatusText("Joined room.");
  }

  async function handleQueue() {
    const response = await startMatchmaking(mode);
    setTicket(response.ticket);
    setStatusText("Searching for an opponent...");
  }

  async function handleCancelQueue() {
    if (!ticket) {
      return;
    }
    await leaveMatchmaking(ticket);
    setTicket(null);
    setStatusText("Matchmaking canceled.");
  }

  async function handleCellClick(index: number) {
    if (!matchId || !isMyTurn || matchState.board[index]) {
      return;
    }
    await sendMove(matchId, index);
  }

  async function handleLeaveMatch() {
    if (!matchId) {
      return;
    }
    await leaveMatch(matchId);
    setMatchId(null);
    setMatchState(initialState);
    setStatusText("Returned to lobby.");
    await refreshLobby();
  }

  return (
    <main className="app-shell">
      <section className="hero-card">
        <p className="eyebrow">Live Match Room</p>
        <h1>Grid Duel</h1>
        <p className="hero-copy">
          A small multiplayer game room with live turns, room join flow, match queue, and a
          server-controlled board.
        </p>
        <div className="hero-stats">
          <div className="hero-stat">
            <span>Mode</span>
            <strong>{activeModeLabel}</strong>
          </div>
          <div className="hero-stat">
            <span>Open Rooms</span>
            <strong>{activeRooms}</strong>
          </div>
          <div className="hero-stat">
            <span>Backend</span>
            <strong>Nakama</strong>
          </div>
        </div>

        {!isReady ? (
          <form className="identity-form" onSubmit={handleLogin}>
            <label>
              Player name
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Aarav, Meera, Sam..."
              />
            </label>
            <button type="submit">Enter Room List</button>
          </form>
        ) : (
          <div className="identity-pill">
            <span>{me?.username}</span>
            <span>{statusText}</span>
          </div>
        )}
      </section>

      {isReady && (
        <section className="content-shell">
          <div className="panel game-panel">
            <div className="panel-header">
              <div>
                <h2>{matchState.roomName || "Board"}</h2>
                <p className="muted">
                  {myPlayer
                    ? `You are ${myPlayer.symbol}. ${isMyTurn ? "Play your move." : "Wait for the other player."}`
                    : "Join a table to begin."}
                </p>
              </div>
              {matchId && (
                <button className="ghost-button" onClick={handleLeaveMatch}>
                  Leave
                </button>
              )}
            </div>

            <div className="players-row">
              {matchState.players.map((player) => (
                <div
                  className={`player-chip ${player.symbol === matchState.nextSymbol ? "active" : ""}`}
                  key={player.userId}
                >
                  <span className="player-name">{player.username}</span>
                  <strong className="player-symbol">{player.symbol}</strong>
                </div>
              ))}
            </div>

            {matchState.mode === "timed" && countdown !== null && (
              <div className="timer-banner">Clock: {countdown}s left</div>
            )}

            <div className="board">
              {matchState.board.map((cell, index) => (
                <button
                  key={index}
                  className={`cell ${matchState.winningLine.includes(index) ? "winning" : ""}`}
                  onClick={() => handleCellClick(index)}
                >
                  {cell || " "}
                </button>
              ))}
            </div>

            <div className="result-banner">
              {matchState.status === "finished" && <span>Winner: {matchState.winner}</span>}
              {matchState.status === "draw" && <span>Round ended in a draw.</span>}
              {matchState.status === "waiting" && <span>Waiting for the second player...</span>}
            </div>
          </div>

          <section className="bottom-grid">
            <div className="panel stack">
              <div className="panel-header">
                <h2>Room List</h2>
                <button className="ghost-button" onClick={refreshLobby}>
                  Refresh
                </button>
              </div>

              <div className="mode-switch">
                <button
                  className={mode === "classic" ? "selected" : ""}
                  onClick={() => setMode("classic")}
                >
                  Quick Duel
                </button>
                <button
                  className={mode === "timed" ? "selected" : ""}
                  onClick={() => setMode("timed")}
                >
                  Clock Mode
                </button>
              </div>

              <label className="stack">
                Table name
                <input value={roomName} onChange={(event) => setRoomName(event.target.value)} />
              </label>

              <div className="action-row">
                <button onClick={handleCreateRoom}>Open Table</button>
                {!ticket ? (
                  <button className="secondary-button" onClick={handleQueue}>
                    Find Match
                  </button>
                ) : (
                  <button className="ghost-button" onClick={handleCancelQueue}>
                    Stop Search
                  </button>
                )}
              </div>

              <div className="room-list">
                {rooms.length === 0 ? (
                  <p className="muted">No open tables right now.</p>
                ) : (
                  rooms.map((room) => (
                    <article className="room-card" key={room.matchId}>
                      <div>
                        <strong>{room.roomName}</strong>
                        <p>{room.mode === "timed" ? "clock mode" : "quick duel"}</p>
                      </div>
                      <div className="room-card-actions">
                        <span className="room-badge">
                          {room.size}/{room.maxSize}
                        </span>
                        <button onClick={() => handleJoinRoom(room.matchId)}>Join</button>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </div>

            <div className="panel leaderboard-panel">
              <div className="panel-header">
                <h2>Top Players</h2>
              </div>
              <div className="leaderboard">
                {leaderboard.length === 0 ? (
                  <p className="muted">Play a few rounds to fill this list.</p>
                ) : (
                  leaderboard.map((entry) => (
                    <div className="leaderboard-row" key={`${entry.rank}-${entry.username}`}>
                      <div className="leaderboard-main">
                        <span>#{entry.rank}</span>
                        <strong>{entry.username}</strong>
                      </div>
                      <div className="leaderboard-meta">
                        <span>{entry.score} pts</span>
                        <span>
                          {entry.metadata.wins ?? 0}W/{entry.metadata.losses ?? 0}L/{entry.metadata.draws ?? 0}D
                        </span>
                        <span>Best streak: {entry.metadata.bestStreak ?? 0}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>
        </section>
      )}
    </main>
  );
}
