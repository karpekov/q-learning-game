import React, { useEffect, useMemo, useState } from 'react';
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch';
import { GraphCanvas } from './graphViewer/GraphCanvas';
import { GraphInfoTip } from './graphViewer/GraphInfoTip';
import { GraphStatsPanel } from './graphViewer/GraphStatsPanel';
import { GraphTooltip } from './graphViewer/GraphTooltip';
import {
  buildEpisodicQValueMap,
  buildFinalQValueMap,
  buildPathSegments,
  buildPolicyArrows,
  buildQValueLabels,
  resolveQValue,
} from './graphViewer/data';
import type { GraphViewerProps, TooltipData, TooltipEntry } from './graphViewer/types';
import { angleToArrow, computeBounds, formatQValue, qValueColor } from './graphViewer/utils';
import './GraphViewer.css';

export const GraphViewer: React.FC<GraphViewerProps> = ({
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
  const [showPolicy, setShowPolicy] = useState(false);
  const [showQValues, setShowQValues] = useState(false);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);

  const { minX, maxX, minY, maxY } = useMemo(() => computeBounds(coords), [coords]);
  const pad = 1;
  const vbX = minX - pad;
  const vbY = minY - pad;
  const vbW = maxX - minX + pad * 2;
  const vbH = maxY - minY + pad * 2;

  const pathSegments = useMemo(() => buildPathSegments(path, coords), [path, coords]);

  const policyArrows = useMemo(
    () => buildPolicyArrows(policy, coords, adjacency),
    [policy, coords, adjacency]
  );

  const finalQValueMap = useMemo(() => buildFinalQValueMap(qValues), [qValues]);

  const episodicQValueMap = useMemo(
    () => buildEpisodicQValueMap(episodes, currentEpisodeIndex, currentStepIndex, adjacency),
    [episodes, currentEpisodeIndex, currentStepIndex, adjacency]
  );

  const activeQValueMap = useMemo(() => {
    if (playbackCompleted) {
      return finalQValueMap;
    }
    if (episodicQValueMap) {
      return episodicQValueMap;
    }
    return finalQValueMap;
  }, [playbackCompleted, episodicQValueMap, finalQValueMap]);

  const qValueLabels = useMemo(
    () => buildQValueLabels(activeQValueMap, adjacency, coords),
    [activeQValueMap, adjacency, coords]
  );

  useEffect(() => {
    if (!activeQValueMap || Object.keys(activeQValueMap).length === 0) {
      setTooltip(null);
    }
  }, [activeQValueMap]);

  const updateTooltip = React.useCallback(
    (state: string, event: React.MouseEvent<SVGGElement, MouseEvent>) => {
      const neighbors = adjacency[state] || [];
      const center = coords[state];

      const entries = neighbors
        .map((neighbor, idx) => {
          const value = resolveQValue(activeQValueMap, state, neighbor, idx);
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
        .filter((entry): entry is TooltipEntry => entry !== null);

      const terminalReward = terminalRewards[state];
      if (terminalReward != null) {
        entries.push({
          target: 'Terminal reward',
          label: formatQValue(terminalReward),
          color: qValueColor(terminalReward),
          direction: '',
        });
      }

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
    [adjacency, coords, activeQValueMap, terminalRewards]
  );

  return (
    <div ref={containerRef} className="graph-viewer-root" style={{ width, height }}>
      <TransformWrapper
        initialScale={1}
        minScale={0.5}
        maxScale={3}
        wheel={{ step: 0.1 }}
        doubleClick={{ disabled: true }}
      >
        {({ zoomIn, zoomOut, resetTransform }) => (
          <>
            {playbackStats && (
              <GraphStatsPanel
                playbackStats={playbackStats}
                hyperParams={hyperParams}
                showPolicy={showPolicy}
                showQValues={showQValues}
                setShowPolicy={setShowPolicy}
                setShowQValues={setShowQValues}
                onZoomOut={() => zoomOut()}
                onResetTransform={() => resetTransform()}
                onZoomIn={() => zoomIn()}
                onEpisodeJump={onEpisodeJump}
              />
            )}

            <GraphInfoTip />

            <TransformComponent wrapperClass="graph-view-wrapper" contentClass="graph-view-content">
              <GraphCanvas
                width={width}
                height={height}
                vbX={vbX}
                vbY={vbY}
                vbW={vbW}
                vbH={vbH}
                coords={coords}
                adjacency={adjacency}
                terminalRewards={terminalRewards}
                currentState={currentState}
                pathSegments={pathSegments}
                showPolicy={showPolicy}
                policyArrows={policyArrows}
                showQValues={showQValues}
                qValueLabels={qValueLabels}
                activeQValueMap={activeQValueMap}
                onNodeHover={updateTooltip}
                onNodeLeave={() => setTooltip(null)}
              />
            </TransformComponent>

            {tooltip && <GraphTooltip tooltip={tooltip} />}
          </>
        )}
      </TransformWrapper>
    </div>
  );
};

export default GraphViewer;
