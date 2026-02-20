import type { MouseEvent } from 'react';
import type { Coord } from '../../types';
import {
  NODE_RADIUS,
  PATH_ARROW_STROKE_WIDTH,
  PATH_ARROW_TIP_OFFSET,
  POLICY_ARROW_STROKE_WIDTH,
} from './constants';
import { computeTrimmedArrowLine, qValueColor } from './utils';
import { resolveQValue } from './data';
import type { PathSegment, PolicyArrow, QValueLabel } from './types';

type GraphCanvasProps = {
  width: number;
  height: number;
  vbX: number;
  vbY: number;
  vbW: number;
  vbH: number;
  coords: Record<string, Coord>;
  adjacency: Record<string, string[]>;
  terminalRewards: Record<string, number>;
  currentState?: string | null;
  pathSegments: PathSegment[];
  showPolicy: boolean;
  policyArrows: PolicyArrow[];
  showQValues: boolean;
  qValueLabels: QValueLabel[];
  activeQValueMap: Record<string, Record<string, number>>;
  onNodeHover: (state: string, event: MouseEvent<SVGGElement, globalThis.MouseEvent>) => void;
  onNodeLeave: () => void;
};

const NODE_STROKE = '#2f3a2a';
const QUADRANT_BOUNDS = [
  { key: 'top', start: -135, end: -45 },
  { key: 'right', start: -45, end: 45 },
  { key: 'bottom', start: 45, end: 135 },
  { key: 'left', start: 135, end: 225 },
] as const;

function arcPath(cx: number, cy: number, radius: number, startDeg: number, endDeg: number) {
  const startRad = (startDeg * Math.PI) / 180;
  const endRad = (endDeg * Math.PI) / 180;
  const sx = cx + radius * Math.cos(startRad);
  const sy = cy + radius * Math.sin(startRad);
  const ex = cx + radius * Math.cos(endRad);
  const ey = cy + radius * Math.sin(endRad);
  return `M ${cx} ${cy} L ${sx} ${sy} A ${radius} ${radius} 0 0 1 ${ex} ${ey} Z`;
}

export function GraphCanvas({
  width,
  height,
  vbX,
  vbY,
  vbW,
  vbH,
  coords,
  adjacency,
  terminalRewards,
  currentState,
  pathSegments,
  showPolicy,
  policyArrows,
  showQValues,
  qValueLabels,
  activeQValueMap,
  onNodeHover,
  onNodeLeave,
}: GraphCanvasProps) {
  return (
    <svg width={width} height={height} viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`} className="graph-viewer-canvas">
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
          <path d="M0,0 L4,2 L0,4 z" fill="#d97706" />
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
          <path d="M0,0 L4,2 L0,4 z" fill="#0b73f7" />
        </marker>
      </defs>

      <g stroke="#8f9982" strokeWidth={0.025} strokeOpacity={0.8}>
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

      {pathSegments.length > 0 && (
        <g stroke="#0b73f7" strokeWidth={PATH_ARROW_STROKE_WIDTH} strokeOpacity={0.95}>
          {pathSegments.map(({ key, from, to }) => {
            const trimmed = computeTrimmedArrowLine(from, to, NODE_RADIUS, PATH_ARROW_TIP_OFFSET);
            if (!trimmed) return null;
            return (
              <line
                key={`path-${key}`}
                x1={trimmed.startX}
                y1={trimmed.startY}
                x2={trimmed.endX}
                y2={trimmed.endY}
                markerEnd="url(#path-arrow)"
              />
            );
          })}
        </g>
      )}

      {showPolicy && policyArrows.length > 0 && (
        <g stroke="#d97706" strokeWidth={POLICY_ARROW_STROKE_WIDTH} opacity={1}>
          {policyArrows.map(({ key, startX, startY, endX, endY }) => (
            <line key={`policy-${key}`} x1={startX} y1={startY} x2={endX} y2={endY} markerEnd="url(#policy-arrow)" />
          ))}
        </g>
      )}

      <g>
        {Object.entries(coords).map(([state, [x, y]]) => {
          const isCurrent = currentState === state;
          const isTerminal = state in terminalRewards;
          const fill = isCurrent
            ? '#f8ebb0'
            : isTerminal
              ? terminalRewards[state] > 0
                ? '#9fdfc0'
                : '#f3afa8'
              : '#e5eadf';
          const d = NODE_RADIUS * Math.SQRT1_2;

          const quadrantValues: Record<string, number | null> = {
            top: null,
            right: null,
            bottom: null,
            left: null,
          };

          const neighbors = adjacency[state] || [];
          neighbors.forEach((to, idx) => {
            const value = resolveQValue(activeQValueMap, state, to, idx);
            if (value == null) return;
            const toCoord = coords[to];
            if (!toCoord) return;
            const [tx, ty] = toCoord;
            const angleDeg = Math.atan2(ty - y, tx - x) * (180 / Math.PI);
            let key: 'top' | 'right' | 'bottom' | 'left' = 'left';
            if (angleDeg >= -135 && angleDeg < -45) key = 'top';
            else if (angleDeg >= -45 && angleDeg < 45) key = 'right';
            else if (angleDeg >= 45 && angleDeg < 135) key = 'bottom';
            else key = 'left';
            const prev = quadrantValues[key];
            if (prev == null || value > prev) {
              quadrantValues[key] = value;
            }
          });

          return (
            <g
              key={state}
              onMouseEnter={(event) => onNodeHover(state, event)}
              onMouseMove={(event) => onNodeHover(state, event)}
              onMouseLeave={onNodeLeave}
            >
              <circle cx={x} cy={y} r={NODE_RADIUS} fill={fill} stroke={NODE_STROKE} strokeWidth={isCurrent ? 0.12 : 0.06} />
              {!isTerminal && (
                <>
                  {QUADRANT_BOUNDS.map(({ key, start, end }) => {
                    const value = quadrantValues[key];
                    const color = value == null ? fill : qValueColor(value);
                    return <path key={`${state}-quad-${key}`} d={arcPath(x, y, NODE_RADIUS, start, end)} fill={color} opacity={0.92} />;
                  })}
                  <line x1={x - d} y1={y - d} x2={x + d} y2={y + d} stroke={NODE_STROKE} strokeWidth={0.045} />
                  <line x1={x - d} y1={y + d} x2={x + d} y2={y - d} stroke={NODE_STROKE} strokeWidth={0.045} />
                </>
              )}
            </g>
          );
        })}
      </g>

      {showQValues && qValueLabels.length > 0 && (
        <g>
          {qValueLabels.map(({ key, x, y, label, color }) => (
            <text
              key={`q-${key}`}
              x={x}
              y={y}
              fontSize={0.19}
              fill={color}
              textAnchor="middle"
              alignmentBaseline="middle"
              paintOrder="stroke"
              stroke="#1f2a17"
              strokeWidth={0.016}
              pointerEvents="none"
              fontWeight={700}
            >
              {label}
            </text>
          ))}
        </g>
      )}
    </svg>
  );
}
