import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api';
import type { GraphDef, GraphInfo, ExperimentListResponse, Episode, ExperimentDataSummary } from './types';
import GraphViewer from './components/GraphViewer';

const speedOptions = ["Slow", "Medium", "Fast", "Very Fast"] as const;
const speedFrames = [800, 400, 200, 100]; // ms per step

function App() {
  const [graphs, setGraphs] = useState<GraphInfo[]>([]);
  const [graphType, setGraphType] = useState<string>('custom_rooms');
  const [graphDef, setGraphDef] = useState<GraphDef | null>(null);

  const [expList, setExpList] = useState<ExperimentListResponse | null>(null);
  const [expId, setExpId] = useState<string>('');
  const [expData, setExpData] = useState<ExperimentDataSummary | null>(null);

  const [episodeIdx, setEpisodeIdx] = useState<number>(0);
  const [stepIdx, setStepIdx] = useState<number>(0);
  const [playing, setPlaying] = useState<boolean>(false);
  const [speedIndex, setSpeedIndex] = useState<number>(1);

  // Load graphs on mount
  useEffect(() => {
    api.graphs().then(setGraphs).catch(console.error);
  }, []);

  // Load graph def when graphType changes
  useEffect(() => {
    api.graphDef(graphType).then(setGraphDef).catch(console.error);
    // Load experiments for graph
    api.experiments(graphType).then((res) => {
      setExpList(res);
      const first = res.items[0]?.id || '';
      setExpId(first);
    }).catch(console.error);
  }, [graphType]);

  // Load experiment data when expId changes
  useEffect(() => {
    if (!expId) {
      setExpData(null);
      return;
    }
    api.experimentData(graphType, expId, true, 1).then((data) => {
      setExpData(data);
      setEpisodeIdx(0);
      setStepIdx(0);
    }).catch(console.error);
  }, [graphType, expId]);

  // Playback loop
  const timerRef = useRef<number | null>(null);
  useEffect(() => {
    if (!playing) {
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
      return;
    }
    const interval = speedFrames[speedIndex] ?? 400;
    timerRef.current = window.setInterval(() => {
      setStepIdx((prev) => {
        const eps = currentEpisode;
        if (!eps) return prev;
        const next = prev + 1;
        if (next > eps.steps.length) {
          // advance episode
          setEpisodeIdx((ei) => {
            const nextEp = ei + 1;
            if (expData?.episodes && nextEp < expData.episodes.length) {
              return nextEp;
            }
            // loop
            return 0;
          });
          return 0;
        }
        return next;
      });
    }, interval);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [playing, speedIndex, expData]);

  const currentEpisode: Episode | undefined = useMemo(() => {
    return expData?.episodes?.[episodeIdx];
  }, [expData, episodeIdx]);

  const currentState = useMemo(() => {
    const steps = currentEpisode?.steps || [];
    if (steps.length === 0) return undefined;
    const idx = Math.min(stepIdx, steps.length - 1);
    if (stepIdx === 0) return steps[0].state;
    if (stepIdx >= steps.length) return steps[steps.length - 1].next_state;
    return steps[idx].state;
  }, [currentEpisode, stepIdx]);

  const pathStates = useMemo(() => {
    const steps = currentEpisode?.steps || [];
    if (!steps.length) return [] as string[];
    const upto = Math.min(stepIdx, steps.length);
    const seq: string[] = [];
    for (let i = 0; i < upto; i++) {
      seq.push(steps[i].state);
    }
    if (upto > 0) seq.push(steps[Math.min(upto, steps.length) - 1].next_state);
    return seq;
  }, [currentEpisode, stepIdx]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 16 }}>
      <h2 style={{ margin: 0 }}>Q‑Learning Visualizer (Web)</h2>

      {/* Controls: graph + experiment selection */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <label>
          Graph:&nbsp;
          <select value={graphType} onChange={(e) => setGraphType(e.target.value)}>
            {graphs.map((g) => (
              <option key={g.key} value={g.key}>{g.key}</option>
            ))}
          </select>
        </label>

        <label>
          Experiment:&nbsp;
          <select value={expId} onChange={(e) => setExpId(e.target.value)} style={{ minWidth: 200 }}>
            {expList?.items.map((it) => (
              <option key={it.id} value={it.id}>{it.name}</option>
            ))}
          </select>
        </label>

        <button onClick={() => setPlaying((p) => !p)}>{playing ? 'Pause' : 'Play'}</button>
        <button onClick={() => { setStepIdx(0); }}>Restart Episode</button>
        <button onClick={() => { setEpisodeIdx((i) => Math.max(0, i - 1)); setStepIdx(0); }}>Prev Episode</button>
        <button onClick={() => { if (expData?.episodes) setEpisodeIdx((i) => Math.min(expData.episodes!.length - 1, i + 1)); setStepIdx(0); }}>Next Episode</button>

        <button onClick={() => setStepIdx((s) => Math.max(0, s - 1))}>Prev Step</button>
        <button onClick={() => setStepIdx((s) => s + 1)}>Next Step</button>

        <label>
          Speed:&nbsp;
          <select value={speedIndex} onChange={(e) => setSpeedIndex(parseInt(e.target.value, 10))}>
            {speedOptions.map((name, i) => (
              <option key={name} value={i}>{name}</option>
            ))}
          </select>
        </label>
      </div>

      {/* Info */}
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <strong>Episode:</strong> {episodeIdx + 1}/{expData?.episodes?.length || 0}
        </div>
        <div>
          <strong>Step:</strong> {Math.min(stepIdx, currentEpisode?.steps?.length || 0)}/{currentEpisode?.steps?.length || 0}
        </div>
        <div>
          <strong>Reward:</strong> {currentEpisode?.total_reward?.toFixed(2)}
        </div>
      </div>

      {/* Graph Viewer */}
      {graphDef && (
        <GraphViewer
          coords={graphDef.coords}
          adjacency={graphDef.adjacency}
          terminalRewards={graphDef.terminal_rewards}
          currentState={currentState}
          path={pathStates}
          width={960}
          height={640}
        />
      )}
    </div>
  );
}

export default App;
