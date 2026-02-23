import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch';
import { AgentCanvas } from './playAsAgentView/AgentCanvas';
import { AgentControlsPanel } from './playAsAgentView/AgentControlsPanel';
import { AgentStatsPanel } from './playAsAgentView/AgentStatsPanel';
import { AgentTooltip } from './playAsAgentView/AgentTooltip';
import {
  createZoomCallbacks,
  DEFAULT_ZOOM_WRAPPER_PROPS,
  getRelativePointerPosition,
  useGraphViewBox,
} from './graph/view';
import {
  buildAgentQValueLabels,
  buildAgentTooltipEntries,
  calculateQValueUpdate,
  defaultStart,
  pickStochasticNeighbor,
} from './playAsAgentView/data';
import type { PlayAsAgentViewProps, AgentTooltipData, QCalculation } from './playAsAgentView/types';
import { buildPathSegments } from './playbackView/data';
import './playAsAgentView.css';

export const PlayAsAgentView: React.FC<PlayAsAgentViewProps> = ({
  coords,
  adjacency,
  terminalRewards,
  alpha = 0.1,
  gamma = 0.9,
  onQValueCalculated,
  width = 960,
  height = 640,
}) => {
  const { vbX, vbY, vbW, vbH } = useGraphViewBox(coords);

  const start = useMemo(() => defaultStart(coords), [coords]);
  const [current, setCurrent] = useState<string>(start);
  const [visited, setVisited] = useState<Set<string>>(new Set([start]));
  const [everVisited, setEverVisited] = useState<Set<string>>(new Set([start]));
  const [path, setPath] = useState<string[]>([start]);
  const [ended, setEnded] = useState<boolean>(false);
  const [episodes, setEpisodes] = useState<number[]>([]);
  const [easyMode, setEasyMode] = useState<boolean>(false);
  const [hardMode, setHardMode] = useState<boolean>(false);
  const [showQValues, setShowQValues] = useState<boolean>(true);
  const [stepCost, setStepCost] = useState<number>(0);
  const [stochasticity, setStochasticity] = useState<number>(0);

  const qValuesRef = useRef<Record<string, Record<string, number>>>({});
  const qCalcRef = useRef<Record<string, QCalculation>>({});
  const [qVersion, setQVersion] = useState<number>(0);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [tooltip, setTooltip] = useState<AgentTooltipData | null>(null);

  const latestReward = episodes.length ? episodes[episodes.length - 1] : null;
  const bestReward = episodes.length ? Math.max(...episodes) : null;

  const neighbors = useMemo(() => (current && adjacency[current]) || [], [adjacency, current]);
  const activeQValueMap = qValuesRef.current;

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
  }, [everVisited, current, neighbors, easyMode, coords, hardMode, visited]);

  const pathSegments = useMemo(() => buildPathSegments(path, coords), [path, coords]);

  const calculateQValue = useCallback((from: string, to: string) => {
    const { updatedQValues, calc, previous, updated } = calculateQValueUpdate(
      from,
      to,
      qValuesRef.current,
      adjacency,
      terminalRewards,
      alpha,
      gamma,
      stepCost
    );

    qValuesRef.current = updatedQValues;
    qCalcRef.current = {
      ...qCalcRef.current,
      [`${from}->${to}`]: calc,
    };
    setQVersion((v) => v + 1);

    return { updated, previous };
  }, [adjacency, alpha, gamma, terminalRewards, stepCost]);

  const moveTo = useCallback((intended: string) => {
    if (ended) return;
    if (!neighbors.includes(intended)) return;
    setTooltip(null);

    const actual = pickStochasticNeighbor(intended, current, stochasticity, coords, adjacency);
    const fromState = current;

    setCurrent(actual);
    setVisited((prev) => new Set<string>(prev).add(actual));
    setEverVisited((prev) => new Set<string>(prev).add(actual));
    setPath((prev) => [...prev, actual]);

    if (fromState) {
      const qValue = calculateQValue(fromState, actual);
      if (onQValueCalculated) {
        onQValueCalculated({ from: fromState, to: actual, qValue: qValue.updated });
      }
    }

    if (actual in terminalRewards) {
      const reward = terminalRewards[actual];
      const moves = path.length;
      const total = -moves * stepCost + reward;
      setEnded(true);
      setEpisodes((prev) => [...prev, total]);
    }
  }, [ended, neighbors, current, stochasticity, coords, adjacency, calculateQValue, onQValueCalculated, terminalRewards, path.length, stepCost]);

  const reset = useCallback(() => {
    const s = defaultStart(coords);
    setCurrent(s);
    setVisited(new Set([s]));
    setEverVisited((prev) => new Set(prev).add(s));
    setPath([s]);
    setEnded(false);
    setTooltip(null);
  }, [coords]);

  useEffect(() => {
    reset();
    setEverVisited(new Set([defaultStart(coords)]));
    setEpisodes([]);
    qValuesRef.current = {};
    qCalcRef.current = {};
    setTooltip(null);
    setQVersion((v) => v + 1);
  }, [coords, adjacency, reset]);

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
            if (dy >= 0) break;
            const score = -dy - Math.abs(dx) * 0.001;
            if (score > bestScore) {
              bestScore = score;
              candidate = n;
            }
            break;
          }
          case 'ArrowDown': {
            if (dy <= 0) break;
            const score = dy - Math.abs(dx) * 0.001;
            if (score > bestScore) {
              bestScore = score;
              candidate = n;
            }
            break;
          }
          case 'ArrowLeft': {
            if (dx >= 0) break;
            const score = -dx - Math.abs(dy) * 0.001;
            if (score > bestScore) {
              bestScore = score;
              candidate = n;
            }
            break;
          }
          case 'ArrowRight': {
            if (dx <= 0) break;
            const score = dx - Math.abs(dy) * 0.001;
            if (score > bestScore) {
              bestScore = score;
              candidate = n;
            }
            break;
          }
        }
      }
      return candidate;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        const next = pickNeighborByDirection(event.key);
        if (next) {
          event.preventDefault();
          moveTo(next);
        }
      }

      if (event.key === 'Enter' && ended) {
        event.preventDefault();
        reset();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [current, neighbors, coords, ended, moveTo, reset]);

  const qValueLabels = useMemo(
    () => buildAgentQValueLabels(qValuesRef.current, coords, adjacency),
    [coords, adjacency, qVersion]
  );

  const showNodeTooltip = useCallback((state: string, event: React.MouseEvent<SVGGElement, MouseEvent>) => {
    const entries = buildAgentTooltipEntries(
      state,
      adjacency,
      coords,
      qValuesRef.current,
      qCalcRef.current,
      terminalRewards,
      stepCost,
      alpha,
      gamma
    );

    if (!entries.length) {
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
  }, [adjacency, alpha, coords, gamma, stepCost, terminalRewards]);

  return (
    <div className="agent-play-root" ref={containerRef}>
      <TransformWrapper {...DEFAULT_ZOOM_WRAPPER_PROPS}>
        {({ zoomIn, zoomOut, resetTransform }) => {
          const zoomHandlers = createZoomCallbacks(zoomIn, zoomOut, resetTransform);
          return (
            <>
              <AgentControlsPanel
                ended={ended}
                reset={reset}
                current={current}
                visitedCount={visited.size}
                stepCost={stepCost}
                setStepCost={setStepCost}
                stochasticity={stochasticity}
                setStochasticity={setStochasticity}
                easyMode={easyMode}
                setEasyMode={setEasyMode}
                hardMode={hardMode}
                setHardMode={setHardMode}
                showQValues={showQValues}
                setShowQValues={setShowQValues}
                onZoomOut={zoomHandlers.onZoomOut}
                onResetTransform={zoomHandlers.onResetTransform}
                onZoomIn={zoomHandlers.onZoomIn}
              />

              <TransformComponent wrapperClass="agent-play-wrapper" contentClass="agent-play-content">
                <AgentCanvas
                  width={width}
                  height={height}
                  vbX={vbX}
                  vbY={vbY}
                  vbW={vbW}
                  vbH={vbH}
                  coords={coords}
                  adjacency={adjacency}
                  neighbors={neighbors}
                  visited={visited}
                  pathSegments={pathSegments}
                  visibleNodes={visibleNodes}
                  current={current}
                  terminalRewards={terminalRewards}
                  everVisited={everVisited}
                  easyMode={easyMode}
                  hardMode={hardMode}
                  ended={ended}
                  qValueLabels={qValueLabels}
                  showQValues={showQValues}
                  activeQValueMap={activeQValueMap}
                  onMoveTo={moveTo}
                  onNodeHover={showNodeTooltip}
                  onNodeLeave={() => setTooltip(null)}
                />
              </TransformComponent>

              <AgentStatsPanel
                pathLength={path.length}
                stepCost={stepCost}
                ended={ended}
                current={current}
                terminalRewards={terminalRewards}
                episodes={episodes}
                latestReward={latestReward}
                bestReward={bestReward}
              />
            </>
          );
        }}
      </TransformWrapper>

      {tooltip && <AgentTooltip tooltip={tooltip} />}
    </div>
  );
};

export default PlayAsAgentView;
