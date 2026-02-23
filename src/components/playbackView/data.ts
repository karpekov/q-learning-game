import type { Coord, Episode } from '../../types';
import {
  buildDirectionalQValueLabels,
  resolveQValueFromMap,
} from '../graph/qValueRendering';
import { NODE_RADIUS, POLICY_ARROW_TIP_OFFSET } from './constants';
import type { PathSegment, PolicyArrow, PolicyValue, QValueLabel } from './types';
import { computeTrimmedArrowLine } from './utils';

export function buildPathSegments(
  path: string[],
  coords: Record<string, Coord>
): PathSegment[] {
  const segments: PathSegment[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const fromState = path[i];
    const toState = path[i + 1];
    const from = coords[fromState];
    const to = coords[toState];
    if (!from || !to) continue;
    segments.push({ key: `${fromState}->${toState}-${i}`, from, to });
  }
  return segments;
}

export function buildPolicyArrows(
  policy: Record<string, PolicyValue> | null | undefined,
  coords: Record<string, Coord>,
  adjacency: Record<string, string[]>
): PolicyArrow[] {
  if (!policy) return [];

  const arrows: PolicyArrow[] = [];

  for (const [state, rawTarget] of Object.entries(policy)) {
    const fromCoord = coords[state];
    if (!fromCoord) continue;

    let targetState: string | null = null;

    if (typeof rawTarget === 'string') {
      const normalized = rawTarget.trim();
      if (!normalized || normalized === '-' || normalized.toLowerCase() === 'none') continue;
      if (coords[normalized]) {
        targetState = normalized;
      }
    } else if (typeof rawTarget === 'number') {
      const neighbors = adjacency[state] || [];
      const index = Number.isFinite(rawTarget) ? Math.round(rawTarget) : Number.NaN;
      if (!Number.isNaN(index) && neighbors[index]) {
        targetState = neighbors[index];
      }
    }

    if (!targetState) continue;
    const toCoord = coords[targetState];
    if (!toCoord) continue;

    const trimmed = computeTrimmedArrowLine(fromCoord, toCoord, NODE_RADIUS, POLICY_ARROW_TIP_OFFSET);
    if (!trimmed) continue;

    arrows.push({
      key: `${state}->${targetState}`,
      startX: trimmed.startX,
      startY: trimmed.startY,
      endX: trimmed.endX,
      endY: trimmed.endY,
    });
  }

  return arrows;
}

export function buildFinalQValueMap(
  qValues: Record<string, Record<string, number>> | null | undefined
): Record<string, Record<string, number>> {
  if (!qValues) return {};

  const map: Record<string, Record<string, number>> = {};
  for (const [state, values] of Object.entries(qValues)) {
    map[state] = { ...values };
  }
  return map;
}

export function buildEpisodicQValueMap(
  episodes: Episode[] | null | undefined,
  currentEpisodeIndex: number | undefined,
  currentStepIndex: number | undefined,
  adjacency: Record<string, string[]>
): Record<string, Record<string, number>> | null {
  if (!episodes || !episodes.length) return null;
  if (currentEpisodeIndex == null || currentEpisodeIndex < 0) return null;

  const maxEpisodeIndex = Math.min(currentEpisodeIndex, episodes.length - 1);
  const curStep = Math.max(0, currentStepIndex ?? 0);
  const map: Record<string, Record<string, number>> = {};

  const applyUpdate = (state: string, targetKey: string | null, actionKey: string, value: number) => {
    if (!map[state]) map[state] = {};
    map[state][actionKey] = value;
    if (targetKey) {
      map[state][targetKey] = value;
    }
  };

  for (let ei = 0; ei <= maxEpisodeIndex; ei++) {
    const episode = episodes[ei];
    if (!episode) continue;
    const steps = episode.steps || [];
    const limit = ei === maxEpisodeIndex ? Math.min(curStep, steps.length) : steps.length;
    for (let si = 0; si < limit; si++) {
      const step = steps[si];
      if (!step || typeof step.q_value !== 'number') continue;
      const state = step.state;
      if (!state) continue;
      const neighbors = adjacency[state] || [];

      let target: string | null = null;
      if (typeof step.intended === 'string' && step.intended) {
        target = step.intended;
      } else if (typeof step.action === 'number' && neighbors[step.action]) {
        target = neighbors[step.action];
      } else if (typeof step.action === 'string' && neighbors.includes(step.action)) {
        target = step.action;
      } else if (step.next_state) {
        target = step.next_state;
      }

      let actionKey: string;
      if (typeof step.action === 'number') {
        actionKey = String(step.action);
      } else if (typeof step.action === 'string' && step.action) {
        actionKey = step.action;
      } else if (target) {
        actionKey = target;
      } else {
        actionKey = '0';
      }

      applyUpdate(state, target, actionKey, step.q_value);
    }
  }

  return map;
}

export function resolveQValue(
  activeQValueMap: Record<string, Record<string, number>> | null | undefined,
  state: string,
  to: string,
  idx: number
): number | null {
  return resolveQValueFromMap(activeQValueMap, state, to, idx);
}

export function buildQValueLabels(
  activeQValueMap: Record<string, Record<string, number>> | null | undefined,
  adjacency: Record<string, string[]>,
  coords: Record<string, Coord>
): QValueLabel[] {
  return buildDirectionalQValueLabels(activeQValueMap, adjacency, coords);
}
