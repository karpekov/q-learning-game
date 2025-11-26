import React, { useEffect, useMemo, useState } from 'react';
import { Info } from 'lucide-react';
import type { Coord } from '../types';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import './AgentPlayView.css';

type Props = {
  coords: Record<string, Coord>;
  adjacency: Record<string, string[]>;
  terminalRewards: Record<string, number>;
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
  const [stepCost, setStepCost] = useState<number>(0); // cost per move
  const [stochasticity, setStochasticity] = useState<number>(0); // 0..1 chance to deviate
  const [showInfoTip, setShowInfoTip] = useState<boolean>(false);

  const latestReward = episodes.length ? episodes[episodes.length - 1] : null;
  const bestReward = episodes.length ? Math.max(...episodes) : null;

  const neighbors = useMemo(() => (current && adjacency[current]) || [], [adjacency, current]);

  const visibleNodes = useMemo(() => {
    if (easyMode) {
      return new Set<string>(Object.keys(coords));
    }
    const set = new Set<string>(everVisited);
    if (current) set.add(current);
    neighbors.forEach((n) => set.add(n));
    return set;
  }, [everVisited, current, neighbors, easyMode, coords]);

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

  function moveTo(intended: string) {
    if (ended) return; // round is over
    if (!neighbors.includes(intended)) return; // restrict to valid moves
    const actual = pickStochasticNeighbor(intended);
    setCurrent(actual);
    setVisited((prev) => new Set<string>(prev).add(actual));
    setEverVisited((prev) => new Set<string>(prev).add(actual));
    setPath((prev) => [...prev, actual]);
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
  }

  function undo() {
    if (path.length <= 1) return;
    const newPath = path.slice(0, -1);
    const newCurrent = newPath[newPath.length - 1];
    setCurrent(newCurrent);
    setPath(newPath);
    // Recompute visited from path
    setVisited(new Set(newPath));
  }

  // Reset play state whenever the graph changes
  useEffect(() => {
    reset();
    setEverVisited(new Set([defaultStart(coords)]));
    setEpisodes([]);
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

  return (
    <div className="agent-play-root">
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
            <div className="agent-controls-panel">
              <div className="agent-controls-row">
                {ended ? (
                  <button onClick={reset} className="agent-control-btn agent-control-btn--success">Try Again</button>
                ) : (
                  <button onClick={reset} className="agent-control-btn agent-control-btn--danger">Reset</button>
                )}
                <button
                  onClick={undo}
                  disabled={ended}
                  title={ended ? 'Round finished' : undefined}
                  className="agent-control-btn"
                >
                  Undo Move
                </button>
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
              <div className="agent-checkbox-row">
                <div
                  className="agent-info-trigger"
                  onMouseEnter={() => setShowInfoTip(true)}
                  onMouseLeave={() => setShowInfoTip(false)}
                >
                  <Info size={14} />
                  <div className={`agent-info-tip ${showInfoTip ? 'is-visible' : ''}`}>
                    Spoilers! Enabling Easy Mode will reveal the whole world.
                  </div>
                </div>
                <label>
                  <input
                    type="checkbox"
                    checked={easyMode}
                    onChange={(e) => setEasyMode(e.target.checked)}
                    className="agent-checkbox-input"
                  />
                  Easy Mode 
                </label>
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
                      <g key={state} className={nodeClass} onClick={() => isNeighbor && !ended && moveTo(state)}>
                        <circle cx={x} cy={y} r={r} fill={fill} stroke="#343a40" strokeWidth={0.05} opacity={opacity} />
                        {/* {!isTerminal && (
                          <>
                            <line x1={x - d} y1={y - d} x2={x + d} y2={y + d} stroke="#343a40" strokeWidth={0.04} opacity={opacity} />
                            <line x1={x - d} y1={y + d} x2={x + d} y2={y - d} stroke="#343a40" strokeWidth={0.04} opacity={opacity} />
                          </>
                        )} */}
                      </g>
                    );
                  })}
                </g>
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
    </div>
  );
};

export default AgentPlayView;
