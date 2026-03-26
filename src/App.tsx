import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { Map, type CarState } from "./map";

const map = new Map();

type NetworkPlayer = {
  id: string;
  car: CarState;
};

type WelcomePayload = {
  id: string;
  players: NetworkPlayer[];
  countdownStartAt: number | null;
};

type MatchPayload = {
  startAt: number;
  players: NetworkPlayer[];
};

function splitPlayers(players: NetworkPlayer[], localPlayerId: string | null) {
  const remoteCars: Record<string, CarState> = {};

  players.forEach((player) => {
    if (player.id === localPlayerId) {
      map.setCarState(player.car);
      return;
    }

    remoteCars[player.id] = player.car;
  });

  map.setRemoteCars(remoteCars);
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [connectionLabel, setConnectionLabel] = useState("connecting");
  const [playerCount, setPlayerCount] = useState(0);
  const [centerMessage, setCenterMessage] = useState("");
  const socketUrl = import.meta.env.VITE_SOCKET_URL ?? window.location.origin;

  useEffect(() => {
    const canvas = canvasRef.current;
    let localPlayerId: string | null = null;
    let countdownTimer = 0;
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

    const clearCountdown = () => {
      window.clearInterval(countdownTimer);
      countdownTimer = 0;
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

    const runCountdown = (startAt: number, players: NetworkPlayer[]) => {
      clearCountdown();
      resetInputs();
      map.stop();
      splitPlayers(players, localPlayerId);

      const updateCountdown = () => {
        const remainingSeconds = Math.max(
          0,
          Math.ceil((startAt - Date.now()) / 1000),
        );

        if (remainingSeconds === 0) {
          clearCountdown();
          setCenterMessage("GO!");
          map.start();
          window.setTimeout(() => {
            setCenterMessage("");
          }, 800);
          return;
        }

        setCenterMessage(`New match in ${remainingSeconds}`);
      };

      updateCountdown();
      countdownTimer = window.setInterval(updateCountdown, 100);
    };

    const beginIdleState = () => {
      clearCountdown();
      resetInputs();
      map.stop();
      setCenterMessage("");
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
      splitPlayers(payload.players, localPlayerId);

      if (payload.countdownStartAt) {
        runCountdown(payload.countdownStartAt, payload.players);
        return;
      }

      beginIdleState();
    });

    socket.on("players", (players: NetworkPlayer[]) => {
      setPlayerCount(players.length);
      splitPlayers(players, localPlayerId);
    });

    socket.on("player:pose", (player: NetworkPlayer) => {
      if (player.id === localPlayerId) {
        return;
      }

      map.setRemoteCar(player.id, player.car);
    });

    socket.on("match:countdown", (payload: MatchPayload) => {
      setPlayerCount(payload.players.length);
      runCountdown(payload.startAt, payload.players);
    });

    socket.on("match:go", (payload: { players: NetworkPlayer[] }) => {
      clearCountdown();
      splitPlayers(payload.players, localPlayerId);
      map.start();
      setCenterMessage("GO!");
      window.setTimeout(() => {
        setCenterMessage("");
      }, 800);
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

      if (key === "s" && !event.repeat) {
        socket.emit("match:start");
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
      socket.emit("pose", map.getCarState());
      frameId = window.requestAnimationFrame(render);
    };

    frameId = window.requestAnimationFrame(render);

    return () => {
      window.cancelAnimationFrame(frameId);
      clearCountdown();
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      socket.disconnect();
    };
  }, [socketUrl]);

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
          padding: "8px 12px",
          background: "rgba(0, 0, 0, 0.72)",
          color: "#fff",
          borderRadius: 8,
          fontFamily: "monospace",
          fontSize: 13,
          lineHeight: 1.4,
        }}
      >
        <div>socket: {connectionLabel}</div>
        <div>players: {playerCount}</div>
        <div>S: new match</div>
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
