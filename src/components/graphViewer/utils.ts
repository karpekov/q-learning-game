import type { Coord } from '../../types';

export type TrimmedArrowLine = {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
};

export function computeBounds(coords: Record<string, Coord>) {
  const xs = Object.values(coords).map(([x]) => x);
  const ys = Object.values(coords).map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { minX, maxX, minY, maxY };
}

export function formatQValue(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1000) return value.toFixed(0);
  if (abs >= 100) return value.toFixed(1);
  return value.toFixed(2);
}

export function qValueColor(value: number): string {
  if (!Number.isFinite(value)) return '#495057';

  // Symmetric log scaling keeps mid/high values visually separable (e.g., 10 vs 100)
  // while still handling very large magnitudes without collapsing to one color.
  const reference = 250;
  const scaled = Math.sign(value) * (Math.log1p(Math.abs(value)) / Math.log1p(reference));
  const normalized = Math.max(-1, Math.min(1, scaled));
  const t = (normalized + 1) / 2;

  // Red -> orange -> yellow -> green -> dark green
  const stops: Array<{ t: number; rgb: [number, number, number] }> = [
    { t: 0.0, rgb: [123, 31, 34] },   // deep red
    { t: 0.2, rgb: [183, 52, 35] },   // red-orange
    { t: 0.4, rgb: [233, 122, 44] },  // orange
    { t: 0.56, rgb: [248, 220, 111] },// yellow
    { t: 0.78, rgb: [121, 190, 78] }, // green
    { t: 1.0, rgb: [24, 102, 42] },   // dark green
  ];

  const upperIndex = stops.findIndex((stop) => t <= stop.t);
  if (upperIndex <= 0) {
    const [r, g, b] = stops[0].rgb;
    return `rgb(${r}, ${g}, ${b})`;
  }
  if (upperIndex === -1) {
    const [r, g, b] = stops[stops.length - 1].rgb;
    return `rgb(${r}, ${g}, ${b})`;
  }

  const lower = stops[upperIndex - 1];
  const upper = stops[upperIndex];
  const span = Math.max(1e-6, upper.t - lower.t);
  const localT = (t - lower.t) / span;

  const lerp = (a: number, b: number) => Math.round(a + (b - a) * localT);
  const r = lerp(lower.rgb[0], upper.rgb[0]);
  const g = lerp(lower.rgb[1], upper.rgb[1]);
  const b = lerp(lower.rgb[2], upper.rgb[2]);

  return `rgb(${r}, ${g}, ${b})`;
}

export function angleToArrow(angle: number): string {
  const normalized = ((angle % 360) + 360) % 360;
  if (normalized < 22.5 || normalized >= 337.5) return '→';
  if (normalized < 67.5) return '↗';
  if (normalized < 112.5) return '↑';
  if (normalized < 157.5) return '↖';
  if (normalized < 202.5) return '←';
  if (normalized < 247.5) return '↙';
  if (normalized < 292.5) return '↓';
  return '↘';
}

export function formatParam(value: number | null | undefined, digits: number) {
  if (value == null || Number.isNaN(value)) return '-';
  return value.toFixed(digits);
}

export function computeTrimmedArrowLine(
  from: Coord,
  to: Coord,
  nodeRadius: number,
  tipOffset: number
): TrimmedArrowLine | null {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const length = Math.hypot(dx, dy);
  if (!length) return null;
  if (length <= nodeRadius * 2 + tipOffset) return null;

  const ux = dx / length;
  const uy = dy / length;

  return {
    startX: from[0] + ux * nodeRadius,
    startY: from[1] + uy * nodeRadius,
    endX: to[0] - ux * (nodeRadius + tipOffset),
    endY: to[1] - uy * (nodeRadius + tipOffset),
  };
}
