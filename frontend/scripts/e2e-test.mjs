import { Client } from "@heroiclabs/nakama-js";

const client = new Client("defaultkey", "127.0.0.1", "7350", false, 7000, false);

const MOVE_OPCODE = 1;
const STATE_OPCODE = 2;

function decode(payload) {
  if (typeof payload === "string") {
    return JSON.parse(payload);
  }
  if (payload instanceof Uint8Array) {
    return JSON.parse(new TextDecoder().decode(payload));
  }
  return payload;
}

function waitForState(socket, label) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for state: ${label}`)), 5000);
    const previous = socket.onmatchdata;
    socket.onmatchdata = (message) => {
      if (typeof previous === "function") {
        previous(message);
      }
      if (message.op_code === STATE_OPCODE) {
        clearTimeout(timeout);
        resolve(decode(message.data));
      }
    };
  });
}

async function main() {
  const usernameA = `alpha_${Date.now()}`;
  const usernameB = `bravo_${Date.now()}`;
  const sessionA = await client.authenticateDevice(`e2e-a-${crypto.randomUUID()}`, true, usernameA);
  const sessionB = await client.authenticateDevice(`e2e-b-${crypto.randomUUID()}`, true, usernameB);

  const socketA = client.createSocket(false, false);
  const socketB = client.createSocket(false, false);

  await socketA.connect(sessionA, true);
  await socketB.connect(sessionB, true);

  socketA.onmatchdata = (message) => {
    if (message.op_code === STATE_OPCODE) {
      console.log("socketA", JSON.stringify(decode(message.data)));
    }
  };
  socketB.onmatchdata = (message) => {
    if (message.op_code === STATE_OPCODE) {
      console.log("socketB", JSON.stringify(decode(message.data)));
    }
  };

  const createRoom = await client.rpc(sessionA, "create_room", {
    roomName: "E2E Room",
    mode: "classic",
  });
  const { matchId } = decode(createRoom.payload);

  const initialA = waitForState(socketA, "initial A");
  const initialB = waitForState(socketB, "initial B");
  const joinedA = await socketA.joinMatch(matchId);
  const joinedB = await socketB.joinMatch(matchId);

  const [stateA, stateB] = await Promise.all([initialA, initialB]);
  console.log("joined", joinedA.match_id, joinedB.match_id);
  console.log("stateA", JSON.stringify(stateA));
  console.log("stateB", JSON.stringify(stateB));

  async function playMove(session, socket, position, label) {
    const nextState = waitForState(socketA, `${label} A`);
    const nextStateB = waitForState(socketB, `${label} B`);
    await client.rpc(session, "submit_move", { matchId, position });
    const [stateAfter] = await Promise.all([nextState, nextStateB]);
    console.log(label, JSON.stringify(stateAfter));
    return stateAfter;
  }

  await playMove(sessionA, socketA, 0, "move1");
  await playMove(sessionB, socketB, 3, "move2");
  await playMove(sessionA, socketA, 1, "move3");
  await playMove(sessionB, socketB, 4, "move4");
  const finalState = await playMove(sessionA, socketA, 2, "move5");
  console.log("finalState", JSON.stringify(finalState));

  const leaderboard = await client.rpc(sessionA, "get_leaderboard", {});
  console.log("leaderboard", JSON.stringify(decode(leaderboard.payload)));

  await socketA.leaveMatch(matchId);
  await socketB.leaveMatch(matchId);
  await socketA.disconnect();
  await socketB.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
