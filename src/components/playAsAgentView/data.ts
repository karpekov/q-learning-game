import type { Coord } from '../../types';
import {
  arrowDirectionBetween,
  buildDirectionalQValueLabels,
} from '../graph/qValueRendering';
import type { AgentTooltipEntry, QLabel, QCalculation } from './types';

export function defaultStart(coords: Record<string, Coord>): string {
  if ('S' in coords) return 'S';
  const keys = Object.keys(coords);
  const prefer = keys.find((k) => /start/i.test(k))
    || keys.find((k) => k === 'GOAL')
    || keys[0];
  return prefer || '';
}

export function pickStochasticNeighbor(
  intended: string,
  current: string,
  stochasticity: number,
  coords: Record<string, Coord>,
  adjacency: Record<string, string[]>
): string {
  const p = Math.max(0, Math.min(1, stochasticity));
  if (p === 0 || !coords[current]) return intended;

  const opts = (adjacency[current] || []).filter((n) => !!coords[n]);
  if (!opts.includes(intended)) return intended;

  const c = coords[current];
  const i = coords[intended];
  const vx = i[0] - c[0];
  const vy = i[1] - c[1];
  const vLen = Math.hypot(vx, vy) || 1;
  const ox = vx / vLen;
  const oy = vy / vLen;

  const leftX = -oy;
  const leftY = ox;
  const rightX = oy;
  const rightY = -ox;

  let leftNeighbor: string | null = null;
  let leftScore = -Infinity;
  let rightNeighbor: string | null = null;
  let rightScore = -Infinity;

  for (const n of opts) {
    if (n === intended) continue;
    const nn = coords[n];
    const wx = nn[0] - c[0];
    const wy = nn[1] - c[1];
    const wLen = Math.hypot(wx, wy) || 1;
    const ux = wx / wLen;
    const uy = wy / wLen;
    const dl = ux * leftX + uy * leftY;
    const dr = ux * rightX + uy * rightY;
    if (dl > leftScore) {
      leftScore = dl;
      leftNeighbor = n;
    }
    if (dr > rightScore) {
      rightScore = dr;
      rightNeighbor = n;
    }
  }

  const r = Math.random();
  if (r < p / 2) return leftNeighbor || intended;
  if (r < p) return rightNeighbor || intended;
  return intended;
}

export function calculateQValueUpdate(
  from: string,
  to: string,
  qValues: Record<string, Record<string, number>>,
  adjacency: Record<string, string[]>,
  terminalRewards: Record<string, number>,
  alpha: number,
  gamma: number,
  stepCost: number
): {
  updatedQValues: Record<string, Record<string, number>>;
  calc: QCalculation;
  previous: number | undefined;
  updated: number;
} {
  const currentStateValues = qValues[from] || {};
  const nextStateValues = qValues[to] || {};
  const immediateReward = (terminalRewards[to] ?? 0) - stepCost;

  const futureNeighbors = adjacency[to] || [];
  const bestNext = futureNeighbors.reduce((best, neighbor) => {
    const candidate = nextStateValues[neighbor] ?? 0;
    return candidate > best ? candidate : best;
  }, 0);

  const currentQ = currentStateValues[to];
  const currentQSafe = currentQ ?? 0;
  const updatedQ = currentQSafe + alpha * (immediateReward + gamma * bestNext - currentQSafe);

  return {
    updatedQValues: {
      ...qValues,
      [from]: { ...currentStateValues, [to]: updatedQ },
    },
    calc: {
      prev: currentQSafe,
      reward: immediateReward,
      bestNext,
      updated: updatedQ,
      alpha,
      gamma,
    },
    previous: currentQ,
    updated: updatedQ,
  };
}

export function buildAgentQValueLabels(
  qValues: Record<string, Record<string, number>>,
  coords: Record<string, Coord>,
  adjacency: Record<string, string[]>
): QLabel[] {
  return buildDirectionalQValueLabels(qValues, adjacency, coords, {
    alongMin: 0.2,
    alongMax: 0.36,
    alongStep: 0.05,
  });
}

export function buildAgentTooltipEntries(
  state: string,
  adjacency: Record<string, string[]>,
  coords: Record<string, Coord>,
  qValues: Record<string, Record<string, number>>,
  qCalcs: Record<string, QCalculation>,
  terminalRewards: Record<string, number>,
  stepCost: number,
  alpha: number,
  gamma: number
): AgentTooltipEntry[] {
  return (adjacency[state] || [])
    .map((to) => {
      const value = qValues[state]?.[to];
      if (value == null) return null;

      const calc = qCalcs[`${state}->${to}`];
      const direction = arrowDirectionBetween(coords[state], coords[to]);

      return {
        to,
        value,
        direction,
        prev: calc?.prev ?? value,
        reward: calc?.reward ?? (terminalRewards[to] ?? 0) - stepCost,
        bestNext: calc?.bestNext ?? 0,
        updated: calc?.updated ?? value,
        alpha: calc?.alpha ?? alpha,
        gamma: calc?.gamma ?? gamma,
      };
    })
    .filter((entry): entry is AgentTooltipEntry => entry !== null);
}
