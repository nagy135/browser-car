import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { io } from "socket.io-client";
import {
  Map,
  TRACK_PRESET_COUNT,
  type CarState,
  type PlayerView,
} from "./map";

const map = new Map();
const PLAYER_NAME_STORAGE_KEY = "browser-car-player-name";
const MATCH_COUNTDOWN_MS = 3000;

type NetworkPlayer = {
  id: string;
  name: string;
  car: CarState;
};

type WelcomePayload = {
  id: string;
  players: NetworkPlayer[];
  chatHistory: ChatMessage[];
  mapPreset: number;
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

type DriveInputs = {
  left: boolean;
  right: boolean;
  boost: boolean;
  brake: boolean;
};

type DriveInputKey = keyof DriveInputs;
type SteeringDirection = "left" | "right" | null;

type ControlButtonProps = {
  label: string;
  title: string;
  active?: boolean;
  badge?: number;
  onClick?: () => void;
  onPointerDown?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerUp?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerCancel?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onLostPointerCapture?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  children: ReactNode;
};

function createDriveInputs(): DriveInputs {
  return {
    left: false,
    right: false,
    boost: false,
    brake: false,
  };
}

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

function ControlIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function ControlButton({
  label,
  title,
  active = false,
  badge,
  onClick,
  onPointerDown,
  onPointerUp,
  onPointerCancel,
  onLostPointerCapture,
  children,
}: ControlButtonProps) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={(event) => {
        onClick?.();
        event.currentTarget.blur();
      }}
      onPointerDown={onPointerDown}
      onPointerUp={(event) => {
        onPointerUp?.(event);
        event.currentTarget.blur();
      }}
      onPointerCancel={(event) => {
        onPointerCancel?.(event);
        event.currentTarget.blur();
      }}
      onLostPointerCapture={(event) => {
        onLostPointerCapture?.(event);
        event.currentTarget.blur();
      }}
      style={{
        position: "relative",
        minWidth: 56,
        minHeight: 50,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        padding: "8px 10px",
        borderRadius: 14,
        border: active
          ? "1px solid rgba(255, 244, 185, 0.62)"
          : "1px solid rgba(255, 255, 255, 0.12)",
        background: active
          ? "linear-gradient(180deg, rgba(247, 198, 72, 0.28), rgba(0, 0, 0, 0.72))"
          : "linear-gradient(180deg, rgba(255, 255, 255, 0.12), rgba(0, 0, 0, 0.72))",
        color: "#f5f7ef",
        fontFamily: '"Courier New", monospace',
        fontSize: 9,
        letterSpacing: 1.1,
        textTransform: "uppercase",
        cursor: "pointer",
        boxShadow: active
          ? "0 10px 24px rgba(247, 198, 72, 0.18)"
          : "0 10px 24px rgba(0, 0, 0, 0.22)",
        touchAction: "none",
      }}
    >
      <span style={{ display: "grid", placeItems: "center" }}>{children}</span>
      <span>{label}</span>
      {badge && badge > 0 ? (
        <span
          style={{
            position: "absolute",
            top: 6,
            right: 6,
            minWidth: 18,
            height: 18,
            display: "grid",
            placeItems: "center",
            padding: "0 4px",
            borderRadius: 999,
            background: "#f15b4a",
            color: "#fff",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 0,
          }}
        >
          {badge}
        </span>
      ) : null}
    </button>
  );
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameAreaRef = useRef<HTMLDivElement | null>(null);
  const socketRef = useRef<ReturnType<typeof io> | null>(null);
  const chatInputRef = useRef<HTMLInputElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const chatMessagesRef = useRef<HTMLDivElement | null>(null);
  const chatOpenRef = useRef(false);
  const wasChatOpenRef = useRef(false);
  const keyboardInputsRef = useRef(createDriveInputs());
  const pointerInputsRef = useRef(createDriveInputs());
  const appliedInputsRef = useRef(createDriveInputs());
  const steeringPointerIdRef = useRef<number | null>(null);
  const matchPreparingRef = useRef(false);
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
  const [activeMapPreset, setActiveMapPreset] = useState(map.getPresetId());
  const [stageSize, setStageSize] = useState(map.width);
  const [driveState, setDriveState] = useState(createDriveInputs);
  const [zoomedToCar, setZoomedToCar] = useState(false);
  const [paused, setPaused] = useState(false);
  const socketUrl = import.meta.env.VITE_SOCKET_URL ?? window.location.origin;

  const blurButton = (
    event:
      | ReactMouseEvent<HTMLButtonElement>
      | ReactPointerEvent<HTMLButtonElement>,
  ) => {
    event.currentTarget.blur();
  };

  const applyDriveInputs = useCallback(() => {
    const keyboardInputs = keyboardInputsRef.current;
    const pointerInputs = pointerInputsRef.current;
    const nextInputs = {
      left: keyboardInputs.left || pointerInputs.left,
      right: keyboardInputs.right || pointerInputs.right,
      boost: keyboardInputs.boost || pointerInputs.boost,
      brake: keyboardInputs.brake || pointerInputs.brake,
    };
    const previousInputs = appliedInputsRef.current;

    if (
      previousInputs.left !== nextInputs.left ||
      previousInputs.right !== nextInputs.right
    ) {
      map.setSteering(nextInputs.left, nextInputs.right);
      socketRef.current?.emit("input", {
        left: nextInputs.left,
        right: nextInputs.right,
      });
    }

    if (previousInputs.boost !== nextInputs.boost) {
      map.setBoosting(nextInputs.boost);
      socketRef.current?.emit("input", {
        boost: nextInputs.boost,
      });
    }

    if (previousInputs.brake !== nextInputs.brake) {
      map.setBraking(nextInputs.brake);
    }

    appliedInputsRef.current = nextInputs;
    setDriveState((currentState) => {
      if (
        currentState.left === nextInputs.left &&
        currentState.right === nextInputs.right &&
        currentState.boost === nextInputs.boost &&
        currentState.brake === nextInputs.brake
      ) {
        return currentState;
      }

      return nextInputs;
    });
  }, []);

  const setKeyboardDriveInput = useCallback((key: DriveInputKey, value: boolean) => {
    if (keyboardInputsRef.current[key] === value) {
      return;
    }

    keyboardInputsRef.current = {
      ...keyboardInputsRef.current,
      [key]: value,
    };
    applyDriveInputs();
  }, [applyDriveInputs]);

  const setPointerDriveInput = useCallback((key: DriveInputKey, value: boolean) => {
    if (pointerInputsRef.current[key] === value) {
      return;
    }

    pointerInputsRef.current = {
      ...pointerInputsRef.current,
      [key]: value,
    };
    applyDriveInputs();
  }, [applyDriveInputs]);

  const setPointerSteeringDirection = useCallback((direction: SteeringDirection) => {
    const nextLeft = direction === "left";
    const nextRight = direction === "right";

    if (
      pointerInputsRef.current.left === nextLeft &&
      pointerInputsRef.current.right === nextRight
    ) {
      return;
    }

    pointerInputsRef.current = {
      ...pointerInputsRef.current,
      left: nextLeft,
      right: nextRight,
    };
    applyDriveInputs();
  }, [applyDriveInputs]);

  const resetInputs = useCallback(() => {
    keyboardInputsRef.current = createDriveInputs();
    pointerInputsRef.current = createDriveInputs();
    steeringPointerIdRef.current = null;
    applyDriveInputs();
  }, [applyDriveInputs]);

  const toggleChatPanel = useCallback(() => {
    setChatOpen((isOpen) => {
      const nextOpen = !isOpen;

      if (nextOpen) {
        resetInputs();
        setUnreadCount(0);
      }

      return nextOpen;
    });
  }, [resetInputs]);

  const openChatPanel = useCallback(() => {
    resetInputs();
    setUnreadCount(0);
    setChatOpen(true);
  }, [resetInputs]);

  const closeChatPanel = useCallback(() => {
    setChatOpen(false);
  }, []);

  const requestMatchStart = useCallback(() => {
    if (matchPreparingRef.current) {
      return;
    }

    setCenterMessage("Starting match...");
    socketRef.current?.timeout(1500).emit(
      "match:start",
      (error: Error | null) => {
        if (!error) {
          return;
        }

        setCenterMessage("Could not start match");
        window.setTimeout(() => {
          setCenterMessage("");
        }, 1200);
      },
    );
  }, []);

  const toggleZoom = useCallback(() => {
    map.toggleZoom();
    setZoomedToCar((current) => !current);
  }, []);

  const togglePause = useCallback(() => {
    map.togglePause();
    setPaused((current) => !current);
  }, []);

  const updateStageSize = useCallback(() => {
    const nextSize = Math.floor(
      Math.min(
        gameAreaRef.current?.clientWidth ?? map.width,
        gameAreaRef.current?.clientHeight ?? map.height,
        map.width,
      ),
    );

    if (nextSize > 0) {
      setStageSize(nextSize);
    }
  }, []);

  const getCanvasSteeringDirection = (
    event: ReactPointerEvent<HTMLCanvasElement>,
  ): SteeringDirection => {
    const rect = event.currentTarget.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;

    return pointerX < rect.width / 2 ? "left" : "right";
  };

  const handleCanvasPointerDown = (
    event: ReactPointerEvent<HTMLCanvasElement>,
  ) => {
    if (chatOpenRef.current) {
      return;
    }

    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    event.preventDefault();
    steeringPointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    setPointerSteeringDirection(getCanvasSteeringDirection(event));
  };

  const handleCanvasPointerMove = (
    event: ReactPointerEvent<HTMLCanvasElement>,
  ) => {
    if (steeringPointerIdRef.current !== event.pointerId) {
      return;
    }

    event.preventDefault();
    setPointerSteeringDirection(getCanvasSteeringDirection(event));
  };

  const releaseCanvasSteering = (
    event: ReactPointerEvent<HTMLCanvasElement>,
  ) => {
    if (steeringPointerIdRef.current !== event.pointerId) {
      return;
    }

    steeringPointerIdRef.current = null;
    setPointerSteeringDirection(null);
  };

  const createHoldButtonHandlers = (key: "boost" | "brake") => ({
    onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      setPointerDriveInput(key, true);
    },
    onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      setPointerDriveInput(key, false);
    },
    onPointerCancel: (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      setPointerDriveInput(key, false);
    },
    onLostPointerCapture: () => {
      setPointerDriveInput(key, false);
    },
  });

  const boostButtonHandlers = createHoldButtonHandlers("boost");
  const brakeButtonHandlers = createHoldButtonHandlers("brake");

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
    const frameId = window.requestAnimationFrame(updateStageSize);

    const observer = new ResizeObserver(() => {
      updateStageSize();
    });

    if (gameAreaRef.current) {
      observer.observe(gameAreaRef.current);
    }

    window.addEventListener("resize", updateStageSize);

    return () => {
      window.cancelAnimationFrame(frameId);
      observer.disconnect();
      window.removeEventListener("resize", updateStageSize);
    };
  }, [updateStageSize]);

  useEffect(() => {
    const canvas = canvasRef.current;
    let localPlayerId: string | null = null;
    let countdownTimer = 0;
    let goMessageTimer = 0;

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

    const finishCountdown = () => {
      clearCountdown();
      matchPreparingRef.current = false;
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
      matchPreparingRef.current = true;
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
      matchPreparingRef.current = false;
      clearCountdown();
      clearGoMessage();
      setCenterMessage("");
      map.start();
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
      map.setPreset(payload.mapPreset);
      setActiveMapPreset(payload.mapPreset);

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

    socket.on("map:preset", (presetId: number) => {
      map.setPreset(presetId);
      setActiveMapPreset(presetId);
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

    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const target = event.target as HTMLElement | null;
      const isTypingTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        Boolean(target?.isContentEditable);

      if (key === "c" && !event.repeat && !isTypingTarget) {
        event.preventDefault();
        toggleChatPanel();
        return;
      }

      if (key === "escape" && chatOpenRef.current) {
        event.preventDefault();
        closeChatPanel();
        return;
      }

      if (isTypingTarget || chatOpenRef.current) {
        return;
      }

      if (key === "s" && !event.repeat) {
        requestMatchStart();
      }

      if (key === "a" || event.key === "ArrowLeft") {
        setKeyboardDriveInput("left", true);
      }

      if (key === "d" || event.key === "ArrowRight") {
        setKeyboardDriveInput("right", true);
      }

      if (event.code === "Space") {
        setKeyboardDriveInput("boost", true);
      }

      if (event.key === "ArrowDown") {
        setKeyboardDriveInput("brake", true);
      }

      if (key === "t" && !event.repeat) {
        toggleZoom();
      }

      if (key === "p" && !event.repeat) {
        togglePause();
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();

      if (key === "a" || event.key === "ArrowLeft") {
        setKeyboardDriveInput("left", false);
      }

      if (key === "d" || event.key === "ArrowRight") {
        setKeyboardDriveInput("right", false);
      }

      if (event.code === "Space") {
        setKeyboardDriveInput("boost", false);
      }

      if (event.key === "ArrowDown") {
        setKeyboardDriveInput("brake", false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    let frameId = 0;

    const render = (now: number) => {
      map.draw(ctx, now);
      if (!matchPreparingRef.current && countdownTimer === 0) {
        socket.emit("pose", map.getCarState());
      }
      frameId = window.requestAnimationFrame(render);
    };

    frameId = window.requestAnimationFrame(render);

    return () => {
      window.cancelAnimationFrame(frameId);
      matchPreparingRef.current = false;
      clearCountdown();
      clearGoMessage();
      resetInputs();
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [
    closeChatPanel,
    requestMatchStart,
    resetInputs,
    setKeyboardDriveInput,
    socketUrl,
    toggleChatPanel,
    togglePause,
    toggleZoom,
  ]);

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

  const handleMapPresetSelect = (presetId: number) => {
    map.setPreset(presetId);
    setActiveMapPreset(presetId);
    socketRef.current?.emit("map:preset", presetId);
  };

  return (
    <div
      style={{
        minHeight: "100dvh",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: 12,
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          padding: 12,
          borderRadius: 22,
          background:
            "linear-gradient(180deg, rgba(7, 19, 14, 0.92), rgba(3, 8, 6, 0.88))",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          boxShadow: "0 18px 40px rgba(0, 0, 0, 0.3)",
          backdropFilter: "blur(14px)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                background: "rgba(255, 255, 255, 0.08)",
                color: "#eef4de",
                fontFamily: '"Courier New", monospace',
                fontSize: 11,
                letterSpacing: 0.8,
                textTransform: "uppercase",
              }}
            >
              socket {connectionLabel}
            </span>
            <span
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                background: "rgba(255, 255, 255, 0.08)",
                color: "#eef4de",
                fontFamily: '"Courier New", monospace',
                fontSize: 11,
                letterSpacing: 0.8,
                textTransform: "uppercase",
              }}
            >
              players {playerCount}
            </span>
            <span
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                background: "rgba(247, 198, 72, 0.14)",
                color: "#fff2c6",
                fontFamily: '"Courier New", monospace',
                fontSize: 11,
                letterSpacing: 0.8,
                textTransform: "uppercase",
              }}
            >
              driver {playerName || "Guest"}
            </span>
          </div>
          <button
            type="button"
            onClick={(event) => {
              setMenuOpen((isOpen) => !isOpen);
              blurButton(event);
            }}
            title="Show controls and game info"
            aria-label="Show controls and game info"
            style={{
              width: 40,
              height: 40,
              display: "grid",
              placeItems: "center",
              borderRadius: 14,
              border: "1px solid rgba(255, 255, 255, 0.12)",
              background: "rgba(255, 255, 255, 0.08)",
              color: "#eef4de",
              cursor: "pointer",
            }}
          >
            <ControlIcon>
              <circle cx="12" cy="12" r="8" />
              <path d="M12 10v5" />
              <path d="M12 7.5h.01" />
            </ControlIcon>
          </button>
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <ControlButton
            label="Match"
            title="Start a new match (S)"
            onClick={requestMatchStart}
          >
            <ControlIcon>
              <path d="M6 4v16" />
              <path d="M6 5h10l-2.5 4L16 13H6" />
            </ControlIcon>
          </ControlButton>
          <ControlButton
            label="Chat"
            title="Open chat (C)"
            active={chatOpen}
            badge={unreadCount}
            onClick={() => {
              if (chatOpen) {
                closeChatPanel();
                return;
              }

              openChatPanel();
            }}
          >
            <ControlIcon>
              <path d="M5 7.5A2.5 2.5 0 0 1 7.5 5h9A2.5 2.5 0 0 1 19 7.5v5A2.5 2.5 0 0 1 16.5 15H10l-4 4v-4H7.5A2.5 2.5 0 0 1 5 12.5z" />
            </ControlIcon>
          </ControlButton>
          <ControlButton
            label="Boost"
            title="Hold boost (Space)"
            active={driveState.boost}
            {...boostButtonHandlers}
          >
            <ControlIcon>
              <path d="M13 3 7 13h4l-1 8 7-11h-4l0-7Z" />
            </ControlIcon>
          </ControlButton>
          <ControlButton
            label="Brake"
            title="Hold brake (ArrowDown)"
            active={driveState.brake}
            {...brakeButtonHandlers}
          >
            <ControlIcon>
              <circle cx="12" cy="12" r="7" />
              <path d="M8 12h8" />
            </ControlIcon>
          </ControlButton>
          <ControlButton
            label="Zoom"
            title="Toggle zoom (T)"
            active={zoomedToCar}
            onClick={toggleZoom}
          >
            <ControlIcon>
              <circle cx="10.5" cy="10.5" r="4.5" />
              <path d="m15 15 4 4" />
              <path d="M10.5 8.5v4" />
              <path d="M8.5 10.5h4" />
            </ControlIcon>
          </ControlButton>
          <ControlButton
            label="Pause"
            title="Toggle pause (P)"
            active={paused}
            onClick={togglePause}
          >
            <ControlIcon>
              <path d="M9 7v10" />
              <path d="M15 7v10" />
              <rect x="5" y="4" width="14" height="16" rx="3" />
            </ControlIcon>
          </ControlButton>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              color: "rgba(245, 247, 239, 0.72)",
              fontFamily: '"Courier New", monospace',
              fontSize: 11,
              letterSpacing: 1,
              textTransform: "uppercase",
            }}
          >
            Tracks
          </span>
          {Array.from({ length: TRACK_PRESET_COUNT }, (_, index) => (
            <button
              key={index}
              type="button"
              onClick={() => handleMapPresetSelect(index)}
              onPointerUp={blurButton}
              title={`Switch to track ${index + 1}`}
              style={{
                width: 36,
                height: 36,
                display: "grid",
                placeItems: "center",
                padding: 0,
                borderRadius: 14,
                border:
                  activeMapPreset === index
                    ? "1px solid rgba(255, 244, 185, 0.62)"
                    : "1px solid rgba(255, 255, 255, 0.12)",
                background:
                  activeMapPreset === index
                    ? "linear-gradient(180deg, rgba(247, 198, 72, 0.26), rgba(0, 0, 0, 0.72))"
                    : "linear-gradient(180deg, rgba(255, 255, 255, 0.12), rgba(0, 0, 0, 0.72))",
                color: "#fff",
                fontFamily: '"Courier New", monospace',
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              {index + 1}
            </button>
          ))}
        </div>

        {menuOpen ? (
          <div
            style={{
              display: "grid",
              gap: 4,
              padding: "12px 14px",
              borderRadius: 16,
              background: "rgba(255, 255, 255, 0.07)",
              color: "#f5f7ef",
              fontFamily: '"Courier New", monospace',
              fontSize: 12,
              lineHeight: 1.55,
            }}
          >
            <div>Tap or click the left canvas half to steer left.</div>
            <div>Tap or click the right canvas half to steer right.</div>
            <div>Use the top buttons for match, chat, boost, brake, zoom, and pause.</div>
            <div>Keyboard still works: A/D or arrows, Space, ArrowDown, S, C, T, P.</div>
            <div>Layout scales to fullscreen mobile and smaller iframes without page scroll.</div>
          </div>
        ) : null}
      </div>

      <div
        ref={gameAreaRef}
        style={{
          position: "relative",
          flex: 1,
          minHeight: 0,
          display: "grid",
          placeItems: "center",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "relative",
            width: stageSize,
            height: stageSize,
            maxWidth: "100%",
            maxHeight: "100%",
            borderRadius: 24,
            padding: 8,
            background:
              "linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.02))",
            boxShadow: "0 18px 42px rgba(0, 0, 0, 0.28)",
          }}
        >
          {centerMessage ? (
            <div
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                transform: "translate(-50%, -50%)",
                zIndex: 2,
                padding: "14px 22px",
                background: "rgba(0, 0, 0, 0.76)",
                color: "#fff",
                borderRadius: 16,
                fontFamily: '"Courier New", monospace',
                fontSize: stageSize < 420 ? 22 : 28,
                fontWeight: 700,
                letterSpacing: 1,
                pointerEvents: "none",
                textAlign: "center",
                boxShadow: "0 12px 28px rgba(0, 0, 0, 0.28)",
              }}
            >
              {centerMessage}
            </div>
          ) : null}

          {chatOpen ? (
            <div
              style={{
                position: "absolute",
                right: 12,
                bottom: 12,
                zIndex: 3,
                width: "min(360px, calc(100% - 24px))",
                maxHeight: "min(320px, calc(100% - 24px))",
                display: "flex",
                flexDirection: "column",
                gap: 10,
                padding: 14,
                background: "rgba(0, 0, 0, 0.82)",
                color: "#fff",
                borderRadius: 18,
                border: "1px solid rgba(255, 255, 255, 0.14)",
                fontFamily: '"Courier New", monospace',
                boxSizing: "border-box",
                boxShadow: "0 18px 36px rgba(0, 0, 0, 0.32)",
                backdropFilter: "blur(10px)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  fontSize: 12,
                  opacity: 0.9,
                }}
              >
                <span>socket chat</span>
                <button
                  type="button"
                  onClick={(event) => {
                    closeChatPanel();
                    blurButton(event);
                  }}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: "inherit",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    fontSize: 12,
                  }}
                >
                  close
                </button>
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
                    borderRadius: 10,
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
                  onClick={blurButton}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 10,
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
                        borderRadius: 10,
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
                    borderRadius: 10,
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
                  onClick={blurButton}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 10,
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
            onPointerDown={handleCanvasPointerDown}
            onPointerMove={handleCanvasPointerMove}
            onPointerUp={releaseCanvasSteering}
            onPointerCancel={releaseCanvasSteering}
            onLostPointerCapture={releaseCanvasSteering}
            onContextMenu={(event) => event.preventDefault()}
            style={{
              width: "100%",
              height: "100%",
              display: "block",
              borderRadius: 18,
              border: "1px solid rgba(255, 255, 255, 0.2)",
              background: "#1c3122",
              cursor: "pointer",
              touchAction: "none",
            }}
          ></canvas>
        </div>
      </div>
    </div>
  );
}

export default App;
