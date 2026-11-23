const BURST_SPIKES = 12;
const BURST_OUTER_RADIUS = 50;
const BURST_INNER_RADIUS = 30;
const BURST_CENTER = 60;
const CAR_ROTATION_DEG = 32;

function buildBurstPoints(
  spikes: number,
  outer: number,
  inner: number,
  center: number,
): string {
  const points: string[] = [];
  for (let index = 0; index < spikes * 2; index += 1) {
    const radius = index % 2 === 0 ? outer : inner;
    const angle = (Math.PI * index) / spikes;
    const x = center + radius * Math.cos(angle);
    const y = center + radius * Math.sin(angle);
    points.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return points.join(" ");
}

const BURST_POINTS = buildBurstPoints(
  BURST_SPIKES,
  BURST_OUTER_RADIUS,
  BURST_INNER_RADIUS,
  BURST_CENTER,
);

export function Brand() {
  return (
    <div className="brand">
      <LogoMark />
      <h1 className="brand-title">AsphaltCrash</h1>
    </div>
  );
}

function LogoMark() {
  return (
    <svg
      className="brand-logo"
      viewBox="0 0 120 120"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="brand-burst" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffd166" />
          <stop offset="1" stopColor="#e63946" />
        </linearGradient>
      </defs>
      <polygon
        points={BURST_POINTS}
        fill="url(#brand-burst)"
        stroke="#0f1116"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <g transform={`rotate(${CAR_ROTATION_DEG} 60 60)`}>
        <rect x="44" y="40" width="7" height="13" rx="2" fill="#0f1116" />
        <rect x="69" y="40" width="7" height="13" rx="2" fill="#0f1116" />
        <rect x="44" y="66" width="7" height="13" rx="2" fill="#0f1116" />
        <rect x="69" y="66" width="7" height="13" rx="2" fill="#0f1116" />
        <rect
          x="50"
          y="34"
          width="20"
          height="52"
          rx="8"
          fill="#f2f2f2"
          stroke="#0f1116"
          strokeWidth="2"
        />
        <rect x="54" y="46" width="12" height="10" rx="2" fill="#1b1d22" />
        <rect x="54" y="70" width="12" height="8" rx="2" fill="#1b1d22" />
        <circle cx="55" cy="37" r="2.5" fill="#ffd166" />
        <circle cx="65" cy="37" r="2.5" fill="#ffd166" />
      </g>
    </svg>
  );
}
