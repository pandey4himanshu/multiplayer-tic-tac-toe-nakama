export type Mode = "classic" | "timed";

export interface PlayerInfo {
  userId: string;
  username: string;
  symbol: "X" | "O";
  connected: boolean;
}

export interface MatchState {
  board: string[];
  status: "waiting" | "playing" | "finished" | "draw";
  winner: string;
  winningLine: number[];
  nextSymbol: "X" | "O";
  moveCount: number;
  roomName: string;
  mode: Mode;
  turnDeadline: number | null;
  players: PlayerInfo[];
}

export interface RoomSummary {
  matchId: string;
  roomName: string;
  mode: Mode;
  size: number;
  maxSize: number;
  status: string;
}

export interface LeaderboardEntry {
  username: string;
  rank: number;
  score: number;
  metadata: {
    wins?: number;
    losses?: number;
    draws?: number;
    currentStreak?: number;
    bestStreak?: number;
    score?: number;
    lastResult?: string;
  };
}
