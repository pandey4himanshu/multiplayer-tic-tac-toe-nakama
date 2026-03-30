var MATCH_NAME = "tic_tac_toe_match";
var LEADERBOARD_ID = "tictactoe_global_v2";
var PLAYER_STATS_COLLECTION = "player_stats";
var PLAYER_STATS_KEY = "summary";
var MOVE_OPCODE = 1;
var STATE_OPCODE = 2;
var SYSTEM_OPCODE = 3;
var TURN_TIME_MS = 30000;

function InitModule(ctx, logger, nk, initializer) {
  try {
    nk.leaderboardCreate(
      LEADERBOARD_ID,
      true,
      "desc",
      "set",
      "",
      { title: "Global Tic-Tac-Toe Ranking" },
      true
    );
  } catch (error) {
    logger.info("Leaderboard create skipped: %s", error);
  }

  initializer.registerMatch(MATCH_NAME, {
    matchInit: matchInit,
    matchJoinAttempt: matchJoinAttempt,
    matchJoin: matchJoin,
    matchLeave: matchLeave,
    matchLoop: matchLoop,
    matchSignal: matchSignal,
    matchTerminate: matchTerminate,
  });

  initializer.registerRpc("create_room", rpcCreateRoom);
  initializer.registerRpc("list_rooms", rpcListRooms);
  initializer.registerRpc("submit_move", rpcSubmitMove);
  initializer.registerRpc("get_leaderboard", rpcGetLeaderboard);
  initializer.registerMatchmakerMatched(onMatchmakerMatched);

  logger.info("Tic-Tac-Toe runtime loaded");
}

function rpcCreateRoom(ctx, logger, nk, payload) {
  var input = parsePayload(payload);
  var matchId = nk.matchCreate(MATCH_NAME, {
    creatorId: ctxUserId(ctx),
    creatorUsername: ctxUsername(ctx),
    roomName: input.roomName || "Open Room",
    mode: normalizeMode(input.mode),
  });

  return JSON.stringify({ matchId: matchId });
}

function rpcListRooms(ctx, logger, nk, payload) {
  var matches = nk.matchList(100, true, "", 0, 2, "");
  var rooms = [];

  for (var i = 0; i < matches.length; i += 1) {
    var item = matches[i];
    var label = safeJson(item.label);
    if (!label || !label.open) {
      continue;
    }
    rooms.push({
      matchId: item.matchId || item.match_id,
      roomName: label.roomName,
      mode: label.mode,
      size: item.size,
      maxSize: 2,
      status: label.status,
    });
  }

  return JSON.stringify({ rooms: rooms });
}

function rpcSubmitMove(ctx, logger, nk, payload) {
  var input = parsePayload(payload);
  nk.matchSignal(input.matchId, JSON.stringify({
    type: "move",
    userId: ctxUserId(ctx),
    position: input.position,
  }));
  return JSON.stringify({ ok: true });
}

function rpcGetLeaderboard(ctx, logger, nk, payload) {
  var records = nk.leaderboardRecordsList(LEADERBOARD_ID, [], 10, "", 0);
  var top = [];
  for (var i = 0; i < records.records.length; i += 1) {
    var record = records.records[i];
    var ownerId = record.ownerId || record.owner_id || "";
    var stats = defaultStats();
    try {
      stats = readPlayerStats(nk, ownerId);
    } catch (error) {
      logger.error("Stats read failed while listing leaderboard for %s: %s", ownerId, error);
    }
    top.push({
      username: record.username,
      rank: record.rank,
      score: record.score,
      metadata: stats,
    });
  }
  return JSON.stringify({ entries: top });
}

function onMatchmakerMatched(ctx, logger, nk, entries) {
  var mode = "classic";
  var seedPlayers = [];

  for (var i = 0; i < entries.length; i += 1) {
    var entry = entries[i];
    if (entry.properties && entry.properties.mode) {
      mode = normalizeMode(entry.properties.mode);
    }
    seedPlayers.push({
      userId: userIdOf(entry.presence),
      username: usernameOf(entry.presence),
    });
  }

  return nk.matchCreate(MATCH_NAME, {
    roomName: "Matchmade Room",
    mode: mode,
    seedPlayers: seedPlayers,
  });
}

function matchInit(ctx, logger, nk, params) {
  var mode = normalizeMode(params.mode);
  var state = {
    board: ["", "", "", "", "", "", "", "", ""],
    status: "waiting",
    winner: "",
    winningLine: [],
    nextSymbol: "X",
    moveCount: 0,
    roomName: params.roomName || "Open Room",
    mode: mode,
    turnDeadline: mode === "timed" ? Date.now() + TURN_TIME_MS : null,
    players: [],
    presences: {},
    emptyTicks: 0,
    pendingMove: null,
  };

  if (params.seedPlayers && params.seedPlayers.length) {
    for (var i = 0; i < params.seedPlayers.length; i += 1) {
      assignPlayerSlot(state, params.seedPlayers[i].userId, params.seedPlayers[i].username);
    }
    state.status = state.players.length === 2 ? "playing" : "waiting";
    if (state.status === "playing" && state.mode === "timed") {
      state.turnDeadline = Date.now() + TURN_TIME_MS;
    }
  } else if (params.creatorId) {
    assignPlayerSlot(state, params.creatorId, params.creatorUsername || "Player");
  }

  return {
    state: state,
    tickRate: 2,
    label: buildLabel(state),
  };
}

function matchJoinAttempt(ctx, logger, nk, dispatcher, tick, state, presence, metadata) {
  if (state.players.length >= 2 && !findPlayer(state, userIdOf(presence))) {
    return { state: state, accept: false, rejectMessage: "Room is full." };
  }
  return { state: state, accept: true };
}

function matchJoin(ctx, logger, nk, dispatcher, tick, state, presences) {
  for (var i = 0; i < presences.length; i += 1) {
    var presence = presences[i];
    var userId = userIdOf(presence);
    state.presences[userId] = presence;
    if (!findPlayer(state, userId)) {
      assignPlayerSlot(state, userId, usernameOf(presence));
    } else {
      findPlayer(state, userId).connected = true;
    }
  }

  if (state.players.length === 2 && state.status === "waiting") {
    state.status = "playing";
    if (state.mode === "timed") {
      state.turnDeadline = Date.now() + TURN_TIME_MS;
    }
  }

  broadcastState(dispatcher, state);
  return { state: state };
}

function matchLeave(ctx, logger, nk, dispatcher, tick, state, presences) {
  for (var i = 0; i < presences.length; i += 1) {
    var presence = presences[i];
    var userId = userIdOf(presence);
    delete state.presences[userId];
    var player = findPlayer(state, userId);
    if (player) {
      player.connected = false;
    }
  }

  if (state.status === "playing") {
    var connectedPlayers = getConnectedPlayers(state);
    if (connectedPlayers.length === 1) {
      var disconnectedPlayer = findPlayerBySymbol(
        state,
        connectedPlayers[0].symbol === "X" ? "O" : "X"
      );
      finishGame(state, connectedPlayers[0].symbol, []);
      updateMatchOutcome(logger, nk, disconnectedPlayer, connectedPlayers[0], "disconnect");
      state.status = "finished";
      broadcastSystem(dispatcher, {
        type: "player_left",
        message: connectedPlayers[0].username + " wins because the opponent disconnected.",
      });
      broadcastState(dispatcher, state);
    }
  }

  if (getConnectedPlayers(state).length === 0) {
    state.emptyTicks = 12;
  }

  return { state: state };
}

function matchLoop(ctx, logger, nk, dispatcher, tick, state, messages) {
  state.emptyTicks = getConnectedPlayers(state).length === 0 ? state.emptyTicks + 1 : 0;
  if (state.emptyTicks >= 12) {
    return null;
  }

  for (var i = 0; i < messages.length; i += 1) {
    var message = messages[i];
    var opCode = message.opCode || message.op_code;
    if (opCode !== MOVE_OPCODE) {
      continue;
    }
    var data = safeJson(message.data);
    if (!data) {
      continue;
    }
    processMove(state, userIdOf(message.sender || message.presence), data.position, dispatcher, nk, logger);
  }

  if (state.pendingMove) {
    processMove(state, state.pendingMove.userId, state.pendingMove.position, dispatcher, nk, logger);
    state.pendingMove = null;
  }

  if (state.status === "playing" && state.mode === "timed" && state.turnDeadline && Date.now() > state.turnDeadline) {
    var timedOut = findPlayerBySymbol(state, state.nextSymbol);
    var opponent = findPlayerBySymbol(state, state.nextSymbol === "X" ? "O" : "X");
    if (timedOut && opponent) {
      finishGame(state, opponent.symbol, []);
      broadcastSystem(dispatcher, {
        type: "timeout",
        message: timedOut.username + " ran out of time.",
      });
      updateMatchOutcome(logger, nk, timedOut, opponent, "timeout");
      broadcastState(dispatcher, state);
    }
  }

  return {
    state: state,
    label: buildLabel(state),
  };
}

function matchSignal(ctx, logger, nk, dispatcher, tick, state, data) {
  var payload = safeJson(data);
  if (payload && payload.type === "move") {
    state.pendingMove = {
      userId: payload.userId,
      position: payload.position,
    };
  }
  return { state: state, data: "" };
}

function matchTerminate(ctx, logger, nk, dispatcher, tick, state, graceSeconds) {
  broadcastSystem(dispatcher, {
    type: "terminated",
    message: "Match terminated by server.",
  });
  return { state: state };
}

function processMove(state, userId, position, dispatcher, nk, logger) {
  var player = findPlayer(state, userId);
  if (typeof position === "string") {
    position = parseInt(position, 10);
  }
  if (!player || state.status !== "playing" || player.symbol !== state.nextSymbol) {
    return false;
  }
  if (typeof position !== "number" || position < 0 || position > 8 || state.board[position]) {
    return false;
  }

  state.board[position] = player.symbol;
  state.moveCount += 1;
  var winnerInfo = detectWinner(state.board);

  if (winnerInfo.winner) {
    finishGame(state, winnerInfo.winner, winnerInfo.line);
    broadcastState(dispatcher, state);
    if (state.players.length === 2) {
      var loser = findPlayerBySymbol(state, winnerInfo.winner === "X" ? "O" : "X");
      updateMatchOutcome(logger, nk, loser, player, "win");
    }
    return true;
  }

  if (state.moveCount === 9) {
    state.status = "draw";
    state.winner = "";
    state.winningLine = [];
    state.turnDeadline = null;
    updateDrawStats(logger, nk, state.players);
    broadcastState(dispatcher, state);
    return true;
  }

  state.nextSymbol = state.nextSymbol === "X" ? "O" : "X";
  if (state.mode === "timed") {
    state.turnDeadline = Date.now() + TURN_TIME_MS;
  }
  broadcastState(dispatcher, state);
  return true;
}

function finishGame(state, winnerSymbol, winningLine) {
  state.status = "finished";
  state.winner = winnerSymbol;
  state.winningLine = winningLine;
  state.turnDeadline = null;
}

function updateMatchOutcome(logger, nk, loser, winner, reason) {
  if (!winner || !loser) {
    return;
  }
  var winnerStats;
  var loserStats;

  try {
    winnerStats = readPlayerStats(nk, winner.userId);
    loserStats = readPlayerStats(nk, loser.userId);
  } catch (error) {
    logger.error("Stats read failed after %s: %s", reason, error);
    return;
  }

  winnerStats.wins += 1;
  winnerStats.currentStreak += 1;
  if (winnerStats.currentStreak > winnerStats.bestStreak) {
    winnerStats.bestStreak = winnerStats.currentStreak;
  }
  winnerStats.score += 3;
  winnerStats.lastResult = reason;

  loserStats.losses += 1;
  loserStats.currentStreak = 0;
  loserStats.lastResult = reason;

  try {
    writePlayerStats(nk, winner, winnerStats);
    writePlayerStats(nk, loser, loserStats);
  } catch (error) {
    logger.error("Stats storage write failed after %s: %s", reason, error);
    return;
  }

  try {
    nk.leaderboardRecordWrite(LEADERBOARD_ID, winner.userId, winner.username, winnerStats.score);
    nk.leaderboardRecordWrite(LEADERBOARD_ID, loser.userId, loser.username, loserStats.score);
  } catch (error) {
    logger.error("Leaderboard record write failed after %s: %s", reason, error);
  }
}

function updateDrawStats(logger, nk, players) {
  if (!players || players.length !== 2) {
    return;
  }
  for (var i = 0; i < players.length; i += 1) {
    var player = players[i];
    var stats;

    try {
      stats = readPlayerStats(nk, player.userId);
    } catch (error) {
      logger.error("Stats read failed after draw for %s: %s", player.userId, error);
      continue;
    }

    stats.draws += 1;
    stats.currentStreak = 0;
    stats.score += 1;
    stats.lastResult = "draw";

    try {
      writePlayerStats(nk, player, stats);
    } catch (error) {
      logger.error("Stats storage write failed after draw for %s: %s", player.userId, error);
      continue;
    }

    try {
      nk.leaderboardRecordWrite(LEADERBOARD_ID, player.userId, player.username, stats.score);
    } catch (error) {
      logger.error("Leaderboard record write failed after draw for %s: %s", player.userId, error);
    }
  }
}

function readPlayerStats(nk, userId) {
  var records = nk.storageRead([{
    collection: PLAYER_STATS_COLLECTION,
    key: PLAYER_STATS_KEY,
    userId: userId,
  }]);
  if (records && records.length > 0 && records[0].value) {
    if (typeof records[0].value === "string") {
      return safeJson(records[0].value) || defaultStats();
    }
    if (typeof records[0].value === "object") {
      return records[0].value;
    }
  }
  return defaultStats();
}

function writePlayerStats(nk, player, stats) {
  nk.storageWrite([{
    collection: PLAYER_STATS_COLLECTION,
    key: PLAYER_STATS_KEY,
    userId: player.userId,
    value: stats,
    permissionRead: 2,
    permissionWrite: 0,
  }]);
}

function defaultStats() {
  return {
    wins: 0,
    losses: 0,
    draws: 0,
    currentStreak: 0,
    bestStreak: 0,
    score: 0,
    lastResult: "",
  };
}

function detectWinner(board) {
  var lines = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ];

  for (var i = 0; i < lines.length; i += 1) {
    var line = lines[i];
    var a = board[line[0]];
    if (a && a === board[line[1]] && a === board[line[2]]) {
      return { winner: a, line: line };
    }
  }

  return { winner: "", line: [] };
}

function assignPlayerSlot(state, userId, username) {
  if (findPlayer(state, userId)) {
    return;
  }
  var symbol = state.players.length === 0 ? "X" : "O";
  state.players.push({
    userId: userId,
    username: username || "Player",
    symbol: symbol,
    connected: true,
  });
}

function findPlayer(state, userId) {
  for (var i = 0; i < state.players.length; i += 1) {
    if (state.players[i].userId === userId) {
      return state.players[i];
    }
  }
  return null;
}

function findPlayerBySymbol(state, symbol) {
  for (var i = 0; i < state.players.length; i += 1) {
    if (state.players[i].symbol === symbol) {
      return state.players[i];
    }
  }
  return null;
}

function getConnectedPlayers(state) {
  var connected = [];
  for (var i = 0; i < state.players.length; i += 1) {
    if (state.players[i].connected) {
      connected.push(state.players[i]);
    }
  }
  return connected;
}

function broadcastState(dispatcher, state) {
  dispatcher.broadcastMessage(STATE_OPCODE, JSON.stringify(serializeState(state)));
}

function broadcastSystem(dispatcher, message) {
  dispatcher.broadcastMessage(SYSTEM_OPCODE, JSON.stringify(message));
}

function serializeState(state) {
  return {
    board: state.board,
    status: state.status,
    winner: state.winner,
    winningLine: state.winningLine,
    nextSymbol: state.nextSymbol,
    moveCount: state.moveCount,
    roomName: state.roomName,
    mode: state.mode,
    turnDeadline: state.turnDeadline,
    players: state.players,
  };
}

function buildLabel(state) {
  return JSON.stringify({
    roomName: state.roomName,
    mode: state.mode,
    open: state.status === "waiting",
    status: state.status,
  });
}

function normalizeMode(mode) {
  return mode === "timed" ? "timed" : "classic";
}

function parsePayload(payload) {
  if (!payload) {
    return {};
  }
  return safeJson(payload) || {};
}

function safeJson(value) {
  try {
    if (typeof value === "string") {
      return JSON.parse(value);
    }
    return JSON.parse(String.fromCharCode.apply(null, value));
  } catch (error) {
    return null;
  }
}

function userIdOf(presence) {
  return presence.userId || presence.user_id;
}

function usernameOf(presence) {
  return presence.username || presence.user_name || "Player";
}

function ctxUserId(ctx) {
  return ctx.userId || ctx.user_id || "";
}

function ctxUsername(ctx) {
  return ctx.username || ctx.user_name || "Player";
}
