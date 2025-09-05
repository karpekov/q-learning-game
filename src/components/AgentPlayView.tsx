import React, { useEffect, useMemo, useState } from 'react';
import type { Coord } from '../types';

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
  const [path, setPath] = useState<string[]>([start]);
  const [ended, setEnded] = useState<boolean>(false);
  const [episodes, setEpisodes] = useState<number[]>([]); // rewards per finished round
  const [easyMode, setEasyMode] = useState<boolean>(false);
  const [stepCost, setStepCost] = useState<number>(0); // cost per move
  const [stochasticity, setStochasticity] = useState<number>(0); // 0..1 chance to deviate

  const latestReward = episodes.length ? episodes[episodes.length - 1] : null;
  const bestReward = episodes.length ? Math.max(...episodes) : null;

  const neighbors = useMemo(() => (current && adjacency[current]) || [], [adjacency, current]);

  const visibleNodes = useMemo(() => {
    if (easyMode) {
      return new Set<string>(Object.keys(coords));
    }
    const set = new Set<string>(visited);
    if (current) set.add(current);
    neighbors.forEach((n) => set.add(n));
    return set;
  }, [visited, current, neighbors, easyMode, coords]);

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
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [current, neighbors, coords, ended]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {ended ? 
          <button onClick={reset} style={{ background: '#47a851'}}>Start New Round</button> 
          : 
          <button onClick={reset} style={{ background: '#f40c0c'}}>Reset to Start</button>
        }
        <button onClick={undo} disabled={ended} title={ended ? 'Round finished' : undefined}>Undo Move</button>
        <div><strong>Current:</strong> {current}</div>
        <div><strong>Visited:</strong> {visited.size}</div>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span>Step cost:</span>
          <input
            type="range"
            min={0}
            max={5}
            step={0.1}
            value={stepCost}
            onChange={(e) => setStepCost(parseFloat(e.target.value))}
          />
          <span style={{ minWidth: 36, textAlign: 'right' }}>{stepCost.toFixed(1)}</span>
        </label>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span>Stochasticity:</span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={Math.round(stochasticity * 100)}
            onChange={(e) => setStochasticity(Math.max(0, Math.min(1, parseInt(e.target.value, 10) / 100)))}
          />
          <span style={{ minWidth: 36, textAlign: 'right' }}>{Math.round(stochasticity * 100)}%</span>
        </label>
        
      </div>
      
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', fontSize: 14 }}>
        {(() => {
          const moves = Math.max(0, path.length - 1);
          const term = ended && current in terminalRewards ? terminalRewards[current] : 0;
          const currentScore = -moves * stepCost + (ended ? term : 0);
          return (
            <>
              <div><strong>Moves:</strong> {moves}</div>
              <div><strong>Current:</strong> {currentScore > 0 ? `+${currentScore}` : `${currentScore}`}</div>
            </>
          );
        })()}
        <div><strong>Episodes:</strong> {episodes.length}</div>
        <div><strong>Latest:</strong> {latestReward !== null ? (latestReward > 0 ? `+${latestReward.toFixed(2)}` : `${latestReward.toFixed(2)}`) : '-'}</div>
        <div><strong>Best:</strong> {bestReward !== null ? (bestReward > 0 ? `+${bestReward.toFixed(2)}` : `${bestReward.toFixed(2)}`) : '-'}</div>
        {ended && (
          <div style={{ color: '#0d6efd' }}>
            Round finished. Terminal: {terminalRewards[current] > 0 ? `+${terminalRewards[current]}` : terminalRewards[current]}. Total with step cost applied: {episodes[episodes.length - 1] > 0 ? `+${episodes[episodes.length - 1]}` : episodes[episodes.length - 1]}
          </div>
        )}
        <></>
        <div style={{ fontSize: 12, color: '#6c757d' }}>
          Hint: Click neighboring nodes or use the arrow keys to move.
        </div>
        <div>
          <label>
            <input type="checkbox" 
              checked={easyMode} 
              onChange={(e) => setEasyMode(e.target.checked)}
              style={{ marginRight: 4 }}
            />
            Easy Mode
          </label>
        </div>
      </div>

      <svg width={width} height={height} viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`} style={{ border: '1px solid #e0e0e0', borderRadius: 8, background: '#f8f9fa' }}>
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
        {path.length > 1 && (
          <polyline
            points={path.map((s) => coords[s]).filter(Boolean).map(([x, y]) => `${x},${y}`).join(' ')}
            fill="none"
            stroke="#20c997"
            strokeWidth={0.12}
            strokeOpacity={0.7}
          />
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
            const showTerminalColor = isTerminal && hasVisited;
            const fill = isCurrent
              ? showTerminalColor 
                ? (terminalRewards[state] > 0 ? '#a8e6cf' : '#ffaaa7') 
                : '#ffcc00'
              : showTerminalColor
                ? (terminalRewards[state] > 0 ? '#a8e6cf' : '#ffaaa7')
                : '#e9ecef';
            const opacity = isCurrent ? 1 : isNeighbor ? 0.5 : 1; // neighbors less opacity
            const r = 0.25;
            return (
              <g key={state} style={{ cursor: isNeighbor && !ended ? 'pointer' : 'default' }} onClick={() => isNeighbor && !ended && moveTo(state)}>
                <circle cx={x} cy={y} r={r} fill={fill} stroke="#343a40" strokeWidth={0.05} opacity={opacity} />
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
};

export default AgentPlayView;
