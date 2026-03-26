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

type Point = {
  x: number;
  y: number;
};

const CAR_WIDTH = 4;
const CAR_HEIGHT = 6;
const CAR_COLLISION_SCALE = 0.8;
const COLLISION_BOUNCE_DISTANCE = 8;
const COLLISION_BOUNCE_STEPS = 8;

const FPS = 60;
const SPEED = 12;
const TURN_SPEED = Math.PI;
const BOOST_MULTIPLIER = 4;
const ZOOM_VIEWPORT_RATIO = 0.4;
const startPosition: Car = {
  x: 50,
  y: 90,
  heading: 0,
  speed: SPEED,
};

function createStartPosition(): Car {
  return { ...startPosition };
}

export class Map {
  public width: number = 600; // pixels
  public height: number = 600; // pixels
  private lastUpdateTime: number | null = null;
  private steering = {
    left: false,
    right: false,
  };
  private boosting = false;
  private zoomedToCar = false;
  private paused = false;
  private started = false;

  // Track road surface segments (visual only, percentage coords)
  private trackSurface: Blocker[] = [
    // Bottom straight
    { x: 5, y: 82, width: 90, height: 15 },
    // Right side
    { x: 82, y: 5, width: 15, height: 77 },
    // Top straight
    { x: 5, y: 3, width: 77, height: 15 },
    // Left side
    { x: 3, y: 18, width: 15, height: 64 },
    // Bottom-right corner
    { x: 82, y: 82, width: 15, height: 15 },
    // Top-right corner
    { x: 82, y: 3, width: 15, height: 15 },
    // Top-left corner
    { x: 3, y: 3, width: 15, height: 15 },
    // Bottom-left corner
    { x: 3, y: 82, width: 15, height: 15 },
    // Pit lane extension (bottom)
    { x: 18, y: 82, width: 64, height: 15 },
  ];

  // Collision blockers forming the track walls
  public blockers: Blocker[] = [
    // === INFIELD (inner walls) ===
    // Main infield - L-shaped for interesting layout
    { x: 18, y: 18, width: 30, height: 50 },  // left infield
    { x: 48, y: 18, width: 34, height: 25 },   // top-right infield
    { x: 62, y: 43, width: 20, height: 25 },   // right infield extension
    { x: 48, y: 55, width: 14, height: 13 },   // small connecting block

    // === OUTER WALLS (tighten corners, create features) ===
    // Top-left corner block
    { x: 0, y: 0, width: 6, height: 6 },
    // Top-right corner block
    { x: 94, y: 0, width: 6, height: 6 },
    // Bottom-left corner block
    { x: 0, y: 94, width: 6, height: 6 },
    // Bottom-right corner block
    { x: 94, y: 94, width: 6, height: 6 },

    // === CHICANES ===
    // Right-side chicane (outer wall pushes in)
    { x: 90, y: 50, width: 10, height: 10 },
    // Left-side chicane (outer wall pushes in)
    { x: 0, y: 35, width: 7, height: 12 },
    // Top chicane island
    { x: 40, y: 6, width: 10, height: 5 },
    // Bottom straight narrowing
    { x: 30, y: 88, width: 8, height: 12 },
  ];

  public car: Car = createStartPosition();

  constructor() {
    console.log("map initialized");
    this.reset();
  }

  reset() {
    console.log("reset");
    this.car = createStartPosition();
    this.lastUpdateTime = null;
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
    const sfX = (46 / 100) * this.width;
    const sfY = (82 / 100) * this.height;
    const sfWidth = (8 / 100) * this.width;
    const sfHeight = (2 / 100) * this.height;
    const squareSize = sfHeight / 2;
    const cols = Math.ceil(sfWidth / squareSize);
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < cols; col++) {
        ctx.fillStyle = (row + col) % 2 === 0 ? "#fff" : "#111";
        ctx.fillRect(
          sfX + col * squareSize,
          sfY + row * squareSize,
          squareSize,
          squareSize,
        );
      }
    }

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
      if (blocker.x >= 18 && blocker.x < 82 && blocker.y >= 18 && blocker.y < 82) {
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
          ctx.fillRect(bx + sx + stripeW, by, Math.min(stripeW, bw - sx - stripeW), 3);
        }
      }
    });
  }

  drawCar(ctx: CanvasRenderingContext2D) {
    const topLeftX = this.car.x - CAR_WIDTH / 2;
    const topLeftY = this.car.y - CAR_HEIGHT / 2;
    const carX = (topLeftX / 100) * this.width;
    const carY = (topLeftY / 100) * this.height;
    const carWidth = (CAR_WIDTH / 100) * this.width;
    const carHeight = (CAR_HEIGHT / 100) * this.height;
    const centerX = carX + carWidth / 2;
    const centerY = carY + carHeight / 2;

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(this.car.heading);

    ctx.fillStyle = "#f00";

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

  setSteering(left: boolean, right: boolean) {
    this.steering.left = left;
    this.steering.right = right;
  }

  setBoosting(boosting: boolean) {
    this.boosting = boosting;
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
    const speed = this.boosting
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
    this.drawCar(ctx);

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

    if (!this.started) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 44px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Click To Start", this.width / 2, this.height / 2 - 18);
      ctx.font = "24px sans-serif";
      ctx.fillText(
        "A/D or arrows to steer, Space to boost",
        this.width / 2,
        this.height / 2 + 28,
      );
    }
  }
}
