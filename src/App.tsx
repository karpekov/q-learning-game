import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api';
import type { GraphDef, GraphInfo, ExperimentListResponse, Episode, ExperimentDataSummary } from './types';
import {Play, Pause, ChevronFirst, ChevronLast, RefreshCcw, SkipBack, SkipForward, ChevronLeft, ChevronRight} from 'lucide-react'
import GraphViewer from './components/GraphViewer';
import AgentPlayView from './components/AgentPlayView';
import ModePager from './components/ModePager';
import RewardTrendChart from './components/RewardTrendChart';

const speedOptions = ["Slow", "Medium", "Fast", "Very Fast"] as const;
const speedFrames = [800, 400, 200, 100]; // ms per step

function App() {
  const [mode, setMode] = useState<'playback' | 'play'>('play');
  const [graphs, setGraphs] = useState<GraphInfo[]>([]);
  const [graphType, setGraphType] = useState<string>('custom_rooms');
  const [graphDef, setGraphDef] = useState<GraphDef | null>(null);

  const [expList, setExpList] = useState<ExperimentListResponse | null>(null);
  const [expId, setExpId] = useState<string>('');
  const [expData, setExpData] = useState<ExperimentDataSummary | null>(null);

  const [episodeIdx, setEpisodeIdx] = useState<number>(0);
  const [stepIdx, setStepIdx] = useState<number>(0);
  const [playing, setPlaying] = useState<boolean>(false);
  const [speedIndex, setSpeedIndex] = useState<number>(3);

  // Responsive viewer sizing
  const [vw, setVw] = useState<number>(typeof window !== 'undefined' ? window.innerWidth : 1200);
  const [vh, setVh] = useState<number>(typeof window !== 'undefined' ? window.innerHeight : 800);
  useEffect(() => {
    function onResize() {
      setVw(window.innerWidth);
      setVh(window.innerHeight);
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const horizontalPadding = 32; // matches page padding
  const reservedTop = 220; // header + controls approx
  const viewerWidth = Math.max(320, vw - horizontalPadding);
  const viewerHeight = Math.max(300, vh - reservedTop);

  // Load graphs on mount
  useEffect(() => {
    api.graphs().then(setGraphs).catch(console.error);
  }, []);

  // Load graph def when graphType changes
  useEffect(() => {
    api.graphDef(graphType).then(setGraphDef).catch(console.error);
    if (mode === 'playback') {
      // Load experiments for graph
      api.experiments(graphType).then((res) => {
        setExpList(res);
        const first = res.items[0]?.id || '';
        setExpId(first);
      }).catch(console.error);
    }
  }, [graphType, mode]);

  // Load experiment data when expId changes (only in playback mode)
  useEffect(() => {
    if (mode !== 'playback') {
      setExpData(null);
      return;
    }
    if (!expId) {
      setExpData(null);
      return;
    }
    api.experimentData(graphType, expId, true, 1).then((data) => {
      setExpData(data);
      setEpisodeIdx(0);
      setStepIdx(0);
    }).catch(console.error);
  }, [graphType, expId, mode]);

  // Playback loop
  const timerRef = useRef<number | null>(null);
  useEffect(() => {
    if (mode !== 'playback' || !playing) {
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
            // finished all episodes; stop playback and scroll to summary
            setPlaying(false);
            const summarySection = document.querySelector('#reward-summary');
            if (summarySection instanceof HTMLElement) {
              summarySection.scrollIntoView({ behavior: 'smooth' });
            }
            return expData?.episodes ? expData.episodes.length - 1 : ei;
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
  }, [playing, speedIndex, expData, mode]);

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

  const rewardTrend = useMemo(() => {
    if (mode !== 'playback' || !expData?.episodes?.length) return [] as { index: number; value: number }[];
    return expData.episodes.map((episode, idx) => ({
      index: idx,
      value: typeof episode.total_reward === 'number' ? episode.total_reward : 0,
    }));
  }, [mode, expData]);

  // Pager helpers for edge arrows
  const pages = ['play', 'playback'] as const;
  const pageIndex = mode === 'play' ? 0 : 1;
  const goPage = (i: number) => {
    const clamped = Math.max(0, Math.min(pages.length - 1, i));
    setMode(pages[clamped]);
  };

  return (
    <div
      className="app-shell"
      id='container'
    >
      <section className="snap-section">
        <h2 className="app-title">Q-Learning Visualizer</h2>

        {/* Controls: graph + experiment selection */}
        <div className="app-controls">
          <ModePager mode={mode === 'play' ? 'play' : 'playback'} onChange={(m) => {setMode(m); setPlaying(false);}} />

          <label>
            Graph:&nbsp;
            <select value={graphType} onChange={(e) => setGraphType(e.target.value)}>
              {graphs.map((g) => (
                <option key={g.key} value={g.key}>{g.key}</option>
              ))}
            </select>
          </label>

          {mode === 'playback' && (
            <div className="playback-controls">
              <label>
                Experiment:&nbsp;
                <select className="select-wide" value={expId} onChange={(e) => setExpId(e.target.value)}>
                  {expList?.items.map((it) => (
                    <option key={it.id} value={it.id}>{it.name}</option>
                  ))}
                </select>
              </label>
              
              <div className="playback-group">
                <button onClick={() => { setStepIdx(0); setPlaying(false); setEpisodeIdx(0); }} title='Restart'><RefreshCcw  className='playback-icon'/></button>
                <button onClick={() => { setEpisodeIdx((i) => Math.max(0, i - 1)); setStepIdx(0); }} title='Previous episode'><SkipBack className='playback-icon' /></button>
                <button onClick={() => setStepIdx((s) => Math.max(0, s - 1))} title='Previous step'><ChevronFirst className='playback-icon' /></button>
                <button onClick={() => setPlaying((p) => !p)} title='Play/Pause'>{playing ? <Pause className='playback-icon' /> : <Play className='playback-icon'/>}</button>
                <button onClick={() => setStepIdx((s) => s + 1)} title="Next step"><ChevronLast className='playback-icon' /></button>
                <button onClick={() => { if (expData?.episodes) setEpisodeIdx((i) => Math.min(expData.episodes!.length - 1, i + 1)); setStepIdx(0); }} title='Next episode'><SkipForward className='playback-icon' /></button>
              </div>

              <label>
                Speed:&nbsp;
                <select value={speedIndex} onChange={(e) => setSpeedIndex(parseInt(e.target.value, 10))}>
                  {speedOptions.map((name, i) => (
                    <option key={name} value={i}>{name}</option>
                  ))}
                </select>
              </label>
            </div>
          )}
        </div>

        {/* Viewers with smooth transition */}
        {graphDef && (
          <div className="viewer-container" style={{ height: viewerHeight }}>
            {/* Edge pagination buttons */}
            <button
              aria-label="Previous mode"
              onClick={() => goPage(pageIndex - 1)}
              disabled={pageIndex <= 0}
              className="mode-switch-button mode-switch-button--left"
            >
              <ChevronLeft />
            </button>
            <button
              aria-label="Next mode"
              onClick={() => { goPage(pageIndex + 1); setPlaying(false); }}
              disabled={pageIndex >= pages.length - 1}
              className="mode-switch-button mode-switch-button--right"
            >
              <ChevronRight />
            </button>
            <div
              className={`viewer-pane viewer-pane--playback ${mode === 'playback' ? 'is-active' : ''}`}
            >
              <GraphViewer
                coords={graphDef.coords}
                adjacency={graphDef.adjacency}
                terminalRewards={graphDef.terminal_rewards}
                currentState={currentState}
                path={pathStates}
                width={viewerWidth}
                height={viewerHeight}
                playbackStats={mode === 'playback' ? {
                  episodeIndex: episodeIdx,
                  episodeCount: expData?.episodes?.length ?? 0,
                  stepIndex: stepIdx,
                  stepCount: currentEpisode?.steps?.length ?? 0,
                  totalReward: currentEpisode?.total_reward ?? null,
                } : undefined}
                policy={mode === 'playback' ? ((expData?.policy as Record<string, string | number> | undefined) ?? null) : null}
                qValues={mode === 'playback' ? (expData?.q_values ?? null) : null}
                hyperParams={mode === 'playback' ? {
                  alpha: typeof expData?.agent?.alpha === 'number' ? expData.agent.alpha : expData?.episodes?.[episodeIdx]?.alpha,
                  epsilon: typeof expData?.agent?.epsilon === 'number' ? expData.agent.epsilon : expData?.episodes?.[episodeIdx]?.epsilon,
                  gamma: typeof expData?.agent?.gamma === 'number' ? expData.agent.gamma : undefined,
                  stepCost: typeof expData?.environment?.step_cost === 'number' ? expData.environment.step_cost : undefined,
                  stochasticity: typeof expData?.environment?.stochasticity === 'number' ? expData.environment.stochasticity : undefined,
                } : null}
              />
            </div>
            <div
              className={`viewer-pane viewer-pane--play ${mode === 'play' ? 'is-active' : ''}`}
            >
              <AgentPlayView
                coords={graphDef.coords}
                adjacency={graphDef.adjacency}
                terminalRewards={graphDef.terminal_rewards}
                width={viewerWidth}
                height={viewerHeight}
              />
            </div>
          </div>
        )}
      </section>

      {mode === 'playback' && rewardTrend.length > 0 && (
        <section id="reward-summary" className="snap-section snap-section--centered">
          <RewardTrendChart points={rewardTrend} width={viewerWidth} />
        </section>
      )}
    </div>
  );
}

export default App;
