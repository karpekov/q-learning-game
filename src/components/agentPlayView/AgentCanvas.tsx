import type { Coord } from '../../types';
import { NODE_RADIUS, PATH_ARROW_STROKE_WIDTH, PATH_ARROW_TIP_OFFSET } from '../graphViewer/constants';
import { computeTrimmedArrowLine } from '../graphViewer/utils';
import type { QLabel } from './types';

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
  onMoveTo: (state: string) => void;
  onNodeHover: (state: string, event: React.MouseEvent<SVGGElement, MouseEvent>) => void;
  onNodeLeave: () => void;
};

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
          <path d="M0,0 L4,2 L0,4 z" fill="#16a67d" />
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
        <g stroke="#16a67d" strokeWidth={PATH_ARROW_STROKE_WIDTH} strokeOpacity={0.9}>
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
          const opacity = isCurrent ? 1 : isNeighbor ? 0.62 : 0.9;
          const r = NODE_RADIUS;
          const d = r * Math.SQRT1_2;
          const nodeClass = isNeighbor && !ended ? 'agent-node agent-node--interactive' : 'agent-node';

          return (
            <g
              key={state}
              className={nodeClass}
              onClick={() => isNeighbor && !ended && onMoveTo(state)}
              onMouseEnter={(event) => onNodeHover(state, event)}
              onMouseMove={(event) => onNodeHover(state, event)}
              onMouseLeave={onNodeLeave}
            >
              <circle cx={x} cy={y} r={r} fill={fill} stroke="#2f3a2a" strokeWidth={isCurrent ? 0.085 : 0.06} opacity={opacity} />
              {!isTerminal && everVisited.has(state) && (!hardMode || visited.has(state)) && (
                <>
                  <line x1={x - d} y1={y - d} x2={x + d} y2={y + d} stroke="#2f3a2a" strokeWidth={0.045} opacity={opacity} />
                  <line x1={x - d} y1={y + d} x2={x + d} y2={y - d} stroke="#2f3a2a" strokeWidth={0.045} opacity={opacity} />
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
