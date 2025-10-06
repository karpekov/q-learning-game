import React, { useState, useEffect } from 'react';
import type { Coord, ExperimentDataSummary, Episode } from '../types';
import { Info } from 'lucide-react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import './GraphViewer.css';

type PlaybackStats = {
  episodeIndex: number;
  episodeCount: number;
  stepIndex: number;
  stepCount: number;
  totalReward?: number | null;
};

type PolicyValue = string | number;

type QValuesMap = ExperimentDataSummary['q_values'];

type Props = {
  coords: Record<string, Coord>;
  adjacency: Record<string, string[]>;
  terminalRewards: Record<string, number>;
  currentState?: string | null;
  path?: string[];
  width?: number;
  height?: number;
  playbackStats?: PlaybackStats;
  policy?: Record<string, PolicyValue> | null;
  qValues?: QValuesMap | null;
  hyperParams?: {
    alpha?: number | null;
    epsilon?: number | null;
    gamma?: number | null;
    stepCost?: number | null;
    stochasticity?: number | null;
  } | null;
  episodes?: Episode[] | null;
  currentEpisodeIndex?: number;
  currentStepIndex?: number;
  playbackCompleted?: boolean;
  onEpisodeJump?: (episodeIndex: number) => void;
};

function computeBounds(coords: Record<string, Coord>) {
  const xs = Object.values(coords).map(([x]) => x);
  const ys = Object.values(coords).map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { minX, maxX, minY, maxY };
}

function formatQValue(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1000) return value.toFixed(0);
  if (abs >= 100) return value.toFixed(1);
  return value.toFixed(2);
}

function qValueColor(value: number): string {
  if (!Number.isFinite(value)) return '#495057';
  const scaled = Math.max(-1, Math.min(1, value / 400));
  const signHue = scaled >= 0 ? 140 : 5; // green-ish vs red-ish
  const magnitude = Math.abs(scaled);
  const saturation = 65 + magnitude * 35; // 55%..90%
  const lightness = 58 - magnitude * 28; // 58%..30%
  return `hsl(${signHue} ${saturation}% ${lightness}%)`;
}

function angleToArrow(angle: number): string {
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

export const GraphViewer: React.FC<Props> = ({
  coords,
  adjacency,
  terminalRewards,
  currentState,
  path = [],
  width = 960,
  height = 64,
  playbackStats,
  policy,
  qValues,
  hyperParams,
  episodes,
  currentEpisodeIndex,
  currentStepIndex,
  playbackCompleted,
  onEpisodeJump,
}) => {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const { minX, maxX, minY, maxY } = computeBounds(coords);
  const pad = 1;
  const vbX = minX - pad;
  const vbY = minY - pad;
  const vbW = (maxX - minX) + pad * 2;
  const vbH = (maxY - minY) + pad * 2;

  const pathSegments = React.useMemo(() => {
    const segments: { key: string; from: Coord; to: Coord }[] = [];
    for (let i = 0; i < path.length - 1; i++) {
      const fromState = path[i];
      const toState = path[i + 1];
      const from = coords[fromState];
      const to = coords[toState];
      if (!from || !to) continue;
      segments.push({ key: `${fromState}->${toState}-${i}`, from, to });
    }
    return segments;
  }, [path, coords]);

  const policyArrows = React.useMemo(() => {
    if (!policy) return [] as {
      key: string;
      startX: number;
      startY: number;
      endX: number;
      endY: number;
    }[];

    const arrows: {
      key: string;
      startX: number;
      startY: number;
      endX: number;
      endY: number;
    }[] = [];

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
        const index = Number.isFinite(rawTarget) ? Math.round(rawTarget) : NaN;
        if (!Number.isNaN(index) && neighbors[index]) {
          targetState = neighbors[index];
        }
      }

      if (!targetState) continue;
      const toCoord = coords[targetState];
      if (!toCoord) continue;

      const [sx, sy] = fromCoord;
      const [tx, ty] = toCoord;
      const dx = tx - sx;
      const dy = ty - sy;
      const length = Math.hypot(dx, dy);
      if (!length) continue;

      const startFactor = Math.min(0.35, 0.2 + 0.1 / Math.max(length, 1));
      const endFactor = Math.max(0.45, Math.min(0.82, 1 - 0.25 / Math.max(length, 1)));

      const startX = sx + dx * startFactor;
      const startY = sy + dy * startFactor;
      const endX = sx + dx * endFactor;
      const endY = sy + dy * endFactor;

      arrows.push({
        key: `${state}->${targetState}`,
        startX,
        startY,
        endX,
        endY,
      });
    }

    return arrows;
  }, [policy, coords, adjacency]);

  const finalQValueMap = React.useMemo(() => {
    if (!qValues) return {} as Record<string, Record<string, number>>;
    const map: Record<string, Record<string, number>> = {};
    for (const [state, values] of Object.entries(qValues)) {
      map[state] = { ...values };
    }
    return map;
  }, [qValues]);

  const episodicQValueMap = React.useMemo(() => {
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
  }, [episodes, currentEpisodeIndex, currentStepIndex, adjacency]);

  const activeQValueMap = React.useMemo(() => {
    if (playbackCompleted) {
      return finalQValueMap;
    }
    if (episodicQValueMap) {
      return episodicQValueMap;
    }
    return finalQValueMap;
  }, [playbackCompleted, episodicQValueMap, finalQValueMap]);

  const qValueLabels = React.useMemo(() => {
    if (!activeQValueMap) return [] as {
      key: string;
      x: number;
      y: number;
      label: string;
      color: string;
    }[];

    const labels: {
      key: string;
      x: number;
      y: number;
      label: string;
      color: string;
    }[] = [];

    for (const [from, neighbors] of Object.entries(adjacency)) {
      const fromCoord = coords[from];
      if (!fromCoord) continue;
      const stateValues = activeQValueMap[from];
      if (!stateValues) continue;

      neighbors.forEach((to, idx) => {
        const toCoord = coords[to];
        if (!toCoord) return;

        const idxKey = String(idx);
        let value = stateValues[to];
        if (value == null && Object.prototype.hasOwnProperty.call(stateValues, idxKey)) {
          value = stateValues[idxKey];
        }
        if (value == null) return;

        const [sx, sy] = fromCoord;
        const [tx, ty] = toCoord;
        const dx = tx - sx;
        const dy = ty - sy;
        const length = Math.hypot(dx, dy) || 1;

        const along = Math.min(0.35, Math.max(0.18, 0.22 + idx * 0.04));
        const baseX = sx + dx * along;
        const baseY = sy + dy * along;

        const perpX = (-dy / length) * 0.18;
        const perpY = (dx / length) * 0.18;
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
  }, [activeQValueMap, adjacency, coords]);

  const [showPolicy, setShowPolicy] = useState(false);
  const [showQValues, setShowQValues] = useState(false);
  const [showInfoTip, setShowInfoTip] = useState(false);
  const [tooltip, setTooltip] = useState<{
    node: string;
    x: number;
    y: number;
    entries: { target: string; label: string; color: string; direction: string }[];
  } | null>(null);

  useEffect(() => {
    if (!activeQValueMap || Object.keys(activeQValueMap).length === 0) {
      setTooltip(null);
    }
  }, [activeQValueMap]);

  const resolveQValue = React.useCallback(
    (state: string, to: string, idx: number): number | null => {
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
    },
    [activeQValueMap]
  );

  const updateTooltip = React.useCallback(
    (state: string, event: React.MouseEvent<SVGGElement, MouseEvent>) => {
      if (!activeQValueMap) return;
      const neighbors = adjacency[state] || [];
      const center = coords[state];
      const entries = neighbors
        .map((neighbor, idx) => {
          const value = resolveQValue(state, neighbor, idx);
          if (value == null) return null;
          let arrow = '';
          const neighborCoord = coords[neighbor];
          if (center && neighborCoord) {
            const [sx, sy] = center;
            const [tx, ty] = neighborCoord;
            const dx = tx - sx;
            const dy = ty - sy;
            if (dx !== 0 || dy !== 0) {
              const angle = Math.atan2(-dy, dx) * (180 / Math.PI);
              arrow = angleToArrow(angle);
            }
          }
          return {
            target: neighbor,
            label: formatQValue(value),
            color: qValueColor(value),
            direction: arrow,
          };
        })
        .filter((entry): entry is { target: string; label: string; color: string; direction: string } => entry !== null);

      if (entries.length === 0) {
        setTooltip(null);
        return;
      }

      const rect = containerRef.current?.getBoundingClientRect();
      const x = rect ? event.clientX - rect.left : event.clientX;
      const y = rect ? event.clientY - rect.top : event.clientY;

      setTooltip({
        node: state,
        x,
        y,
        entries,
      });
    },
    [adjacency, coords, activeQValueMap, resolveQValue]
  );

  return (
    <div ref={containerRef} className="graph-viewer-root" style={{ width, height }}>
      <TransformWrapper
        initialScale={1}
        minScale={0.5}
        maxScale={3}
        wheel={{ step: 0.1 }}
        doubleClick={{ disabled: true }}
        panning={{ velocity: 0.2, limitToBounds: false }}
      >
        {({ zoomIn, zoomOut, resetTransform }) => (
          <>
            {playbackStats && (
              <div className="graph-stats-panel">
                <div className="graph-stats-summary">
                  <p><strong>Alpha:</strong> {hyperParams?.alpha != null ? hyperParams.alpha.toFixed(6) : '-'}</p>
                  <p><strong>Epsilon:</strong> {hyperParams?.epsilon != null ? hyperParams.epsilon.toFixed(6) : '-'}</p>
                  <p><strong>Gamma:</strong> {hyperParams?.gamma != null ? hyperParams.gamma.toFixed(3) : '-'}</p>
                  <p><strong>Step cost:</strong> {hyperParams?.stepCost != null ? hyperParams.stepCost.toFixed(3) : '-'}</p>
                  <p><strong>Stochasticity:</strong> {hyperParams?.stochasticity != null ? `${(hyperParams.stochasticity * 100).toFixed(1)}%` : '-'}</p>
                </div>
                <div className="graph-stats-row">
                  <p><strong>Episode:</strong> {playbackStats.episodeIndex + 1}/{playbackStats.episodeCount}</p>
                  <p><strong>Step:</strong> {Math.min(playbackStats.stepIndex, playbackStats.stepCount)}/{playbackStats.stepCount}</p>
                  <p><strong>Reward:</strong> {playbackStats.totalReward != null ? playbackStats.totalReward.toFixed(2) : '-'}</p>
                </div>
                <div className="graph-stats-checks">
                  <label className="graph-stats-checkbox">
                    <input
                      type="checkbox"
                      checked={showPolicy}
                      onChange={() => setShowPolicy((v) => !v)}
                      disabled={!policy}
                    />{' '}
                    Show Final Policy
                  </label>
                  <label className="graph-stats-checkbox">
                    <input
                      type="checkbox"
                      checked={showQValues}
                      onChange={() => setShowQValues((v) => !v)}
                      disabled={!qValues}
                    />{' '}
                    Show Q-values
                  </label>
                </div>
                <div className="graph-zoom-controls">
                  <button onClick={() => zoomOut()} className="graph-zoom-button" title="Zoom out">-</button>
                  <button onClick={() => resetTransform()} className="graph-zoom-button" title="Reset view">Reset View</button>
                  <button onClick={() => zoomIn()} className="graph-zoom-button" title="Zoom in">+</button>
                </div>
              </div>
            )}

            {/* Info Tip */}
            <div
              className="graph-info-trigger"
              onMouseEnter={() => setShowInfoTip(true)}
              onMouseLeave={() => setShowInfoTip(false)}
              onFocus={() => setShowInfoTip(true)}
              onBlur={() => setShowInfoTip(false)}
              tabIndex={0}
              role="button"
              aria-label="Graph viewer tips"
            >
              <div className={`graph-info-bubble ${showInfoTip ? 'is-visible' : ''}`}>
                <div className="graph-info-content">
                  <div className="graph-info-title">Key</div>
                  <div className="graph-info-entry">
                    <svg width="12%" height="10%" viewBox="0 0 30 40" preserveAspectRatio="xMidYMid meet">
                      <circle cx={15} cy={20} r={6} fill="#a8e6cf" />
                    </svg>
                    <p>Positive terminal state</p>
                  </div>
                  <div className="graph-info-entry">
                    <svg width="12%" height="10%" viewBox="0 0 30 40" preserveAspectRatio="xMidYMid meet">
                      <circle cx={15} cy={20} r={6} fill="#ffaaa7" />
                    </svg>
                    <p>Negative terminal state</p>
                  </div>
                </div>
              </div>
              <div className="graph-info-trigger__icon">
                <Info />
              </div>
            </div>

            {/* SVG elements stacked in order of rendering (back to front) */}
            <TransformComponent wrapperClass="graph-view-wrapper" contentClass="graph-view-content">
              <svg
                width={width}
                height={height}
                viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
                className="graph-viewer-canvas"
              >
        <defs>
          <marker
            id="policy-arrow"
            viewBox="0 0 4 4"
            refX="3"
            refY="2"
            markerWidth="4"
            markerHeight="4"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M0,0 L4,2 L0,4 z" fill="#f08c00" />
          </marker>
          <marker
            id="path-arrow"
            viewBox="0 0 4 4"
            refX="3"
            refY="2"
            markerWidth="4"
            markerHeight="4"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M0,0 L4,2 L0,4 z" fill="#0d6efd" />
          </marker>
        </defs>

        {/* Edges */}
        <g stroke="#bbb" strokeWidth={0.05}>
          {Object.entries(adjacency).map(([from, neighbors]) => {
            const fromC = coords[from];
            if (!fromC) return null;
            return neighbors.map((to) => {
              const toC = coords[to];
              if (!toC) return null;
              return <line key={`${from}->${to}`} x1={fromC[0]} y1={fromC[1]} x2={toC[0]} y2={toC[1]} />;
            });
          })}
        </g>

        {/* Path */}
        {pathSegments.length > 0 && (
          <g stroke="#0d6efd" strokeWidth={0.12} strokeOpacity={0.9}>
            {pathSegments.map(({ key, from, to }) => (
              <line
                key={`path-${key}`}
                x1={from[0]}
                y1={from[1]}
                x2={to[0]}
                y2={to[1]}
                markerEnd="url(#path-arrow)"
              />
            ))}
          </g>
        )}

        {/* Policy arrows */}
        {showPolicy && policyArrows.length > 0 && (
          <g stroke="#f08c00" strokeWidth={0.08} opacity={0.7}>
            {policyArrows.map(({ key, startX, startY, endX, endY }) => (
              <line
                key={`policy-${key}`}
                x1={startX}
                y1={startY}
                x2={endX}
                y2={endY}
                markerEnd="url(#policy-arrow)"
              />
            ))}
          </g>
        )}

        {/* Nodes */}
        <g>
          {Object.entries(coords).map(([state, [x, y]]) => {
            const isCurrent = currentState === state;
            const isTerminal = state in terminalRewards;
            const fill = isCurrent
              ? '#fdf0ac'
              : isTerminal
              ? terminalRewards[state] > 0
                ? '#a8e6cf'
                : '#ffaaa7'
              : '#e9ecef';
            const stroke = '#343a40';
            const r = 0.25;
            return (
              <g
                key={state}
                onMouseEnter={(event) => updateTooltip(state, event)}
                onMouseMove={(event) => updateTooltip(state, event)}
                onMouseLeave={() => setTooltip(null)}
              >
                <circle cx={x} cy={y} r={r} fill={fill} stroke={stroke} strokeWidth={0.05} />
              </g>
            );
          })}
        </g>

        {/* Q-value labels */}
        {showQValues && qValueLabels.length > 0 && (
          <g>
            {qValueLabels.map(({ key, x, y, label, color }) => (
              <text
                key={`q-${key}`}
                x={x}
                y={y}
                fontSize={0.2}
                fill={color}
                textAnchor="middle"
                alignmentBaseline="middle"
                paintOrder="stroke"
                stroke="#343a40"
                strokeWidth={0.01}
                pointerEvents="none"
              >
                {label}
              </text>
            ))}
          </g>
        )}
              </svg>
            </TransformComponent>

            {tooltip && (
              <div
                className="graph-tooltip"
                style={{ left: tooltip.x, top: tooltip.y }}
              >
                <div className="graph-tooltip-title">{tooltip.node}</div>
                <div className="graph-tooltip-list">
                  {tooltip.entries.map((entry) => (
                    <div key={`${tooltip.node}-${entry.target}`} className="graph-tooltip-entry">
                      <span className="graph-tooltip-target">
                        {entry.direction && <span className="graph-tooltip-direction">{entry.direction}</span>}
                        {entry.target}
                      </span>
                      <span className="graph-tooltip-value" style={{ color: entry.color }}>{entry.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </TransformWrapper>
    </div>
  );
};

export default GraphViewer;
