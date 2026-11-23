import { buildCarShapes, type CarShape } from "../../game/carDesign";

const BURST_SPIKES = 12;
const BURST_OUTER_RADIUS = 52;
const BURST_INNER_RADIUS = 34;
const BURST_FILL_TOP = "#ffd166";
const BURST_FILL_BOTTOM = "#e63946";
const OUTLINE_COLOR = "#0f1116";
const LOGO_BODY_COLOR = 0xe63946;
const LOGO_CAR_SCALE = 1.2;
const LOGO_CAR_TILT_DEG = -20;

function buildBurstPoints(
  spikes: number,
  outer: number,
  inner: number,
): string {
  const points: string[] = [];
  for (let index = 0; index < spikes * 2; index += 1) {
    const radius = index % 2 === 0 ? outer : inner;
    const angle = (Math.PI * index) / spikes;
    points.push(
      `${(radius * Math.cos(angle)).toFixed(2)},${(radius * Math.sin(angle)).toFixed(2)}`,
    );
  }
  return points.join(" ");
}

const BURST_POINTS = buildBurstPoints(
  BURST_SPIKES,
  BURST_OUTER_RADIUS,
  BURST_INNER_RADIUS,
);

const LOGO_SHAPES: readonly CarShape[] = buildCarShapes(LOGO_BODY_COLOR);

function hex(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}

export function Brand() {
  return (
    <div className="brand">
      <LogoMark />
      <h1 className="brand-title">AsphaltCrash</h1>
    </div>
  );
}

function CarShapeSvg({ shape }: { readonly shape: CarShape }) {
  if (shape.kind === "circle") {
    return (
      <circle
        cx={shape.x}
        cy={shape.y}
        r={shape.radius}
        fill={hex(shape.fill)}
        opacity={shape.alpha}
      />
    );
  }
  return (
    <rect
      x={shape.x}
      y={shape.y}
      width={shape.width}
      height={shape.height}
      rx={shape.radius}
      fill={hex(shape.fill)}
      opacity={shape.alpha}
    />
  );
}

// Draws the same shape list as the in-game car (game/carDesign.ts).
function LogoMark() {
  return (
    <svg
      className="brand-logo"
      viewBox="-60 -60 120 120"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="brand-burst" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={BURST_FILL_TOP} />
          <stop offset="1" stopColor={BURST_FILL_BOTTOM} />
        </linearGradient>
      </defs>
      <polygon
        points={BURST_POINTS}
        fill="url(#brand-burst)"
        stroke={OUTLINE_COLOR}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <g transform={`rotate(${LOGO_CAR_TILT_DEG}) scale(${LOGO_CAR_SCALE})`}>
        {LOGO_SHAPES.map((shape, index) => (
          <CarShapeSvg key={index} shape={shape} />
        ))}
      </g>
    </svg>
  );
}
