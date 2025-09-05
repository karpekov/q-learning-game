import React from 'react';
import type { Coord } from '../types';

type Props = {
  coords: Record<string, Coord>;
  adjacency: Record<string, string[]>;
  terminalRewards: Record<string, number>;
  currentState?: string | null;
  path?: string[]; // sequence of visited states to draw
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

export const GraphViewer: React.FC<Props> = ({
  coords,
  adjacency,
  terminalRewards,
  currentState,
  path = [],
  width = 960,
  height = 640,
}) => {
  const { minX, maxX, minY, maxY } = computeBounds(coords);
  const pad = 1;
  const vbX = minX - pad;
  const vbY = minY - pad;
  const vbW = (maxX - minX) + pad * 2;
  const vbH = (maxY - minY) + pad * 2;

  // Build path points
  const pathPoints = path
    .filter((s) => coords[s])
    .map((s) => coords[s]);

  return (
    <svg width={width} height={height} viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`} style={{ border: '1px solid #e0e0e0', borderRadius: 8, background: '#f8f9fa' }}>
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

      {/* Nodes */}
      <g>
        {Object.entries(coords).map(([state, [x, y]]) => {
          const isCurrent = currentState === state;
          const isTerminal = state in terminalRewards;
          const fill = isCurrent ? '#ffcc00' : isTerminal ? (terminalRewards[state] > 0 ? '#a8e6cf' : '#ffaaa7') : '#e9ecef';
          const stroke = '#343a40';
          const r = 0.25; // radius in viewBox units
          return (
            <g key={state}>
              <circle cx={x} cy={y} r={r} fill={fill} stroke={stroke} strokeWidth={0.05} />
            </g>
          );
        })}
      </g>
    </svg>
  );
};

export default GraphViewer;

