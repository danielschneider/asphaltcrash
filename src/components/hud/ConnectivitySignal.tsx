import type { ConnectivitySnapshot } from "../../store/hudStore";

interface ConnectivitySignalProps {
  readonly connectivity: ConnectivitySnapshot;
}

function fillCountForQuality(quality: ConnectivitySnapshot["quality"]): number {
  if (quality === "good") return 4;
  if (quality === "fair") return 3;
  return 1;
}

function labelForQuality(quality: ConnectivitySnapshot["quality"]): string {
  if (quality === "good") return "Connection good";
  if (quality === "fair") return "Connection fair";
  return "Connection poor";
}

function accessibilityText(connectivity: ConnectivitySnapshot): string {
  const label = labelForQuality(connectivity.quality);
  if (connectivity.rttMs === null) return `${label}; no ping response`;
  return `${label}; ${Math.round(connectivity.rttMs)} ms round trip, ${Math.round(connectivity.jitterMs)} ms jitter`;
}

function titleText(connectivity: ConnectivitySnapshot): string {
  if (connectivity.rttMs === null) return "Waiting for ping response";
  return `RTT ${Math.round(connectivity.rttMs)} ms / jitter ${Math.round(connectivity.jitterMs)} ms`;
}

export function ConnectivitySignal({ connectivity }: ConnectivitySignalProps) {
  const fillCount = fillCountForQuality(connectivity.quality);

  return (
    <div
      className={`connectivity-signal connectivity-${connectivity.quality}`}
      role="status"
      aria-label={accessibilityText(connectivity)}
      title={titleText(connectivity)}
    >
      {[1, 2, 3, 4].map((bar) => (
        <span
          key={bar}
          className={
            bar <= fillCount ? "connectivity-bar filled" : "connectivity-bar"
          }
        />
      ))}
    </div>
  );
}
