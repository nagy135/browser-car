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

const FPS = 60;
const SPEED = 12;
const TURN_SPEED = Math.PI;
const BOOST_MULTIPLIER = 4;
const ZOOM_VIEWPORT_RATIO = 0.4;
const startPosition: Car = {
  x: 5,
  y: 85,
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
  public blockers: Blocker[] = [
    {
      x: 10, // percentage
      y: 10, // percentage
      width: 80, // percentage
      height: 80, // percentage
    },
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

  drawBlockers(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = "#111";

    this.blockers.forEach((blocker) => {
      ctx.fillRect(
        (blocker.x / 100) * this.width,
        (blocker.y / 100) * this.height,
        (blocker.width / 100) * this.width,
        (blocker.height / 100) * this.height,
      );
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

  getCarCorners(): Point[] {
    const halfWidth = CAR_WIDTH / 2;
    const halfHeight = CAR_HEIGHT / 2;
    const sin = Math.sin(this.car.heading);
    const cos = Math.cos(this.car.heading);

    return [
      { x: -halfWidth, y: -halfHeight },
      { x: halfWidth, y: -halfHeight },
      { x: halfWidth, y: halfHeight },
      { x: -halfWidth, y: halfHeight },
    ].map((point) => ({
      x: this.car.x + point.x * cos - point.y * sin,
      y: this.car.y + point.x * sin + point.y * cos,
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

  collision() {
    const carCorners = this.getCarCorners();

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

  draw(ctx: CanvasRenderingContext2D, now: number) {
    ctx.clearRect(0, 0, this.width, this.height);

    if (this.started && !this.paused) {
      this.move(now);

      if (this.collision()) {
        this.reset();
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
