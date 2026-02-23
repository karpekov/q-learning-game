import React, { useEffect, useMemo, useState } from 'react';
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch';
import { GraphCanvas } from './playbackView/playbackCanvas';
import { GraphInfoTip } from './playbackView/playbackInfoTip';
import { GraphStatsPanel } from './playbackView/playbackStatsPanel';
import { GraphTooltip } from './playbackView/playbacklTooltip';
import {
  buildEpisodicQValueMap,
  buildFinalQValueMap,
  buildPathSegments,
  buildPolicyArrows,
  buildQValueLabels,
  resolveQValue,
} from './playbackView/data';
import { arrowDirectionBetween } from './graph/qValueRendering';
import {
  createZoomCallbacks,
  DEFAULT_ZOOM_WRAPPER_PROPS,
  getRelativePointerPosition,
  useGraphViewBox,
} from './graph/view';
import type { PlaybackViewProps, TooltipData, TooltipEntry } from './playbackView/types';
import { formatQValue, qValueColor } from './playbackView/utils';
import './playbackView.css';

export const PlaybackView: React.FC<PlaybackViewProps> = ({
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

  const { vbX, vbY, vbW, vbH } = useGraphViewBox(coords);

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

          return {
            target: neighbor,
            label: formatQValue(value),
            color: qValueColor(value),
            direction: arrowDirectionBetween(center, coords[neighbor]),
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

      const { x, y } = getRelativePointerPosition(containerRef.current, event);

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
      <TransformWrapper {...DEFAULT_ZOOM_WRAPPER_PROPS}>
        {({ zoomIn, zoomOut, resetTransform }) => {
          const zoomHandlers = createZoomCallbacks(zoomIn, zoomOut, resetTransform);
          return (
            <>
              {playbackStats && (
                <GraphStatsPanel
                  playbackStats={playbackStats}
                  hyperParams={hyperParams}
                  showPolicy={showPolicy}
                  showQValues={showQValues}
                  setShowPolicy={setShowPolicy}
                  setShowQValues={setShowQValues}
                  onZoomOut={zoomHandlers.onZoomOut}
                  onResetTransform={zoomHandlers.onResetTransform}
                  onZoomIn={zoomHandlers.onZoomIn}
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
          );
        }}
      </TransformWrapper>
    </div>
  );
};

export default PlaybackView;
