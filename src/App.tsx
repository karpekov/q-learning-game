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
  const [playbackCompleted, setPlaybackCompleted] = useState<boolean>(false);

  // Responsive viewer sizing
  const [vw, setVw] = useState<number>(typeof window !== 'undefined' ? window.innerWidth : 1200);
  const [vh, setVh] = useState<number>(typeof window !== 'undefined' ? window.innerHeight : 800);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const [headerHeight, setHeaderHeight] = useState<number>(180);
  useEffect(() => {
    function onResize() {
      setVw(window.innerWidth);
      setVh(window.innerHeight);
      measureHeader();
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  
  const horizontalPadding = 32; // matches page padding
  const viewerWidth = Math.max(320, vw - horizontalPadding);
  const viewerHeight = Math.max(300, vh - headerHeight - 24); // leave a small buffer

  const measureHeader = () => {
    const h = headerRef.current?.getBoundingClientRect().height ?? 0;
    if (h && Math.abs(h - headerHeight) > 2) {
      setHeaderHeight(h);
    }
  };

  useEffect(() => {
    measureHeader();
  }, [mode, expId, graphType, expData, vw, vh]);

  // Load graphs on mount
  useEffect(() => {
    api.graphs().then(setGraphs).catch(console.error);
  }, []);

  // Load graph def when graphType changes
  useEffect(() => {
    setPlaying(false);
    setPlaybackCompleted(false);
    setStepIdx(0);
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
    if (expId) {
      setPlaying(false);
      setPlaybackCompleted(false);
      setStepIdx(0);
    }
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
      setPlaybackCompleted(false);
    }).catch(console.error);
  }, [graphType, expId, mode]);

  useEffect(() => {
    if (mode !== 'playback') {
      setPlaybackCompleted(false);
    }
  }, [mode]);

  const currentEpisode: Episode | undefined = useMemo(() => {
    return expData?.episodes?.[episodeIdx];
  }, [expData, episodeIdx]);

  const episodeIdxRef = useRef(episodeIdx);
  useEffect(() => {
    episodeIdxRef.current = episodeIdx;
  }, [episodeIdx]);

  const expDataRef = useRef<ExperimentDataSummary | null>(expData);
  useEffect(() => {
    expDataRef.current = expData;
  }, [expData]);

  const stepIdxRef = useRef(stepIdx);
  useEffect(() => {
    stepIdxRef.current = stepIdx;
  }, [stepIdx]);

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
      const data = expDataRef.current;
      const idx = episodeIdxRef.current;
      const eps = data?.episodes?.[idx];
      if (!eps) return;

      const nextStep = stepIdxRef.current + 1;
      if (nextStep > eps.steps.length) {
        const latestData = expDataRef.current;
        const nextEp = idx + 1;
        if (latestData?.episodes && nextEp < latestData.episodes.length) {
          episodeIdxRef.current = nextEp;
          stepIdxRef.current = 0;
          setEpisodeIdx(nextEp);
          setStepIdx(0);
          return;
        }

        setPlaying(false);
        setPlaybackCompleted(true);
        const summarySection = document.querySelector('#reward-summary');
        if (summarySection instanceof HTMLElement) {
          summarySection.scrollIntoView({ behavior: 'smooth' });
        }

        if (latestData?.episodes && latestData.episodes.length > 0) {
          const finalIndex = Math.max(0, latestData.episodes.length - 1);
          episodeIdxRef.current = finalIndex;
          setEpisodeIdx(finalIndex);
          stepIdxRef.current = latestData.episodes[finalIndex]?.steps.length ?? 0;
          setStepIdx((latestData.episodes[finalIndex]?.steps.length ?? 0));
        } else {
          stepIdxRef.current = 0;
          setStepIdx(0);
        }
        return;
      }

      stepIdxRef.current = nextStep;
      setStepIdx(nextStep);
    }, interval);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [playing, speedIndex, expData, mode]);

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

  const jumpToEpisode = (value: number) => {
    if (!expData?.episodes?.length) return;
    const maxIndex = expData.episodes.length - 1;
    const target = Math.min(Math.max(0, value), maxIndex);
    setEpisodeIdx(target);
    setStepIdx(0);
    setPlaybackCompleted(false);
  };

  return (
    <div
      className="app-shell"
      id='container'
    >
      <section className="snap-section">
        <div ref={headerRef}>
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
                  <button onClick={() => { setStepIdx(0); setPlaying(false); setEpisodeIdx(0); setPlaybackCompleted(false); }} title='Restart'><RefreshCcw  className='playback-icon'/></button>
                  <button onClick={() => { setEpisodeIdx((i) => Math.max(0, i - 1)); setStepIdx(0); setPlaybackCompleted(false); }} title='Previous episode'><SkipBack className='playback-icon' /></button>
                  <button onClick={() => { setPlaybackCompleted(false); setStepIdx((s) => Math.max(0, s - 1)); }} title='Previous step'><ChevronFirst className='playback-icon' /></button>
                  <button onClick={() => { if (!playing) setPlaybackCompleted(false); setPlaying((p) => !p); }} title='Play/Pause'>{playing ? <Pause className='playback-icon' /> : <Play className='playback-icon'/>}</button>
                  <button onClick={() => { setPlaybackCompleted(false); setStepIdx((s) => s + 1); }} title="Next step"><ChevronLast className='playback-icon' /></button>
                  <button onClick={() => { if (expData?.episodes) setEpisodeIdx((i) => Math.min(expData.episodes!.length - 1, i + 1)); setStepIdx(0); setPlaybackCompleted(false); }} title='Next episode'><SkipForward className='playback-icon' /></button>
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
                episodes={mode === 'playback' ? (expData?.episodes ?? null) : null}
                currentEpisodeIndex={mode === 'playback' ? episodeIdx : undefined}
                currentStepIndex={mode === 'playback' ? stepIdx : undefined}
                playbackCompleted={mode === 'playback' ? playbackCompleted : undefined}
                onEpisodeJump={mode === 'playback' ? jumpToEpisode : undefined}
                hyperParams={mode === 'playback' ? {
                  alpha: typeof expData?.episodes?.[episodeIdx]?.alpha === 'number'
                    ? expData?.episodes?.[episodeIdx]?.alpha
                    : (typeof expData?.agent?.alpha === 'number' ? expData.agent.alpha : undefined),
                  epsilon: typeof expData?.episodes?.[episodeIdx]?.epsilon === 'number'
                    ? expData?.episodes?.[episodeIdx]?.epsilon
                    : (typeof expData?.agent?.epsilon === 'number' ? expData.agent.epsilon : undefined),
                  alphaDecayRate: typeof expData?.agent?.alpha_decay_rate === 'number' ? expData.agent.alpha_decay_rate : undefined,
                  epsilonDecay: typeof expData?.agent?.epsilon_decay === 'number' ? expData.agent.epsilon_decay : undefined,
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
