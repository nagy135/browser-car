import { createServer } from "node:http";
import { Server } from "socket.io";

type ClientInput = {
  left: boolean;
  right: boolean;
  boost: boolean;
  started: boolean;
};

type CarState = {
  x: number;
  y: number;
  heading: number;
  speed: number;
};

type PlayerState = {
  id: string;
  name: string;
  connectedAt: number;
  input: ClientInput;
  car: CarState;
};

type ChatMessage = {
  id: string;
  playerId: string;
  playerName: string;
  text: string;
  sentAt: number;
};

const defaultInput: ClientInput = {
  left: false,
  right: false,
  boost: false,
  started: false,
};

const port = Number(process.env.PORT ?? 3001);
const origins = (process.env.ALLOWED_ORIGIN ?? "*")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const players = new Map<string, PlayerState>();
const chatHistory: ChatMessage[] = [];
let matchPreparing = false;
let nextChatMessageId = 1;

function createSpawnPosition(index: number): CarState {
  const row = index % 2;
  const column = Math.floor(index / 2);

  return {
    x: 78 - column * 8,
    y: 86.5 + row * 5,
    heading: Math.PI / 2,
    speed: 12,
  };
}

function resetPlayersForNewMatch() {
  [...players.values()]
    .sort((first, second) => first.connectedAt - second.connectedAt)
    .forEach((player, index) => {
      player.car = createSpawnPosition(index);
      player.input = { ...defaultInput };
    });
}

function beginMatchCountdown() {
  resetPlayersForNewMatch();
  matchPreparing = true;

  io.emit("match:prepare", {
    players: serializePlayers(),
  });

  setTimeout(() => {
    matchPreparing = false;
  }, 3000);
}

function serializePlayers() {
  return [...players.values()].map(({ id, name, connectedAt, input, car }) => ({
    id,
    name,
    connectedAt,
    input,
    car,
  }));
}

function sanitizePlayerName(name: string) {
  const normalizedName = name.trim().replace(/\s+/g, " ").slice(0, 24);

  return normalizedName || null;
}

function createDefaultName(playerId: string) {
  return `Guest-${playerId.slice(0, 4)}`;
}

function createChatMessage(playerId: string, playerName: string, text: string): ChatMessage {
  const message: ChatMessage = {
    id: `m${nextChatMessageId}`,
    playerId,
    playerName,
    text,
    sentAt: Date.now(),
  };

  nextChatMessageId += 1;
  chatHistory.push(message);

  if (chatHistory.length > 30) {
    chatHistory.shift();
  }

  return message;
}

const httpServer = createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(
      JSON.stringify({
        ok: true,
        players: players.size,
      }),
    );
    return;
  }

  response.writeHead(404, { "Content-Type": "application/json" });
  response.end(JSON.stringify({ ok: false }));
});

const io = new Server(httpServer, {
  cors: {
    origin: origins.length === 1 && origins[0] === "*" ? true : origins,
    credentials: true,
  },
});

io.on("connection", (socket) => {
  const player: PlayerState = {
    id: socket.id,
    name: createDefaultName(socket.id),
    connectedAt: Date.now(),
    input: { ...defaultInput },
    car: createSpawnPosition(players.size),
  };

  players.set(socket.id, player);

  socket.emit("welcome", {
    id: socket.id,
    players: serializePlayers(),
    chatHistory,
  });

  io.emit("players", serializePlayers());

  socket.on("input", (input: Partial<ClientInput>) => {
    const existingPlayer = players.get(socket.id);

    if (!existingPlayer) {
      return;
    }

    existingPlayer.input = {
      ...existingPlayer.input,
      ...input,
    };

    socket.broadcast.emit("player:input", {
      id: socket.id,
      input: existingPlayer.input,
    });
  });

  socket.on("pose", (car: CarState) => {
    const existingPlayer = players.get(socket.id);

    if (!existingPlayer) {
      return;
    }

    if (matchPreparing) {
      return;
    }

    existingPlayer.car = car;

    socket.broadcast.emit("player:pose", {
      id: socket.id,
      name: existingPlayer.name,
      car,
    });
  });

  socket.on("match:start", (ack?: (payload: { ok: true }) => void) => {
    beginMatchCountdown();
    ack?.({ ok: true });
  });

  socket.on("player:name", (name: string) => {
    const existingPlayer = players.get(socket.id);

    if (!existingPlayer) {
      return;
    }

    existingPlayer.name = sanitizePlayerName(name) ?? createDefaultName(socket.id);
    io.emit("players", serializePlayers());
  });

  socket.on("chat:message", (text: string) => {
    const existingPlayer = players.get(socket.id);
    const normalizedText = text.trim().slice(0, 240);

    if (!existingPlayer || !normalizedText) {
      return;
    }

    const message = createChatMessage(
      socket.id,
      existingPlayer.name,
      normalizedText,
    );
    io.emit("chat:message", message);
  });

  socket.on("disconnect", () => {
    players.delete(socket.id);
    io.emit("players", serializePlayers());
  });
});

httpServer.listen(port, "0.0.0.0", () => {
  console.log(`socket server listening on ${port}`);
});
