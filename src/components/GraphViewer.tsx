import React, { useState, useEffect } from 'react';
import type { Coord } from '../types';

type PlaybackStats = {
  episodeIndex: number;
  episodeCount: number;
  stepIndex: number;
  stepCount: number;
  totalReward?: number | null;
};

type PolicyValue = string | number;

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

export const GraphViewer: React.FC<Props> = ({
  coords,
  adjacency,
  terminalRewards,
  currentState,
  path = [],
  width = 960,
  height = 640,
  playbackStats,
  policy,
}) => {
  const { minX, maxX, minY, maxY } = computeBounds(coords);
  const pad = 1;
  const vbX = minX - pad;
  const vbY = minY - pad;
  const vbW = (maxX - minX) + pad * 2;
  const vbH = (maxY - minY) + pad * 2;

  const pathPoints = path
    .filter((s) => coords[s])
    .map((s) => coords[s]);

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

  const [showPolicy, setShowPolicy] = useState(true);

  useEffect(() => {
    if (policy) {
      setShowPolicy(true);
    }
  }, [policy]);

  return (
    <div style={{ position: 'relative', width, height }}>
      {playbackStats && (
        <div
          style={{
            position: 'absolute',
            gap: 24,
            alignItems: 'center',
            bottom: 8,
            left: 8,
            zIndex: 50,
            display: 'flex',
            backgroundColor: 'rgba(234,238,224,0.7)',
            padding: 12,
            borderRadius: 8,
            backdropFilter: 'blur(4px)',
          }}
        >
          <div>
            <strong>Episode:</strong> {playbackStats.episodeIndex + 1}/{playbackStats.episodeCount}
          </div>
          <div>
            <strong>Step:</strong> {Math.min(playbackStats.stepIndex, playbackStats.stepCount)}/{playbackStats.stepCount}
          </div>
          <div>
            <strong>Reward:</strong> {playbackStats.totalReward != null ? playbackStats.totalReward.toFixed(2) : '-'}
          </div>
          <div>
            <label style={{ userSelect: 'none' }}>
              <input
                type="checkbox"
                checked={showPolicy}
                onChange={() => setShowPolicy((v) => !v)}
                disabled={!policy}
              />{' '}
              Show Policy
            </label>
          </div>
        </div>
      )}

      <svg
        width={width}
        height={height}
        viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
        style={{ borderRadius: 8, background: '#f8f9fa' }}
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
        {pathPoints.length > 1 && (
          <polyline
            points={pathPoints.map(([x, y]) => `${x},${y}`).join(' ')}
            fill="none"
            stroke="#0d6efd"
            strokeWidth={0.12}
            strokeOpacity={0.9}
          />
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
              <g key={state}>
                <circle cx={x} cy={y} r={r} fill={fill} stroke={stroke} strokeWidth={0.05} />
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
};

export default GraphViewer;
