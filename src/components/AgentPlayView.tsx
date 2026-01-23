import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Coord } from '../types';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { Checkbox } from './modules/Checkbox';
import './AgentPlayView.css';

type Props = {
  coords: Record<string, Coord>;
  adjacency: Record<string, string[]>;
  terminalRewards: Record<string, number>;
  alpha?: number;
  gamma?: number;
  onQValueCalculated?: (data: { from: string; to: string; qValue: number }) => void;
  width?: number;
  height?: number;
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

function defaultStart(coords: Record<string, Coord>): string {
  if ('S' in coords) return 'S';
  // Prefer a node named like start/Start/GOAL fallback
  const keys = Object.keys(coords);
  const prefer = keys.find((k) => /start/i.test(k))
    || keys.find((k) => k === 'GOAL')
    || keys[0];
  return prefer || '';
}

export const AgentPlayView: React.FC<Props> = ({
  coords,
  adjacency,
  terminalRewards,
  alpha = 0.1,
  gamma = 0.9,
  onQValueCalculated,
  width = 960,
  height = 640,
}) => {
  const { minX, maxX, minY, maxY } = computeBounds(coords);
  const pad = 1;
  const vbX = minX - pad;
  const vbY = minY - pad;
  const vbW = (maxX - minX) + pad * 2;
  const vbH = (maxY - minY) + pad * 2;

  const start = useMemo(() => defaultStart(coords), [coords]);
  const [current, setCurrent] = useState<string>(start);
  const [visited, setVisited] = useState<Set<string>>(new Set([start]));
  const [everVisited, setEverVisited] = useState<Set<string>>(new Set([start]));
  const [path, setPath] = useState<string[]>([start]);
  const [ended, setEnded] = useState<boolean>(false);
  const [episodes, setEpisodes] = useState<number[]>([]); // rewards per finished round
  const [easyMode, setEasyMode] = useState<boolean>(false);
  const [hardMode, setHardMode] = useState<boolean>(false);
  const [showQValues, setShowQValues] = useState<boolean>(true);
  const [stepCost, setStepCost] = useState<number>(0); // cost per move
  const [stochasticity, setStochasticity] = useState<number>(0); // 0..1 chance to deviate
  const qValuesRef = useRef<Record<string, Record<string, number>>>({});
  const qHistoryRef = useRef<{ from: string; to: string; prev: number | undefined }[]>([]);
  const qCalcRef = useRef<Record<string, { prev: number; reward: number; bestNext: number; updated: number; alpha: number; gamma: number }>>({});
  const [qVersion, setQVersion] = useState<number>(0); // bump to re-render Q labels
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [tooltip, setTooltip] = useState<{
    node: string;
    x: number;
    y: number;
    entries: {
      to: string;
      value: number;
      prev: number;
      reward: number;
      bestNext: number;
      updated: number;
      alpha: number;
      gamma: number;
    }[];
  } | null>(null);

  const latestReward = episodes.length ? episodes[episodes.length - 1] : null;
  const bestReward = episodes.length ? Math.max(...episodes) : null;

  const neighbors = useMemo(() => (current && adjacency[current]) || [], [adjacency, current]);

  const visibleNodes = useMemo(() => {
    if (easyMode) {
      return new Set<string>(Object.keys(coords));
    }

    if (hardMode) {
      const set = new Set<string>(visited);
      if (current) set.add(current);
      neighbors.forEach((n) => set.add(n));
      return set;
    }

    const set = new Set<string>(everVisited);
    if (current) set.add(current);
    neighbors.forEach((n) => set.add(n));
    return set;
  }, [everVisited, current, neighbors, easyMode, coords, hardMode, visited, adjacency]);

  const pathSegments = useMemo(() => {
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

  function pickStochasticNeighbor(intended: string): string {
    // With probability (1 - p) go intended; with p/2 go left; with p/2 go right
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
    // Perpendiculars
    const leftX = -oy, leftY = ox;
    const rightX = oy, rightY = -ox;

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
      if (dl > leftScore) { leftScore = dl; leftNeighbor = n; }
      if (dr > rightScore) { rightScore = dr; rightNeighbor = n; }
    }

    const r = Math.random();
    if (r < (p / 2)) {
      return leftNeighbor || intended;
    } else if (r < p) {
      return rightNeighbor || intended;
    }
    return intended;
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

  function calculateQValue(from: string, to: string): { updated: number; previous: number | undefined; bestNext: number; reward: number } {
    const currentStateValues = qValuesRef.current[from] || {};
    const nextStateValues = qValuesRef.current[to] || {};
    const immediateReward = (terminalRewards[to] ?? 0) - stepCost;
    const futureNeighbors = adjacency[to] || [];
    const bestNext = futureNeighbors.reduce((best, neighbor) => {
      const candidate = nextStateValues[neighbor] ?? 0;
      return candidate > best ? candidate : best;
    }, 0);
    const currentQ = currentStateValues[to];
    const currentQSafe = currentQ ?? 0;
    const updatedQ = currentQSafe + alpha * (immediateReward + gamma * bestNext - currentQSafe);

    qValuesRef.current = {
      ...qValuesRef.current,
      [from]: { ...currentStateValues, [to]: updatedQ },
    };
    qCalcRef.current = {
      ...qCalcRef.current,
      [`${from}->${to}`]: {
        prev: currentQSafe,
        reward: immediateReward,
        bestNext,
        updated: updatedQ,
        alpha,
        gamma,
      },
    };
    setQVersion((v) => v + 1);

    return { updated: updatedQ, previous: currentQ, bestNext, reward: immediateReward };
  }

  function moveTo(intended: string) {
    if (ended) return; // round is over
    if (!neighbors.includes(intended)) return; // restrict to valid moves
    setTooltip(null);

    const actual = pickStochasticNeighbor(intended);
    const fromState = current;
    setCurrent(actual);
    setVisited((prev) => new Set<string>(prev).add(actual));
    setEverVisited((prev) => new Set<string>(prev).add(actual));
    setPath((prev) => [...prev, actual]);

    // calculate Q-value update
    if (fromState) {
      const qValue = calculateQValue(fromState, actual);
      qHistoryRef.current.push({ from: fromState, to: actual, prev: qValue.previous });
      if (onQValueCalculated) {
        onQValueCalculated({ from: fromState, to: actual, qValue: qValue.updated });
      }
    }

    if (actual in terminalRewards) {
      const reward = terminalRewards[actual];
      // Moves including this new move equals current path length
      const moves = path.length; // since new path will be path.length + 1
      const total = -moves * stepCost + reward;
      setEnded(true);
      setEpisodes((prev) => [...prev, total]);
    }
  }

  function reset() {
    const s = defaultStart(coords);
    setCurrent(s);
    setVisited(new Set([s]));
    setEverVisited((prev) => new Set(prev).add(s));
    setPath([s]);
    setEnded(false);
    qHistoryRef.current = [];
    setTooltip(null);
  }

  // Reset play state whenever the graph changes
  useEffect(() => {
    reset();
    setEverVisited(new Set([defaultStart(coords)]));
    setEpisodes([]);
    qValuesRef.current = {};
    qHistoryRef.current = [];
    qCalcRef.current = {};
    setTooltip(null);
    setQVersion((v) => v + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords, adjacency]);

  // Keyboard navigation via arrow keys
  useEffect(() => {
    function pickNeighborByDirection(key: string): string | null {
      const cur = current;
      const c = cur ? coords[cur] : undefined;
      if (!c) return null;
      const [cx, cy] = c;
      const cNeighbors = neighbors.filter((n) => !!coords[n]);
      if (cNeighbors.length === 0) return null;

      let candidate: string | null = null;
      let bestScore = -Infinity;

      for (const n of cNeighbors) {
        const [nx, ny] = coords[n];
        const dx = nx - cx;
        const dy = ny - cy;
        switch (key) {
          case 'ArrowUp': {
            // SVG Y increases downward; visually up => negative dy
            if (dy >= 0) break;
            const score = -dy - Math.abs(dx) * 0.001; // prefer larger upward magnitude
            if (score > bestScore) { bestScore = score; candidate = n; }
            break;
          }
          case 'ArrowDown': {
            // Visually down => positive dy
            if (dy <= 0) break;
            const score = dy - Math.abs(dx) * 0.001; // prefer larger downward magnitude
            if (score > bestScore) { bestScore = score; candidate = n; }
            break;
          }
          case 'ArrowLeft': {
            if (dx >= 0) break;
            const score = -dx - Math.abs(dy) * 0.001; // prefer larger left magnitude
            if (score > bestScore) { bestScore = score; candidate = n; }
            break;
          }
          case 'ArrowRight': {
            if (dx <= 0) break;
            const score = dx - Math.abs(dy) * 0.001; // prefer larger right movement
            if (score > bestScore) { bestScore = score; candidate = n; }
            break;
          }
        }
      }
      return candidate;
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const next = pickNeighborByDirection(e.key);
        if (next) {
          e.preventDefault();
          moveTo(next);
        }
      }

      // if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
      //   e.preventDefault();
      //   undo();
      // }

      if (e.key === 'Enter' && ended) {
        e.preventDefault();
        reset();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [current, neighbors, coords, ended]);

  const qValueLabels = useMemo(() => {
    const labels: {
      key: string;
      x: number;
      y: number;
      label: string;
      color: string;
    }[] = [];

    const formatQValue = (value: number): string => {
      const abs = Math.abs(value);
      if (abs >= 1000) return value.toFixed(0);
      if (abs >= 100) return value.toFixed(1);
      return value.toFixed(2);
    };

    for (const [from, values] of Object.entries(qValuesRef.current)) {
      const fromCoord = coords[from];
      if (!fromCoord) continue;
      const neighbors = adjacency[from] || [];

      neighbors.forEach((to, idx) => {
        const value = values[to];
        if (value == null) return;

        const toCoord = coords[to];
        if (!toCoord) return;
        const [sx, sy] = fromCoord;
        const [tx, ty] = toCoord;
        const dx = tx - sx;
        const dy = ty - sy;
        const length = Math.hypot(dx, dy) || 1;

        const along = Math.min(0.36, Math.max(0.2, 0.22 + idx * 0.05));
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
  }, [coords, adjacency, qVersion]);

  const showNodeTooltip = useCallback(
    (state: string, event: React.MouseEvent<SVGGElement, MouseEvent>) => {
      const entries = (adjacency[state] || [])
        .map((to) => {
          const value = qValuesRef.current[state]?.[to];
          if (value == null) return null;
          const calc = qCalcRef.current[`${state}->${to}`];
          return {
            to,
            value,
            prev: calc?.prev ?? value,
            reward: calc?.reward ?? (terminalRewards[to] ?? 0) - stepCost,
            bestNext: calc?.bestNext ?? 0,
            updated: calc?.updated ?? value,
            alpha: calc?.alpha ?? alpha,
            gamma: calc?.gamma ?? gamma,
          };
        })
        .filter((entry): entry is {
          to: string;
          value: number;
          prev: number;
          reward: number;
          bestNext: number;
          updated: number;
          alpha: number;
          gamma: number;
        } => entry !== null);

      if (!entries.length) {
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
    [adjacency, alpha, gamma, stepCost, terminalRewards]
  );

  return (
    <div className="agent-play-root" ref={containerRef}>
      <TransformWrapper
        initialScale={1}
        minScale={0.5}
        maxScale={3}
        wheel={{ step: 0.1 }}
        doubleClick={{ disabled: true }}
      >
        {({ zoomIn, zoomOut, resetTransform }) => (
          <>
            <div className="agent-controls-panel">
              <div className="agent-controls-row">
                {ended ? (
                  <button onClick={reset} className="agent-control-btn agent-control-btn--success">Try Again</button>
                ) : (
                  <button onClick={reset} className="agent-control-btn agent-control-btn--danger">Reset</button>
                )}
              </div>
              <div className="agent-controls-row">
                <div><strong>Current:</strong> {current}</div>
                <div><strong>Visited:</strong> {visited.size}</div>
              </div>
              <div className="agent-controls-column">
                <label className="agent-range-label">
                  <span>Step cost:</span>
                  <input
                    type="range"
                    min={0}
                    max={5}
                    step={0.1}
                    value={stepCost}
                    onChange={(e) => setStepCost(parseFloat(e.target.value))}
                  />
                  <span className="agent-range-value">{stepCost.toFixed(1)}</span>
                </label>
                <label className="agent-range-label">
                  <span>Stochasticity:</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={Math.round(stochasticity * 100)}
                    onChange={(e) => setStochasticity(Math.max(0, Math.min(1, parseInt(e.target.value, 10) / 100)))}
                  />
                  <span className="agent-range-value">{Math.round(stochasticity * 100)}%</span>
                </label>
              </div>
              <div>
              <Checkbox
                label="Easy Mode"
                tip="Spoilers! Enabling Easy Mode will reveal the whole world."
                checked={easyMode}
                onCheckedChange={setEasyMode}
              />
              <Checkbox
                label="Hard Mode"
                tip="Play as if you were an agent!"
                checked={hardMode}
                onCheckedChange={setHardMode}
              />
              <Checkbox
                label="Show Q-Values"
                checked={showQValues}
                onCheckedChange={setShowQValues}
              />
              </div>
              <div className="agent-zoom-controls">
                <button onClick={() => zoomOut()} className="agent-control-btn" title="Zoom out">-</button>
                <button onClick={() => resetTransform()} className="agent-control-btn" title="Reset view">Reset View</button>
                <button onClick={() => zoomIn()} className="agent-control-btn" title="Zoom in">+</button>
              </div>
            </div>

            <TransformComponent wrapperClass="agent-play-wrapper" contentClass="agent-play-content">
              <svg width={width} height={height} viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`} className="agent-play-field">
                <defs>
                  <marker
                    id="agent-path-arrow"
                    viewBox="0 0 4 4"
                    refX="3"
                    refY="2"
                    markerWidth="4"
                    markerHeight="4"
                    orient="auto"
                    markerUnits="strokeWidth"
                  >
                    <path d="M0,0 L4,2 L0,4 z" fill="#20c997" />
                  </marker>
                </defs>

                {/* Edges from current to neighbors (highlighted) */}
                <g stroke="#0d6efd" strokeWidth={0.08} strokeOpacity={0.7}>
                  {neighbors.map((n) => {
                    const a = coords[current];
                    const b = coords[n];
                    if (!a || !b) return null;
                    return <line key={`cur-${current}->${n}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />;
                  })}
                </g>

                {/* Faint edges among visible visited nodes (optional context) */}
                <g stroke="#bbb" strokeWidth={0.05} strokeOpacity={0.25}>
                  {Array.from(visibleNodes).map((from) => {
                    const fromC = coords[from];
                    if (!fromC) return null;
                    return (adjacency[from] || [])
                      .filter((to) => visibleNodes.has(to))
                      .map((to) => {
                        const toC = coords[to];
                        if (!toC) return null;
                        return (
                          <line key={`${from}->${to}`} x1={fromC[0]} y1={fromC[1]} x2={toC[0]} y2={toC[1]} />
                        );
                      });
                  })}
                </g>

                {/* Path line for movement history */}
                {pathSegments.length > 0 && (
                  <g stroke="#20c997" strokeWidth={0.12} strokeOpacity={0.7}>
                    {pathSegments.map(({ key, from, to }) => (
                      <line
                        key={`path-${key}`}
                        x1={from[0]}
                        y1={from[1]}
                        x2={to[0]}
                        y2={to[1]}
                        markerEnd="url(#agent-path-arrow)"
                      />
                    ))}
                  </g>
                )}

                {/* Nodes */}
                <g>
                  {Array.from(visibleNodes).map((state) => {
                    const c = coords[state];
                    if (!c) return null;
                    const [x, y] = c;
                    const isCurrent = state === current;
                    const isNeighbor = neighbors.includes(state);
                    const isTerminal = state in terminalRewards;
                    const hasVisited = visited.has(state);
                    const wasEverVisited = everVisited.has(state);
                    const showTerminalColor = isTerminal && (hasVisited || wasEverVisited || easyMode);
                    const fill = isCurrent
                      ? showTerminalColor
                        ? (terminalRewards[state] > 0 ? '#a8e6cf' : '#ffaaa7')
                        : '#fdf0ac'
                      : showTerminalColor
                        ? (terminalRewards[state] > 0 ? '#a8e6cf' : '#ffaaa7')
                        : wasEverVisited
                          ? '#dfe6ed'
                          : '#e9ecef';
                    const opacity = isCurrent ? 1 : isNeighbor ? 0.5 : 1;
                    const r = 0.25;
                    const d = r * Math.SQRT1_2; // half-diagonal to draw X crosshair
                    const nodeClass = isNeighbor && !ended ? 'agent-node agent-node--interactive' : 'agent-node';
                    return (
                      <g
                        key={state}
                        className={nodeClass}
                        onClick={() => isNeighbor && !ended && moveTo(state)}
                        onMouseEnter={(e) => showNodeTooltip(state, e)}
                        onMouseMove={(e) => showNodeTooltip(state, e)}
                        onMouseLeave={() => setTooltip(null)}
                      >
                        <circle cx={x} cy={y} r={r} fill={fill} stroke="#343a40" strokeWidth={0.05} opacity={opacity} />
                        {!isTerminal && everVisited.has(state) && (!hardMode || visited.has(state)) &&  (
                          <>
                            <line x1={x - d} y1={y - d} x2={x + d} y2={y + d} stroke="#343a40" strokeWidth={0.04} opacity={opacity} />
                            <line x1={x - d} y1={y + d} x2={x + d} y2={y - d} stroke="#343a40" strokeWidth={0.04} opacity={opacity} />
                          </>
                        )}
                      </g>
                    );
                  })}
                </g>

                {/* Q-value labels (drawn above nodes) */}
                {qValueLabels.length > 0 && showQValues && (
                  <g className="agent-q-labels">
                    {qValueLabels.map((label) => (
                      <text
                        key={label.key}
                        x={label.x}
                        y={label.y}
                        className="agent-q-label"
                        fill={label.color}
                      >
                        {label.label}
                      </text>
                    ))}
                  </g>
                )}
              </svg>
            </TransformComponent>

            {/* Stats */}
            <div className="agent-stats">
              {(() => {
                const moves = Math.max(0, path.length - 1);
                const term = ended && current in terminalRewards ? terminalRewards[current] : 0;
                const currentScore = -moves * stepCost + (ended ? term : 0);
                return (
                  <>
                    <div><strong>Moves:</strong> {moves}</div>
                    <div><strong>Current Score:</strong> {currentScore > 0 ? `+${currentScore}` : `${currentScore}`}</div>
                  </>
                );
              })()}
              <div><strong>Episodes:</strong> {episodes.length}</div>
              <div><strong>Latest:</strong> {latestReward !== null ? (latestReward > 0 ? `+${latestReward.toFixed(2)}` : `${latestReward.toFixed(2)}`) : '-'}</div>
              <div><strong>Best:</strong> {bestReward !== null ? (bestReward > 0 ? `+${bestReward.toFixed(2)}` : `${bestReward.toFixed(2)}`) : '-'}</div>
              <div className="agent-stats__hint">
                Hint: Click neighboring nodes or use the arrow keys to move.
              </div>
              {ended && (
                <div className="agent-stats__completed">
                  Round finished. Terminal: <span className={terminalRewards[current] > 0 ? 'agent-stats__positive' : 'agent-stats__negative'}>{terminalRewards[current] > 0 ? `+${terminalRewards[current]}` : terminalRewards[current]}</span>. Total with step cost applied: <span className={episodes[episodes.length - 1] > 0 ? 'agent-stats__positive' : 'agent-stats__negative'}>{episodes[episodes.length - 1] > 0 ? `+${episodes[episodes.length - 1]}` : episodes[episodes.length - 1]}</span>
                </div>
              )}
            </div>
          </>
        )}
      </TransformWrapper>

      {tooltip && (
        <div
          className="graph-tooltip agent-q-tooltip"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <div className="graph-tooltip-title">We moved from {tooltip.node} to...</div>
              <div className="agent-q-tooltip-list">
                {tooltip.entries.map((entry) => (
                  <div key={`${tooltip.node}->${entry.to}`} className="agent-q-tooltip-entry">
                    <div className="agent-q-tooltip-edge">{entry.to}:</div>
                    <div className="agent-q-tooltip-formula">Q(s,a) ← Q(s,a) + α (r + γ·maxQ − Q(s,a))</div>
                    <div className="agent-q-tooltip-values">
                      Q(s,a) ← {`${entry.prev.toFixed(3)} + ${entry.alpha.toFixed(3)} * (${entry.reward.toFixed(3)} + ${entry.gamma.toFixed(3)} * ${entry.bestNext.toFixed(3)} - ${entry.prev.toFixed(3)})`}
                    </div>
                    <div className="agent-q-tooltip-values" >Q({tooltip.node},{tooltip.node} → {entry.to}) = <span className='agent-q-tooltip-result' style={{ color: qValueColor(entry.updated)}}>{entry.updated.toFixed(3)}</span></div>
                  </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentPlayView;
