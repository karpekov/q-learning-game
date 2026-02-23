import type { Coord } from '../../types';
import { angleToArrow, formatQValue, qValueColor } from '../playbackView/utils';

export type QuadrantKey = 'top' | 'right' | 'bottom' | 'left';

export const QUADRANT_BOUNDS: Array<{ key: QuadrantKey; start: number; end: number }> = [
  { key: 'top', start: -135, end: -45 },
  { key: 'right', start: -45, end: 45 },
  { key: 'bottom', start: 45, end: 135 },
  { key: 'left', start: 135, end: 225 },
];

const EMPTY_QUADRANT_VALUES: Record<QuadrantKey, number | null> = {
  top: null,
  right: null,
  bottom: null,
  left: null,
};

export function arcPath(cx: number, cy: number, radius: number, startDeg: number, endDeg: number) {
  const startRad = (startDeg * Math.PI) / 180;
  const endRad = (endDeg * Math.PI) / 180;
  const sx = cx + radius * Math.cos(startRad);
  const sy = cy + radius * Math.sin(startRad);
  const ex = cx + radius * Math.cos(endRad);
  const ey = cy + radius * Math.sin(endRad);
  return `M ${cx} ${cy} L ${sx} ${sy} A ${radius} ${radius} 0 0 1 ${ex} ${ey} Z`;
}

export function resolveQValueFromMap(
  activeQValueMap: Record<string, Record<string, number>> | null | undefined,
  state: string,
  to: string,
  idx: number
): number | null {
  if (!activeQValueMap) return null;
  const stateValues = activeQValueMap[state];
  if (!stateValues) return null;

  let value = stateValues[to];
  if (value == null) {
    const idxKey = String(idx);
    if (Object.prototype.hasOwnProperty.call(stateValues, idxKey)) {
      value = stateValues[idxKey];
    }
  }

  return value ?? null;
}

export function buildQuadrantValues(
  origin: Coord,
  neighbors: string[],
  coords: Record<string, Coord>,
  getValue: (to: string, idx: number) => number | null
): Record<QuadrantKey, number | null> {
  const [x, y] = origin;
  const quadrantValues: Record<QuadrantKey, number | null> = { ...EMPTY_QUADRANT_VALUES };

  neighbors.forEach((to, idx) => {
    const value = getValue(to, idx);
    if (value == null) return;

    const toCoord = coords[to];
    if (!toCoord) return;

    const [tx, ty] = toCoord;
    const angleDeg = Math.atan2(ty - y, tx - x) * (180 / Math.PI);

    let key: QuadrantKey = 'left';
    if (angleDeg >= -135 && angleDeg < -45) key = 'top';
    else if (angleDeg >= -45 && angleDeg < 45) key = 'right';
    else if (angleDeg >= 45 && angleDeg < 135) key = 'bottom';

    const prev = quadrantValues[key];
    if (prev == null || value > prev) {
      quadrantValues[key] = value;
    }
  });

  return quadrantValues;
}

export type LabelPositionOptions = {
  alongMin: number;
  alongMax: number;
  alongStep: number;
  alongBase: number;
  perpOffset: number;
  minAbsValue: number;
};

const DEFAULT_LABEL_OPTIONS: LabelPositionOptions = {
  alongMin: 0.18,
  alongMax: 0.35,
  alongStep: 0.04,
  alongBase: 0.22,
  perpOffset: 0.18,
  minAbsValue: 0.005,
};

export type BasicQValueLabel = {
  key: string;
  x: number;
  y: number;
  label: string;
  color: string;
};

export function buildDirectionalQValueLabels(
  activeQValueMap: Record<string, Record<string, number>> | null | undefined,
  adjacency: Record<string, string[]>,
  coords: Record<string, Coord>,
  options: Partial<LabelPositionOptions> = {}
): BasicQValueLabel[] {
  if (!activeQValueMap) return [];

  const {
    alongMin,
    alongMax,
    alongStep,
    alongBase,
    perpOffset,
    minAbsValue,
  } = { ...DEFAULT_LABEL_OPTIONS, ...options };

  const labels: BasicQValueLabel[] = [];

  for (const [from, neighbors] of Object.entries(adjacency)) {
    const fromCoord = coords[from];
    if (!fromCoord) continue;
    const stateValues = activeQValueMap[from];
    if (!stateValues) continue;

    neighbors.forEach((to, idx) => {
      const toCoord = coords[to];
      if (!toCoord) return;

      const value = resolveQValueFromMap(activeQValueMap, from, to, idx);
      if (value == null) return;
      if (Math.abs(value) < minAbsValue) return;

      const [sx, sy] = fromCoord;
      const [tx, ty] = toCoord;
      const dx = tx - sx;
      const dy = ty - sy;
      const length = Math.hypot(dx, dy) || 1;

      const along = Math.min(alongMax, Math.max(alongMin, alongBase + idx * alongStep));
      const baseX = sx + dx * along;
      const baseY = sy + dy * along;

      const perpX = (-dy / length) * perpOffset;
      const perpY = (dx / length) * perpOffset;
      const direction = idx % 2 === 0 ? 1 : -1;

      labels.push({
        key: `${from}->${to}-${idx}`,
        x: baseX + perpX * direction,
        y: baseY + perpY * direction,
        label: formatQValue(value),
        color: qValueColor(value),
      });
    });
  }

  return labels;
}

export function arrowDirectionBetween(from: Coord | undefined, to: Coord | undefined): string {
  if (!from || !to) return '';

  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  if (dx === 0 && dy === 0) return '';

  const angle = Math.atan2(-dy, dx) * (180 / Math.PI);
  return angleToArrow(angle);
}
