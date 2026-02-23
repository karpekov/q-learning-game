import type { Coord } from '../../types';
import { NODE_RADIUS, PATH_ARROW_STROKE_WIDTH, PATH_ARROW_TIP_OFFSET } from '../playbackView/constants';
import { computeTrimmedArrowLine, qValueColor } from '../playbackView/utils';
import {
  arcPath,
  buildQuadrantValues,
  QUADRANT_BOUNDS,
} from '../graph/qValueRendering';
import type { QLabel } from './types';
import { resolveQValue } from '../playbackView/data';

type AgentCanvasProps = {
  width: number;
  height: number;
  vbX: number;
  vbY: number;
  vbW: number;
  vbH: number;
  coords: Record<string, Coord>;
  adjacency: Record<string, string[]>;
  neighbors: string[];
  visited: Set<string>;
  pathSegments: { key: string; from: Coord; to: Coord }[];
  visibleNodes: Set<string>;
  current: string;
  terminalRewards: Record<string, number>;
  everVisited: Set<string>;
  easyMode: boolean;
  hardMode: boolean;
  ended: boolean;
  qValueLabels: QLabel[];
  showQValues: boolean;
  activeQValueMap: Record<string, Record<string, number>>;
  onMoveTo: (state: string) => void;
  onNodeHover: (state: string, event: React.MouseEvent<SVGGElement, MouseEvent>) => void;
  onNodeLeave: () => void;
};

const NODE_STROKE = '#2f3a2a';
export function AgentCanvas({
  width,
  height,
  vbX,
  vbY,
  vbW,
  vbH,
  coords,
  adjacency,
  neighbors,
  visited,
  pathSegments,
  visibleNodes,
  current,
  terminalRewards,
  everVisited,
  easyMode,
  hardMode,
  ended,
  qValueLabels,
  showQValues,
  activeQValueMap,
  onMoveTo,
  onNodeHover,
  onNodeLeave,
}: AgentCanvasProps) {
  return (
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
          <path d="M0,0 L4,2 L0,4 z" fill="#2f6f86" />
        </marker>
      </defs>

      {/* Faint context edges between visible nodes that the agent has discovered */}
      <g stroke="#8f9982" strokeWidth={0.035} strokeOpacity={0.78}>
        {Array.from(visibleNodes).map((from) => {
          if (!everVisited.has(from)) return null;
          const fromC = coords[from];
          if (!fromC) return null;
          return (adjacency[from] || [])
            .filter((to) => visibleNodes.has(to) && everVisited.has(to))
            .map((to) => {
              const toC = coords[to];
              if (!toC) return null;
              return <line key={`visited-${from}->${to}`} x1={fromC[0]} y1={fromC[1]} x2={toC[0]} y2={toC[1]} />;
            });
        })}
      </g>

      <g stroke="#8f9982" strokeWidth={0.035} strokeOpacity={0.78}>
        {neighbors
          .filter((n) => !visited.has(n))
          .map((n) => {
            const a = coords[current];
            const b = coords[n];
            if (!a || !b) return null;
            return <line key={`cur-${current}->${n}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />;
          })}
      </g>

      {pathSegments.length > 0 && (
        <g stroke="#2f6f86" strokeWidth={PATH_ARROW_STROKE_WIDTH} strokeOpacity={0.9}>
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
                markerEnd="url(#agent-path-arrow)"
              />
            );
          })}
        </g>
      )}

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
              ? terminalRewards[state] > 0
                ? '#9fdfc0'
                : '#f3afa8'
              : '#f8ebb0'
            : showTerminalColor
              ? terminalRewards[state] > 0
                ? '#9fdfc0'
                : '#f3afa8'
              : wasEverVisited
                ? '#dbe2d3'
                : '#e5eadf';
          const d = NODE_RADIUS * Math.SQRT1_2;
          const nodeClass = isNeighbor && !ended ? 'agent-node agent-node--interactive' : 'agent-node';
          const stateNeighbors = adjacency[state] || [];
          const quadrantValues = buildQuadrantValues(
            [x, y],
            stateNeighbors,
            coords,
            (to, idx) => resolveQValue(activeQValueMap, state, to, idx)
          );

          return (
            <g
              key={state}
              className={nodeClass}
              onClick={() => isNeighbor && !ended && onMoveTo(state)}
              onMouseEnter={(event) => onNodeHover(state, event)}
              onMouseMove={(event) => onNodeHover(state, event)}
              onMouseLeave={onNodeLeave}
            >
              <circle cx={x} cy={y} r={NODE_RADIUS} fill={fill} stroke={NODE_STROKE} strokeWidth={isCurrent ? 0.12 : 0.06} opacity={0.92} />
              {!isTerminal && everVisited.has(state) && (!hardMode || visited.has(state)) && (
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

      {qValueLabels.length > 0 && showQValues && (
        <g className="agent-q-labels">
          {qValueLabels.map((label) => (
            <text key={label.key} x={label.x} y={label.y} className="agent-q-label" fill={label.color}>
              {label.label}
            </text>
          ))}
        </g>
      )}
    </svg>
  );
}
