import { useEffect, useRef } from "react";
import { Map } from "./map";

const map = new Map();

function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
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

    const syncSteering = () => {
      map.setSteering(pressedKeys.left, pressedKeys.right);
    };

    const syncBoost = () => {
      map.setBoosting(pressedKeys.boost);
    };

    const handleCanvasClick = () => {
      map.start();
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
      frameId = window.requestAnimationFrame(render);
    };

    frameId = window.requestAnimationFrame(render);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      canvas.removeEventListener("click", handleCanvasClick);
    };
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
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
