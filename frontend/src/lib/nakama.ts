import { Client, type Match, type MatchData, type MatchmakerMatched, type Session, type Socket } from "@heroiclabs/nakama-js";
import type { LeaderboardEntry, MatchState, Mode, RoomSummary } from "../types";

const defaultHost = import.meta.env.VITE_NAKAMA_HOST ?? "127.0.0.1";
const defaultPort = import.meta.env.VITE_NAKAMA_PORT ?? "7350";
const defaultScheme = import.meta.env.VITE_NAKAMA_SCHEME ?? "http";
const serverKey = import.meta.env.VITE_NAKAMA_SERVER_KEY ?? "defaultkey";

export const MOVE_OPCODE = 1;
export const STATE_OPCODE = 2;
export const SYSTEM_OPCODE = 3;

const client = new Client(serverKey, defaultHost, defaultPort, defaultScheme === "https", 7000, false);

let activeSession: Session | null = null;
let activeSocket: Socket | null = null;

function parseWireData<T>(payload: unknown): T {
  if (typeof payload === "string") {
    return JSON.parse(payload) as T;
  }

  if (payload instanceof Uint8Array) {
    return JSON.parse(new TextDecoder().decode(payload)) as T;
  }

  if (payload && typeof payload === "object") {
    return payload as T;
  }

  return JSON.parse(String(payload ?? "{}")) as T;
}

function normalizeMatchId(value: Record<string, unknown>) {
  return String(value.matchId ?? value.match_id ?? "");
}

function getOrCreateDeviceId() {
  const key = "ttt-device-id";
  const existing = localStorage.getItem(key);
  if (existing) {
    return existing;
  }
  const value = crypto.randomUUID();
  localStorage.setItem(key, value);
  return value;
}

export async function authenticate(username: string) {
  const session = await client.authenticateDevice(getOrCreateDeviceId(), true, username);
  activeSession = session;
  return session;
}

export async function getSocket() {
  if (!activeSession) {
    throw new Error("No active session");
  }

  if (activeSocket) {
    return activeSocket;
  }

  const socket = client.createSocket(defaultScheme === "https", false);
  await socket.connect(activeSession, true);
  activeSocket = socket;
  return socket;
}

export function getSession() {
  return activeSession;
}

export async function createRoom(roomName: string, mode: Mode) {
  if (!activeSession) {
    throw new Error("Not authenticated");
  }
  const result = await client.rpc(activeSession, "create_room", { roomName, mode });
  return parseWireData<{ matchId: string }>(result.payload ?? {});
}

export async function listRooms() {
  if (!activeSession) {
    throw new Error("Not authenticated");
  }
  const result = await client.rpc(activeSession, "list_rooms", {});
  return parseWireData<{ rooms: RoomSummary[] }>(result.payload ?? { rooms: [] });
}

export async function getLeaderboard() {
  if (!activeSession) {
    throw new Error("Not authenticated");
  }
  const result = await client.rpc(activeSession, "get_leaderboard", {});
  return parseWireData<{ entries: LeaderboardEntry[] }>(result.payload ?? { entries: [] });
}

export async function joinMatch(matchId: string) {
  const socket = await getSocket();
  const joined = (await socket.joinMatch(matchId)) as Match;
  return {
    matchId: joined.match_id,
    presences: joined.presences ?? [],
  };
}

export async function startMatchmaking(mode: Mode) {
  const socket = await getSocket();
  return socket.addMatchmaker("*", 2, 2, { mode }, {});
}

export async function leaveMatchmaking(ticket: string) {
  const socket = await getSocket();
  await socket.removeMatchmaker(ticket);
}

export async function sendMove(matchId: string, position: number) {
  if (!activeSession) {
    throw new Error("Not authenticated");
  }
  await client.rpc(activeSession, "submit_move", { matchId, position });
}

export function decodeState(message: MatchData) {
  return parseWireData<MatchState>(message.data);
}

export function decodeSystemMessage(message: MatchData) {
  return parseWireData<{ type: string; message: string }>(message.data);
}

export function onMatchFound(handler: (matchmakerMatched: { matchId: string }) => void) {
  if (!activeSocket) {
    throw new Error("Socket not connected");
  }
  activeSocket.onmatchmakermatched = (matched: MatchmakerMatched) => {
    handler({ matchId: matched.match_id });
  };
}

export function onMatchData(handler: (message: MatchData) => void) {
  if (!activeSocket) {
    throw new Error("Socket not connected");
  }
  activeSocket.onmatchdata = handler;
}

export async function leaveMatch(matchId: string) {
  const socket = await getSocket();
  await socket.leaveMatch(matchId);
}
