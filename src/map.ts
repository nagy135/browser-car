type Blocker = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type Car = {
  x: number;
  y: number;
  heading: number;
  speed: number;
};

export type CarState = Car;

export type PlayerView = {
  car: CarState;
  name: string;
};

type Point = {
  x: number;
  y: number;
};

type Arrow = {
  x: number;
  y: number;
  angle: number;
};

type TrackPreset = {
  trackSurface: Blocker[];
  blockers: Blocker[];
  arrows: Arrow[];
};

const CAR_WIDTH = 4;
const CAR_HEIGHT = 6;
const CAR_COLLISION_SCALE = 0.8;
const COLLISION_BOUNCE_DISTANCE = 4;
const COLLISION_BOUNCE_STEPS = 4;

const FPS = 60;
const SPEED = 12;
const TURN_SPEED = Math.PI;
const BOOST_MULTIPLIER = 4;
const ZOOM_VIEWPORT_RATIO = 0.4;
const startPosition: Car = {
  x: 78,
  y: 86.5,
  heading: Math.PI / 2,
  speed: SPEED,
};

function createStartPosition(): Car {
  return { ...startPosition };
}

// Outer loop arrows shared by all tracks (counter-clockwise: →↑←↓)
const OUTER_ARROWS: Arrow[] = [
  // Bottom straight → right
  { x: 30, y: 89.5, angle: Math.PI / 2 },
  { x: 55, y: 89.5, angle: Math.PI / 2 },
  // Right side ↑ up
  { x: 89.5, y: 60, angle: 0 },
  { x: 89.5, y: 30, angle: 0 },
  // Top straight ← left
  { x: 60, y: 10.5, angle: -Math.PI / 2 },
  { x: 35, y: 10.5, angle: -Math.PI / 2 },
  // Left side ↓ down
  { x: 10.5, y: 40, angle: Math.PI },
  { x: 10.5, y: 65, angle: Math.PI },
];

const TRACK_PRESETS: TrackPreset[] = [
  {
    trackSurface: [
      { x: 5, y: 82, width: 90, height: 15 },
      { x: 82, y: 5, width: 15, height: 77 },
      { x: 5, y: 3, width: 29, height: 15 },
      { x: 18, y: 18, width: 64, height: 14 },
      { x: 62, y: 3, width: 20, height: 15 },
      { x: 36, y: 12, width: 28, height: 12 },
      { x: 18, y: 18, width: 16, height: 18 },
      { x: 66, y: 18, width: 16, height: 18 },
      { x: 44, y: 24, width: 12, height: 20 },
      { x: 3, y: 18, width: 15, height: 64 },
      { x: 82, y: 82, width: 15, height: 15 },
      { x: 82, y: 3, width: 15, height: 15 },
      { x: 3, y: 3, width: 15, height: 15 },
      { x: 3, y: 82, width: 15, height: 15 },
      { x: 18, y: 82, width: 64, height: 15 },
    ],
    blockers: [
      { x: 18, y: 32, width: 18, height: 36 },
      { x: 44, y: 30, width: 12, height: 38 },
      { x: 64, y: 32, width: 18, height: 36 },
      { x: 36, y: 48, width: 8, height: 20 },
      { x: 56, y: 48, width: 8, height: 20 },
      { x: 28, y: 18, width: 8, height: 10 },
      { x: 46, y: 18, width: 8, height: 10 },
      { x: 64, y: 18, width: 8, height: 10 },
      { x: 0, y: 0, width: 6, height: 6 },
      { x: 94, y: 0, width: 6, height: 6 },
      { x: 0, y: 94, width: 6, height: 6 },
      { x: 94, y: 94, width: 6, height: 6 },
      { x: 90, y: 50, width: 10, height: 10 },
      { x: 0, y: 35, width: 7, height: 12 },
      { x: 36, y: 6, width: 10, height: 5 },
      { x: 54, y: 6, width: 8, height: 5 },
      { x: 30, y: 88, width: 8, height: 12 },
    ],
    arrows: [
      ...OUTER_ARROWS,
      // Top crossover main line: enter from right, sweep left, then drop to left edge.
      { x: 72, y: 24, angle: -Math.PI / 2 },
      { x: 50, y: 24, angle: -Math.PI / 2 },
      { x: 24, y: 26, angle: Math.PI },
    ],
  },
  {
    // S-Curve Circuit — sweeping S through the interior with a narrow shortcut
    trackSurface: [
      { x: 5, y: 82, width: 90, height: 15 },
      { x: 82, y: 5, width: 15, height: 77 },
      { x: 5, y: 3, width: 77, height: 15 },
      { x: 3, y: 18, width: 15, height: 64 },
      { x: 82, y: 82, width: 15, height: 15 },
      { x: 82, y: 3, width: 15, height: 15 },
      { x: 3, y: 3, width: 15, height: 15 },
      { x: 3, y: 82, width: 15, height: 15 },
      { x: 18, y: 82, width: 64, height: 15 },
      // S-curve roads
      { x: 18, y: 18, width: 28, height: 14 },
      { x: 18, y: 32, width: 16, height: 18 },
      { x: 34, y: 38, width: 34, height: 14 },
      { x: 66, y: 52, width: 16, height: 18 },
      { x: 18, y: 66, width: 64, height: 12 },
      // Narrow shortcut corridor (7 units wide)
      { x: 46, y: 32, width: 7, height: 6 },
      { x: 46, y: 52, width: 7, height: 14 },
    ],
    blockers: [
      // Top-right block (forces left entry into S)
      { x: 46, y: 18, width: 36, height: 20 },
      // Bottom-left block (forces right exit from S)
      { x: 18, y: 50, width: 28, height: 16 },
      // Shortcut pinch walls (upper gap: x 46-53)
      { x: 34, y: 32, width: 12, height: 6 },
      { x: 53, y: 32, width: 13, height: 6 },
      // Shortcut pinch walls (lower gap: x 46-53)
      { x: 53, y: 52, width: 13, height: 14 },
      { x: 34, y: 52, width: 12, height: 14 },
      // Corner barriers
      { x: 0, y: 0, width: 6, height: 6 },
      { x: 94, y: 0, width: 6, height: 6 },
      { x: 0, y: 94, width: 6, height: 6 },
      { x: 94, y: 94, width: 6, height: 6 },
      // Outer wall pinch points
      { x: 0, y: 36, width: 7, height: 14 },
      { x: 90, y: 55, width: 10, height: 10 },
      { x: 40, y: 88, width: 10, height: 12 },
    ],
    arrows: [
      ...OUTER_ARROWS,
      // S-curve main line, anticlockwise from the top-right entry.
      { x: 30, y: 25, angle: -Math.PI / 2 },
      { x: 24, y: 42, angle: Math.PI },
      { x: 50, y: 44, angle: Math.PI / 2 },
      { x: 74, y: 60, angle: Math.PI },
      { x: 50, y: 72, angle: -Math.PI / 2 },
    ],
  },
  {
    trackSurface: [
      { x: 5, y: 82, width: 90, height: 15 },
      { x: 82, y: 5, width: 15, height: 77 },
      { x: 5, y: 3, width: 77, height: 15 },
      { x: 3, y: 18, width: 15, height: 64 },
      { x: 18, y: 18, width: 22, height: 16 },
      { x: 40, y: 18, width: 20, height: 16 },
      { x: 60, y: 18, width: 22, height: 16 },
      { x: 22, y: 34, width: 14, height: 34 },
      { x: 64, y: 34, width: 14, height: 34 },
      { x: 36, y: 46, width: 28, height: 12 },
      { x: 82, y: 82, width: 15, height: 15 },
      { x: 82, y: 3, width: 15, height: 15 },
      { x: 3, y: 3, width: 15, height: 15 },
      { x: 3, y: 82, width: 15, height: 15 },
      { x: 18, y: 82, width: 64, height: 15 },
    ],
    blockers: [
      { x: 18, y: 34, width: 18, height: 34 },
      { x: 64, y: 34, width: 18, height: 34 },
      { x: 40, y: 28, width: 20, height: 12 },
      { x: 40, y: 58, width: 20, height: 10 },
      { x: 30, y: 18, width: 6, height: 10 },
      { x: 64, y: 18, width: 6, height: 10 },
      { x: 46, y: 46, width: 8, height: 12 },
      { x: 0, y: 0, width: 6, height: 6 },
      { x: 94, y: 0, width: 6, height: 6 },
      { x: 0, y: 94, width: 6, height: 6 },
      { x: 94, y: 94, width: 6, height: 6 },
      { x: 0, y: 44, width: 8, height: 10 },
      { x: 90, y: 24, width: 10, height: 12 },
      { x: 90, y: 62, width: 10, height: 10 },
      { x: 28, y: 88, width: 8, height: 12 },
    ],
    arrows: [
      ...OUTER_ARROWS,
      // Twin-tower main line: sweep left on top, drop through center-left, exit right.
      { x: 50, y: 26, angle: -Math.PI / 2 },
      { x: 28, y: 52, angle: Math.PI },
      { x: 50, y: 52, angle: Math.PI / 2 },
      { x: 72, y: 44, angle: 0 },
    ],
  },
  {
    // Double Hairpin — two staggered bars create tight hairpin turns, narrow shortcut through center
    trackSurface: [
      { x: 5, y: 82, width: 90, height: 15 },
      { x: 82, y: 5, width: 15, height: 77 },
      { x: 5, y: 3, width: 77, height: 15 },
      { x: 3, y: 18, width: 15, height: 64 },
      { x: 82, y: 82, width: 15, height: 15 },
      { x: 82, y: 3, width: 15, height: 15 },
      { x: 3, y: 3, width: 15, height: 15 },
      { x: 3, y: 82, width: 15, height: 15 },
      { x: 18, y: 82, width: 64, height: 15 },
      // Upper section: road wraps around right-extending bar
      { x: 18, y: 18, width: 64, height: 12 },
      { x: 18, y: 30, width: 14, height: 14 },
      { x: 68, y: 30, width: 14, height: 14 },
      { x: 18, y: 40, width: 64, height: 12 },
      // Lower section: road wraps around left-extending bar
      { x: 18, y: 52, width: 14, height: 14 },
      { x: 68, y: 52, width: 14, height: 14 },
      { x: 18, y: 62, width: 64, height: 14 },
      // Narrow shortcut through center (7 units wide at x:47-54)
      { x: 47, y: 30, width: 7, height: 10 },
      { x: 47, y: 52, width: 7, height: 10 },
    ],
    blockers: [
      // Upper hairpin bar (extends from right, leaves gap on left for U-turn)
      { x: 32, y: 30, width: 15, height: 10 },
      { x: 54, y: 30, width: 14, height: 10 },
      // Lower hairpin bar (extends from left, leaves gap on right for U-turn)
      { x: 32, y: 52, width: 15, height: 10 },
      { x: 54, y: 52, width: 14, height: 10 },
      // Central island between hairpins
      { x: 32, y: 40, width: 36, height: 12 },
      // Corner barriers
      { x: 0, y: 0, width: 6, height: 6 },
      { x: 94, y: 0, width: 6, height: 6 },
      { x: 0, y: 94, width: 6, height: 6 },
      { x: 94, y: 94, width: 6, height: 6 },
      // Outer wall pinch points
      { x: 90, y: 40, width: 10, height: 12 },
      { x: 0, y: 44, width: 7, height: 10 },
      { x: 34, y: 88, width: 8, height: 12 },
      { x: 60, y: 88, width: 8, height: 12 },
    ],
    arrows: [
      ...OUTER_ARROWS,
      // Double hairpin main line runs anticlockwise through both switchbacks.
      { x: 50, y: 24, angle: -Math.PI / 2 },
      { x: 24, y: 37, angle: Math.PI },
      { x: 50, y: 46, angle: Math.PI / 2 },
      { x: 75, y: 59, angle: Math.PI },
      { x: 50, y: 69, angle: -Math.PI / 2 },
    ],
  },
  {
    trackSurface: [
      { x: 5, y: 82, width: 90, height: 15 },
      { x: 82, y: 5, width: 15, height: 77 },
      { x: 5, y: 3, width: 77, height: 15 },
      { x: 3, y: 18, width: 15, height: 64 },
      { x: 18, y: 18, width: 18, height: 14 },
      { x: 34, y: 18, width: 14, height: 22 },
      { x: 48, y: 26, width: 16, height: 14 },
      { x: 64, y: 18, width: 18, height: 14 },
      { x: 20, y: 40, width: 14, height: 18 },
      { x: 34, y: 48, width: 18, height: 12 },
      { x: 52, y: 40, width: 14, height: 18 },
      { x: 66, y: 48, width: 12, height: 14 },
      { x: 30, y: 60, width: 14, height: 14 },
      { x: 44, y: 66, width: 12, height: 8 },
      { x: 56, y: 60, width: 14, height: 14 },
      { x: 82, y: 82, width: 15, height: 15 },
      { x: 82, y: 3, width: 15, height: 15 },
      { x: 3, y: 3, width: 15, height: 15 },
      { x: 3, y: 82, width: 15, height: 15 },
      { x: 18, y: 82, width: 64, height: 15 },
    ],
    blockers: [
      { x: 18, y: 32, width: 10, height: 42 },
      { x: 72, y: 32, width: 10, height: 42 },
      { x: 38, y: 18, width: 10, height: 12 },
      { x: 52, y: 18, width: 10, height: 12 },
      { x: 30, y: 42, width: 10, height: 10 },
      { x: 60, y: 42, width: 10, height: 10 },
      { x: 42, y: 54, width: 14, height: 10 },
      { x: 34, y: 68, width: 10, height: 8 },
      { x: 56, y: 68, width: 10, height: 8 },
      { x: 0, y: 0, width: 6, height: 6 },
      { x: 94, y: 0, width: 6, height: 6 },
      { x: 0, y: 94, width: 6, height: 6 },
      { x: 94, y: 94, width: 6, height: 6 },
      { x: 90, y: 58, width: 10, height: 10 },
      { x: 0, y: 48, width: 8, height: 12 },
      { x: 26, y: 88, width: 8, height: 12 },
      { x: 64, y: 88, width: 8, height: 12 },
    ],
    arrows: [
      ...OUTER_ARROWS,
      // Zig-zag main line, keeping the overall lap anticlockwise.
      { x: 72, y: 24, angle: -Math.PI / 2 },
      { x: 56, y: 34, angle: Math.PI },
      { x: 40, y: 54, angle: -Math.PI / 2 },
      { x: 56, y: 70, angle: Math.PI / 2 },
      { x: 70, y: 56, angle: 0 },
    ],
  },
];

export const TRACK_PRESET_COUNT = TRACK_PRESETS.length;

export class Map {
  public width: number = 600; // pixels
  public height: number = 600; // pixels
  private lastUpdateTime: number | null = null;
  private steering = {
    left: false,
    right: false,
  };
  private boosting = false;
  private braking = false;
  private zoomedToCar = false;
  private paused = false;
  private started = false;
  private remoteCars = new globalThis.Map<string, PlayerView>();
  private localPlayerName = "You";
  private presetId = 0;
  private trackSurface: Blocker[] = [];
  private arrows: Arrow[] = [];
  public blockers: Blocker[] = [];

  public car: Car = createStartPosition();

  constructor() {
    console.log("map initialized");
    this.applyPreset(0);
    this.reset();
  }

  private applyPreset(presetId: number) {
    const preset = TRACK_PRESETS[presetId] ?? TRACK_PRESETS[0];

    this.presetId = presetId;
    this.trackSurface = preset.trackSurface.map((segment) => ({ ...segment }));
    this.blockers = preset.blockers.map((blocker) => ({ ...blocker }));
    this.arrows = preset.arrows.map((arrow) => ({ ...arrow }));
  }

  getPresetId() {
    return this.presetId;
  }

  setPreset(presetId: number) {
    const nextPresetId = Math.max(
      0,
      Math.min(presetId, TRACK_PRESETS.length - 1),
    );

    this.applyPreset(nextPresetId);
    this.reset();
  }

  reset() {
    this.car = createStartPosition();
    this.lastUpdateTime = null;
    this.started = false;
  }

  drawTrack(ctx: CanvasRenderingContext2D) {
    // Green grass background
    ctx.fillStyle = "#2d8a2d";
    ctx.fillRect(0, 0, this.width, this.height);

    // Draw asphalt road surface
    ctx.fillStyle = "#444";
    this.trackSurface.forEach((seg) => {
      ctx.fillRect(
        (seg.x / 100) * this.width,
        (seg.y / 100) * this.height,
        (seg.width / 100) * this.width,
        (seg.height / 100) * this.height,
      );
    });

    // Draw road edge lines (white)
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    this.trackSurface.forEach((seg) => {
      ctx.strokeRect(
        (seg.x / 100) * this.width,
        (seg.y / 100) * this.height,
        (seg.width / 100) * this.width,
        (seg.height / 100) * this.height,
      );
    });

    // Draw start/finish line
    const sfX = (84 / 100) * this.width;
    const sfY = (82 / 100) * this.height;
    const sfWidth = (2.5 / 100) * this.width;
    const sfHeight = (15 / 100) * this.height;
    const squareSize = sfWidth / 2;
    const rows = Math.ceil(sfHeight / squareSize);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < 2; col++) {
        ctx.fillStyle = (row + col) % 2 === 0 ? "#fff" : "#111";
        ctx.fillRect(
          sfX + col * squareSize,
          sfY + row * squareSize,
          squareSize,
          squareSize,
        );
      }
    }

    // Draw direction arrows on road
    this.arrows.forEach((arrow) => {
      const px = (arrow.x / 100) * this.width;
      const py = (arrow.y / 100) * this.height;
      const size = (2.5 / 100) * this.width;

      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(arrow.angle);
      ctx.fillStyle = "rgba(255, 255, 255, 0.18)";
      ctx.beginPath();
      ctx.moveTo(0, -size);
      ctx.lineTo(size * 0.7, size * 0.6);
      ctx.lineTo(0, size * 0.25);
      ctx.lineTo(-size * 0.7, size * 0.6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    });

    // Draw dashed center line on the bottom straight
    ctx.setLineDash([8, 8]);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const centerY = ((82 + 15 / 2) / 100) * this.height;
    ctx.moveTo((8 / 100) * this.width, centerY);
    ctx.lineTo((92 / 100) * this.width, centerY);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  drawBlockers(ctx: CanvasRenderingContext2D) {
    this.blockers.forEach((blocker) => {
      const bx = (blocker.x / 100) * this.width;
      const by = (blocker.y / 100) * this.height;
      const bw = (blocker.width / 100) * this.width;
      const bh = (blocker.height / 100) * this.height;

      // Infield blocks get grass + gravel look
      if (
        blocker.x >= 18 &&
        blocker.x < 82 &&
        blocker.y >= 18 &&
        blocker.y < 82
      ) {
        // Grass infield
        ctx.fillStyle = "#1a6e1a";
        ctx.fillRect(bx, by, bw, bh);
        // Gravel border (curb effect)
        ctx.strokeStyle = "#c44";
        ctx.lineWidth = 3;
        ctx.strokeRect(bx + 1.5, by + 1.5, bw - 3, bh - 3);
      } else {
        // Outer barriers - concrete wall look
        ctx.fillStyle = "#888";
        ctx.fillRect(bx, by, bw, bh);
        // Red-white curb stripes on top edge
        const stripeW = 6;
        for (let sx = 0; sx < bw; sx += stripeW * 2) {
          ctx.fillStyle = "#e22";
          ctx.fillRect(bx + sx, by, Math.min(stripeW, bw - sx), 3);
          ctx.fillStyle = "#fff";
          ctx.fillRect(
            bx + sx + stripeW,
            by,
            Math.min(stripeW, bw - sx - stripeW),
            3,
          );
        }
      }
    });
  }

  drawCar(ctx: CanvasRenderingContext2D, car: CarState, bodyColor: string) {
    const topLeftX = car.x - CAR_WIDTH / 2;
    const topLeftY = car.y - CAR_HEIGHT / 2;
    const carX = (topLeftX / 100) * this.width;
    const carY = (topLeftY / 100) * this.height;
    const carWidth = (CAR_WIDTH / 100) * this.width;
    const carHeight = (CAR_HEIGHT / 100) * this.height;
    const centerX = carX + carWidth / 2;
    const centerY = carY + carHeight / 2;

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(car.heading);

    ctx.fillStyle = bodyColor;

    ctx.fillRect(-carWidth / 2, -carHeight / 2, carWidth, carHeight);

    ctx.fillStyle = "#ffd54a";
    ctx.fillRect(
      -carWidth * 0.35,
      -carHeight / 2,
      carWidth * 0.25,
      carHeight * 0.18,
    );
    ctx.fillRect(
      carWidth * 0.1,
      -carHeight / 2,
      carWidth * 0.25,
      carHeight * 0.18,
    );

    ctx.restore();
  }

  drawCarLabel(ctx: CanvasRenderingContext2D, car: CarState, name: string) {
    const labelX = (car.x / 100) * this.width;
    const labelY = ((car.y - CAR_HEIGHT / 2 - 2.4) / 100) * this.height;

    ctx.save();
    ctx.font = "bold 13px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";

    const textWidth = ctx.measureText(name).width;
    ctx.fillStyle = "rgba(0, 0, 0, 0.72)";
    ctx.fillRect(labelX - textWidth / 2 - 6, labelY - 17, textWidth + 12, 18);
    ctx.fillStyle = "#fff";
    ctx.fillText(name, labelX, labelY - 3);
    ctx.restore();
  }

  setCarState(car: CarState) {
    this.car = { ...car };
    this.lastUpdateTime = null;
  }

  getCarState(): CarState {
    return { ...this.car };
  }

  setLocalPlayerName(name: string) {
    this.localPlayerName = name;
  }

  setRemoteCars(cars: Record<string, PlayerView>) {
    this.remoteCars = new globalThis.Map(
      Object.entries(cars).map(([id, player]) => [
        id,
        {
          car: { ...player.car },
          name: player.name,
        },
      ]),
    );
  }

  setRemoteCar(id: string, player: PlayerView) {
    this.remoteCars.set(id, {
      car: { ...player.car },
      name: player.name,
    });
  }

  stop() {
    this.started = false;
    this.lastUpdateTime = null;
  }

  setSteering(left: boolean, right: boolean) {
    this.steering.left = left;
    this.steering.right = right;
  }

  setBoosting(boosting: boolean) {
    this.boosting = boosting;
  }

  setBraking(braking: boolean) {
    this.braking = braking;
  }

  toggleZoom() {
    this.zoomedToCar = !this.zoomedToCar;
  }

  togglePause() {
    this.paused = !this.paused;
    this.lastUpdateTime = null;
  }

  start() {
    this.started = true;
    this.lastUpdateTime = null;
  }

  move(now: number) {
    if (this.lastUpdateTime === null) {
      this.lastUpdateTime = now;
      return;
    }

    const deltaTime = (now - this.lastUpdateTime) / 1000;
    const deltaFrames = deltaTime * FPS;
    const speed = this.braking
      ? 0
      : this.boosting
        ? this.car.speed * BOOST_MULTIPLIER
        : this.car.speed;
    const distance = (speed / FPS) * deltaFrames;
    const turnDirection =
      Number(this.steering.right) - Number(this.steering.left);

    this.car.heading += turnDirection * TURN_SPEED * deltaTime;

    this.car.x += Math.sin(this.car.heading) * distance;
    this.car.y -= Math.cos(this.car.heading) * distance;

    this.lastUpdateTime = now;
  }

  bounceBack() {
    const stepDistance = COLLISION_BOUNCE_DISTANCE / COLLISION_BOUNCE_STEPS;
    let safestCar = { ...this.car };

    for (let step = 1; step <= COLLISION_BOUNCE_STEPS; step += 1) {
      const nextCar = {
        ...this.car,
        x: this.car.x - Math.sin(this.car.heading) * stepDistance * step,
        y: this.car.y + Math.cos(this.car.heading) * stepDistance * step,
      };

      if (this.collides(nextCar)) {
        break;
      }

      safestCar = nextCar;
    }

    this.car = safestCar;
    this.lastUpdateTime = null;
  }

  getCarCorners(scale = 1, car: Car = this.car): Point[] {
    const halfWidth = (CAR_WIDTH * scale) / 2;
    const halfHeight = (CAR_HEIGHT * scale) / 2;
    const sin = Math.sin(car.heading);
    const cos = Math.cos(car.heading);

    return [
      { x: -halfWidth, y: -halfHeight },
      { x: halfWidth, y: -halfHeight },
      { x: halfWidth, y: halfHeight },
      { x: -halfWidth, y: halfHeight },
    ].map((point) => ({
      x: car.x + point.x * cos - point.y * sin,
      y: car.y + point.x * sin + point.y * cos,
    }));
  }

  getPolygonAxes(points: Point[]): Point[] {
    return points.map((point, index) => {
      const nextPoint = points[(index + 1) % points.length];
      const edgeX = nextPoint.x - point.x;
      const edgeY = nextPoint.y - point.y;
      const length = Math.hypot(edgeX, edgeY);

      return {
        x: -edgeY / length,
        y: edgeX / length,
      };
    });
  }

  projectPolygon(points: Point[], axis: Point) {
    const projections = points.map(
      (point) => point.x * axis.x + point.y * axis.y,
    );

    return {
      min: Math.min(...projections),
      max: Math.max(...projections),
    };
  }

  polygonsOverlap(first: Point[], second: Point[]) {
    const axes = [
      ...this.getPolygonAxes(first),
      ...this.getPolygonAxes(second),
    ];

    return axes.every((axis) => {
      const firstProjection = this.projectPolygon(first, axis);
      const secondProjection = this.projectPolygon(second, axis);

      return (
        firstProjection.max >= secondProjection.min &&
        secondProjection.max >= firstProjection.min
      );
    });
  }

  collides(car: Car = this.car) {
    const carCorners = this.getCarCorners(CAR_COLLISION_SCALE, car);

    if (
      carCorners.some(
        (corner) =>
          corner.x < 0 || corner.x > 100 || corner.y < 0 || corner.y > 100,
      )
    ) {
      return true;
    }

    return this.blockers.some((blocker) => {
      const blockerCorners = [
        { x: blocker.x, y: blocker.y },
        { x: blocker.x + blocker.width, y: blocker.y },
        { x: blocker.x + blocker.width, y: blocker.y + blocker.height },
        { x: blocker.x, y: blocker.y + blocker.height },
      ];

      return this.polygonsOverlap(carCorners, blockerCorners);
    });
  }

  collision() {
    return this.collides();
  }

  draw(ctx: CanvasRenderingContext2D, now: number) {
    ctx.clearRect(0, 0, this.width, this.height);

    if (this.started && !this.paused) {
      const previousCar = { ...this.car };
      this.move(now);

      if (this.collision()) {
        this.car = previousCar;
        this.bounceBack();
      }
    }

    ctx.save();

    if (this.zoomedToCar) {
      const viewportWidth = this.width * ZOOM_VIEWPORT_RATIO;
      const viewportHeight = this.height * ZOOM_VIEWPORT_RATIO;
      const carX = (this.car.x / 100) * this.width;
      const carY = (this.car.y / 100) * this.height;
      const left = Math.max(
        0,
        Math.min(carX - viewportWidth / 2, this.width - viewportWidth),
      );
      const top = Math.max(
        0,
        Math.min(carY - viewportHeight / 2, this.height - viewportHeight),
      );
      const scale = 1 / ZOOM_VIEWPORT_RATIO;

      ctx.scale(scale, scale);
      ctx.translate(-left, -top);
    }

    this.drawTrack(ctx);
    this.drawBlockers(ctx);
    this.remoteCars.forEach((player) => {
      this.drawCar(ctx, player.car, "#111");
      this.drawCarLabel(ctx, player.car, player.name);
    });
    this.drawCar(ctx, this.car, "#f00");
    this.drawCarLabel(ctx, this.car, this.localPlayerName);

    ctx.restore();

    if (this.paused) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 48px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Paused", this.width / 2, this.height / 2);
    }
  }
}
