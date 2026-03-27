import { useEffect, useRef, useState, type FormEvent } from "react";
import { io } from "socket.io-client";
import { Map, type CarState, type PlayerView } from "./map";

const map = new Map();
const PLAYER_NAME_STORAGE_KEY = "browser-car-player-name";

type NetworkPlayer = {
  id: string;
  name: string;
  car: CarState;
};

type WelcomePayload = {
  id: string;
  players: NetworkPlayer[];
  chatHistory: ChatMessage[];
};

type MatchPayload = {
  players: NetworkPlayer[];
};

type ChatMessage = {
  id: string;
  playerId: string;
  playerName: string;
  text: string;
  sentAt: number;
};

const MATCH_COUNTDOWN_MS = 3000;

function splitPlayers(players: NetworkPlayer[], localPlayerId: string | null) {
  const remoteCars: Record<string, PlayerView> = {};

  players.forEach((player) => {
    if (player.id === localPlayerId) {
      map.setCarState(player.car);
      map.setLocalPlayerName(player.name);
      return;
    }

    remoteCars[player.id] = {
      car: player.car,
      name: player.name,
    };
  });

  map.setRemoteCars(remoteCars);
}

function getInitialPlayerName() {
  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem(PLAYER_NAME_STORAGE_KEY) ?? "";
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const socketRef = useRef<ReturnType<typeof io> | null>(null);
  const chatInputRef = useRef<HTMLInputElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const chatMessagesRef = useRef<HTMLDivElement | null>(null);
  const chatOpenRef = useRef(false);
  const wasChatOpenRef = useRef(false);
  const [connectionLabel, setConnectionLabel] = useState("connecting");
  const [playerCount, setPlayerCount] = useState(0);
  const [centerMessage, setCenterMessage] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [chatDraft, setChatDraft] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [playerName, setPlayerName] = useState(getInitialPlayerName);
  const [nameDraft, setNameDraft] = useState(getInitialPlayerName);
  const [menuOpen, setMenuOpen] = useState(false);
  const socketUrl = import.meta.env.VITE_SOCKET_URL ?? window.location.origin;

  useEffect(() => {
    chatOpenRef.current = chatOpen;

    if (chatOpen && !wasChatOpenRef.current) {
      window.setTimeout(() => {
        if (nameDraft.trim()) {
          chatInputRef.current?.focus();
          return;
        }

        nameInputRef.current?.focus();
      }, 0);
    }

    wasChatOpenRef.current = chatOpen;
  }, [chatOpen, nameDraft]);

  useEffect(() => {
    map.setLocalPlayerName(playerName || "You");
  }, [playerName]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const normalizedName = playerName.trim();

    if (normalizedName) {
      window.localStorage.setItem(PLAYER_NAME_STORAGE_KEY, normalizedName);
      return;
    }

    window.localStorage.removeItem(PLAYER_NAME_STORAGE_KEY);
  }, [playerName]);

  useEffect(() => {
    const socket = socketRef.current;

    if (!socket?.connected || !playerName.trim()) {
      return;
    }

    socket.emit("player:name", playerName);
  }, [playerName]);

  useEffect(() => {
    const container = chatMessagesRef.current;

    if (!container) {
      return;
    }

    container.scrollTop = container.scrollHeight;
  }, [chatMessages, chatOpen]);

  useEffect(() => {
    const canvas = canvasRef.current;
    let localPlayerId: string | null = null;
    let countdownTimer = 0;
    let matchPreparing = false;
    let goMessageTimer = 0;
    const pressedKeys = {
      left: false,
      right: false,
      boost: false,
      brake: false,
    };

    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext("2d");

    if (!ctx) {
      return;
    }

    const socket = io(socketUrl, {
      transports: ["websocket", "polling"],
    });

    socketRef.current = socket;

    const clearCountdown = () => {
      window.clearInterval(countdownTimer);
      countdownTimer = 0;
    };

    const clearGoMessage = () => {
      window.clearTimeout(goMessageTimer);
      goMessageTimer = 0;
    };

    const clearMatchPreparing = () => {
      matchPreparing = false;
    };

    const resetInputs = () => {
      pressedKeys.left = false;
      pressedKeys.right = false;
      pressedKeys.boost = false;
      pressedKeys.brake = false;
      map.setSteering(false, false);
      map.setBoosting(false);
      map.setBraking(false);
    };

    const finishCountdown = () => {
      clearCountdown();
      clearMatchPreparing();
      setCenterMessage("GO!");
      map.start();
      goMessageTimer = window.setTimeout(() => {
        setCenterMessage("");
      }, 800);
    };

    const runCountdown = (players: NetworkPlayer[]) => {
      clearCountdown();
      clearGoMessage();
      resetInputs();
      map.stop();
      splitPlayers(players, localPlayerId);
      matchPreparing = true;
      const startAt = Date.now() + MATCH_COUNTDOWN_MS;

      const updateCountdown = () => {
        const remainingSeconds = Math.max(
          0,
          Math.ceil((startAt - Date.now()) / 1000),
        );

        if (remainingSeconds === 0) {
          finishCountdown();
          return;
        }

        setCenterMessage(`New match in ${remainingSeconds}`);
      };

      updateCountdown();
      countdownTimer = window.setInterval(updateCountdown, 100);
    };

    const beginIdleState = () => {
      clearMatchPreparing();
      clearCountdown();
      clearGoMessage();
      setCenterMessage("");
      map.start();
    };

    const requestMatchStart = () => {
      if (matchPreparing) {
        return;
      }

      setCenterMessage("Starting match...");
      socket.timeout(1500).emit("match:start", (error: Error | null) => {
        if (!error) {
          return;
        }

        setCenterMessage("Could not start match");
        window.setTimeout(() => {
          setCenterMessage("");
        }, 1200);
      });
    };

    socket.on("connect", () => {
      setConnectionLabel("connected");
    });

    socket.on("disconnect", () => {
      setConnectionLabel("disconnected");
      setPlayerCount(0);
      map.setRemoteCars({});
      beginIdleState();
    });

    socket.on("welcome", (payload: WelcomePayload) => {
      localPlayerId = payload.id;
      setConnectionLabel(`connected as ${payload.id.slice(0, 6)}`);
      setPlayerCount(payload.players.length);
      setChatMessages(payload.chatHistory);

      const localPlayer = payload.players.find(
        (player) => player.id === payload.id,
      );

      if (localPlayer) {
        setPlayerName(localPlayer.name);
        setNameDraft(localPlayer.name);
      }

      splitPlayers(payload.players, localPlayerId);

      beginIdleState();
    });

    socket.on("chat:message", (message: ChatMessage) => {
      setChatMessages((currentMessages) => [...currentMessages, message]);

      if (!chatOpenRef.current && message.playerId !== localPlayerId) {
        setUnreadCount((count) => count + 1);
      }
    });

    socket.on("players", (players: NetworkPlayer[]) => {
      setPlayerCount(players.length);

      const localPlayer = players.find((player) => player.id === localPlayerId);

      if (localPlayer) {
        setPlayerName(localPlayer.name);
        setNameDraft(localPlayer.name);
      }

      splitPlayers(players, localPlayerId);
    });

    socket.on("player:pose", (player: NetworkPlayer) => {
      if (player.id === localPlayerId) {
        return;
      }

      map.setRemoteCar(player.id, {
        car: player.car,
        name: player.name,
      });
    });

    socket.on("match:prepare", (payload: MatchPayload) => {
      setPlayerCount(payload.players.length);
      runCountdown(payload.players);
    });

    socket.on("match:countdown", (payload: MatchPayload) => {
      setPlayerCount(payload.players.length);
      runCountdown(payload.players);
    });

    const syncSteering = () => {
      map.setSteering(pressedKeys.left, pressedKeys.right);
      socket.emit("input", {
        left: pressedKeys.left,
        right: pressedKeys.right,
      });
    };

    const syncBoost = () => {
      map.setBoosting(pressedKeys.boost);
      socket.emit("input", {
        boost: pressedKeys.boost,
      });
    };

    const syncBrake = () => {
      map.setBraking(pressedKeys.brake);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const target = event.target as HTMLElement | null;
      const isTypingTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        Boolean(target?.isContentEditable);

      if (key === "c" && !event.repeat && !isTypingTarget) {
        event.preventDefault();
        setChatOpen((isOpen) => {
          const nextOpen = !isOpen;

          if (nextOpen) {
            resetInputs();
            setUnreadCount(0);
          }

          return nextOpen;
        });
        return;
      }

      if (key === "escape" && chatOpenRef.current) {
        event.preventDefault();
        setChatOpen(false);
        return;
      }

      if (isTypingTarget || chatOpenRef.current) {
        return;
      }

      if (key === "s" && !event.repeat) {
        requestMatchStart();
      }

      if (key === "a" || event.key === "ArrowLeft") {
        pressedKeys.left = true;
        syncSteering();
      }

      if (key === "d" || event.key === "ArrowRight") {
        pressedKeys.right = true;
        syncSteering();
      }

      if (event.code === "Space") {
        pressedKeys.boost = true;
        syncBoost();
      }

      if (event.key === "ArrowDown") {
        pressedKeys.brake = true;
        syncBrake();
      }

      if (key === "t" && !event.repeat) {
        map.toggleZoom();
      }

      if (key === "p" && !event.repeat) {
        map.togglePause();
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();

      if (key === "a" || event.key === "ArrowLeft") {
        pressedKeys.left = false;
        syncSteering();
      }

      if (key === "d" || event.key === "ArrowRight") {
        pressedKeys.right = false;
        syncSteering();
      }

      if (event.code === "Space") {
        pressedKeys.boost = false;
        syncBoost();
      }

      if (event.key === "ArrowDown") {
        pressedKeys.brake = false;
        syncBrake();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    let frameId = 0;

    const render = (now: number) => {
      map.draw(ctx, now);
      if (!matchPreparing && countdownTimer === 0) {
        socket.emit("pose", map.getCarState());
      }
      frameId = window.requestAnimationFrame(render);
    };

    frameId = window.requestAnimationFrame(render);

    return () => {
      window.cancelAnimationFrame(frameId);
      clearMatchPreparing();
      clearCountdown();
      clearGoMessage();
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [socketUrl]);

  const handleChatSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedDraft = chatDraft.trim();

    if (!normalizedDraft) {
      return;
    }

    socketRef.current?.emit("chat:message", normalizedDraft);
    setChatDraft("");
  };

  const handleNameSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedName = nameDraft.trim().replace(/\s+/g, " ").slice(0, 24);

    if (!normalizedName) {
      nameInputRef.current?.focus();
      return;
    }

    setPlayerName(normalizedName);
    setNameDraft(normalizedName);
    map.setLocalPlayerName(normalizedName);
    socketRef.current?.emit("player:name", normalizedName);
    chatInputRef.current?.focus();
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 16,
          left: 16,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: 8,
        }}
      >
        <button
          type="button"
          onClick={() => setMenuOpen((isOpen) => !isOpen)}
          style={{
            width: 32,
            height: 32,
            display: "grid",
            placeItems: "center",
            padding: 0,
            borderRadius: 999,
            border: "1px solid rgba(255, 255, 255, 0.18)",
            background: "rgba(0, 0, 0, 0.72)",
            color: "#fff",
            fontFamily: "monospace",
            fontSize: 18,
            cursor: "pointer",
          }}
        >
          ?
        </button>
        {menuOpen ? (
          <div
            style={{
              padding: "10px 12px",
              background: "rgba(0, 0, 0, 0.72)",
              color: "#fff",
              borderRadius: 8,
              fontFamily: "monospace",
              fontSize: 13,
              lineHeight: 1.5,
              minWidth: 220,
            }}
          >
            <div>socket: {connectionLabel}</div>
            <div>players: {playerCount}</div>
            <div>name: {playerName || "Guest"}</div>
            <div style={{ marginTop: 8, opacity: 0.8 }}>binds</div>
            <div>`S`: new match</div>
            <div>`C`: chat{unreadCount > 0 ? ` (${unreadCount} new)` : ""}</div>
            <div>`Esc`: close chat</div>
            <div>`A/D` or arrows: steer</div>
            <div>`Space`: boost</div>
            <div>`ArrowDown`: brake</div>
            <div>`T`: toggle zoom</div>
            <div>`P`: pause</div>
          </div>
        ) : null}
      </div>
      {centerMessage ? (
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            padding: "14px 22px",
            background: "rgba(0, 0, 0, 0.72)",
            color: "#fff",
            borderRadius: 10,
            fontFamily: "monospace",
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: 1,
            pointerEvents: "none",
          }}
        >
          {centerMessage}
        </div>
      ) : null}
      {chatOpen ? (
        <div
          style={{
            position: "absolute",
            right: 16,
            bottom: 16,
            width: "min(360px, calc(100vw - 32px))",
            maxHeight: "min(320px, calc(100vh - 32px))",
            display: "flex",
            flexDirection: "column",
            gap: 10,
            padding: 14,
            background: "rgba(0, 0, 0, 0.78)",
            color: "#fff",
            borderRadius: 12,
            border: "1px solid rgba(255, 255, 255, 0.14)",
            fontFamily: "monospace",
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: 13,
              opacity: 0.9,
            }}
          >
            <span>socket chat</span>
            <span>C / Esc to close</span>
          </div>
          <form onSubmit={handleNameSubmit} style={{ display: "flex", gap: 8 }}>
            <input
              ref={nameInputRef}
              value={nameDraft}
              onChange={(event) =>
                setNameDraft(event.target.value.slice(0, 24))
              }
              placeholder="Set your name"
              style={{
                flex: 1,
                minWidth: 0,
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid rgba(255, 255, 255, 0.16)",
                background: "rgba(255, 255, 255, 0.08)",
                color: "#fff",
                fontFamily: "inherit",
                fontSize: 13,
                outline: "none",
              }}
            />
            <button
              type="submit"
              style={{
                padding: "10px 14px",
                borderRadius: 8,
                border: "1px solid rgba(255, 255, 255, 0.18)",
                background: "rgba(255, 255, 255, 0.12)",
                color: "#fff",
                fontFamily: "inherit",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Save
            </button>
          </form>
          <div
            ref={chatMessagesRef}
            style={{
              minHeight: 0,
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: 8,
              paddingRight: 4,
            }}
          >
            {chatMessages.length > 0 ? (
              chatMessages.map((message) => (
                <div
                  key={message.id}
                  style={{
                    padding: "8px 10px",
                    background: "rgba(255, 255, 255, 0.08)",
                    borderRadius: 8,
                    fontSize: 13,
                    lineHeight: 1.45,
                    wordBreak: "break-word",
                  }}
                >
                  <div style={{ opacity: 0.7, marginBottom: 2 }}>
                    {message.playerName}
                  </div>
                  <div>{message.text}</div>
                </div>
              ))
            ) : (
              <div style={{ fontSize: 13, opacity: 0.7 }}>No messages yet.</div>
            )}
          </div>
          <form onSubmit={handleChatSubmit} style={{ display: "flex", gap: 8 }}>
            <input
              ref={chatInputRef}
              value={chatDraft}
              onChange={(event) =>
                setChatDraft(event.target.value.slice(0, 240))
              }
              placeholder="Type a message and press Enter"
              style={{
                flex: 1,
                minWidth: 0,
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid rgba(255, 255, 255, 0.16)",
                background: "rgba(255, 255, 255, 0.08)",
                color: "#fff",
                fontFamily: "inherit",
                fontSize: 13,
                outline: "none",
              }}
            />
            <button
              type="submit"
              style={{
                padding: "10px 14px",
                borderRadius: 8,
                border: "1px solid rgba(255, 255, 255, 0.18)",
                background: "rgba(255, 255, 255, 0.12)",
                color: "#fff",
                fontFamily: "inherit",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Send
            </button>
          </form>
        </div>
      ) : null}
      <canvas
        ref={canvasRef}
        width={map.width}
        height={map.height}
        style={{ border: "1px solid black", cursor: "pointer" }}
      ></canvas>
    </div>
  );
}

export default App;
