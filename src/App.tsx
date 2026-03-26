import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { Map, type CarState } from "./map";

const map = new Map();

type NetworkPlayer = {
  id: string;
  car: CarState;
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
  const socketUrl = import.meta.env.VITE_SOCKET_URL ?? window.location.origin;

  useEffect(() => {
    const canvas = canvasRef.current;
    let localPlayerId: string | null = null;
    const pressedKeys = {
      left: false,
      right: false,
      boost: false,
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

    socket.on("connect", () => {
      setConnectionLabel("connected");
    });

    socket.on("disconnect", () => {
      setConnectionLabel("disconnected");
      setPlayerCount(0);
      map.setRemoteCars({});
    });

    socket.on("welcome", (payload: { id: string; players: NetworkPlayer[] }) => {
      localPlayerId = payload.id;
      setConnectionLabel(`connected as ${payload.id.slice(0, 6)}`);
      setPlayerCount(payload.players.length);
      splitPlayers(payload.players, localPlayerId);
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

    const handleCanvasClick = () => {
      map.start();
      socket.emit("input", { started: true });
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();

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
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    canvas.addEventListener("click", handleCanvasClick);

    let frameId = 0;

    const render = (now: number) => {
      map.draw(ctx, now);
      socket.emit("pose", map.getCarState());
      frameId = window.requestAnimationFrame(render);
    };

    frameId = window.requestAnimationFrame(render);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      canvas.removeEventListener("click", handleCanvasClick);
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
      </div>
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
