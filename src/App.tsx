import { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, RefreshCcw, SkipBack, SkipForward, StepBack, StepForward, X } from 'lucide-react';
import { api } from './api';
import type { Episode, ExperimentDataSummary, ExperimentListResponse, GraphDef, GraphInfo } from './types';
import PlayAsAgentView from './components/playAsAgentView';
import PlaybackView from './components/playbackView';
import ModePager from './components/ModePager';
import RewardTrendChart from './components/RewardTrendChart';

const speedOptions = ['Slow', 'Medium', 'Fast', 'Very Fast'] as const;
const speedFrames = [800, 400, 200, 100];

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

  const [loadingGraphs, setLoadingGraphs] = useState<boolean>(false);
  const [loadingGraphDef, setLoadingGraphDef] = useState<boolean>(false);
  const [loadingExperiments, setLoadingExperiments] = useState<boolean>(false);
  const [loadingExpData, setLoadingExpData] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  const [showOnboarding, setShowOnboarding] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return window.localStorage.getItem('qlv-onboarding-dismissed') !== '1';
  });

  const viewerHostRef = useRef<HTMLDivElement | null>(null);
  const [viewerSize, setViewerSize] = useState<{ width: number; height: number }>({ width: 960, height: 640 });

  useEffect(() => {
    const host = viewerHostRef.current;
    if (!host) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const width = Math.max(320, Math.floor(entry.contentRect.width));
      const height = Math.max(300, Math.floor(entry.contentRect.height));
      setViewerSize({ width, height });
    });

    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setLoadingGraphs(true);
    setErrorMessage('');
    api
      .graphs()
      .then((items) => {
        setGraphs(items);
        if (!items.some((g) => g.key === graphType)) {
          const fallback = items[0]?.key;
          if (fallback) setGraphType(fallback);
        }
      })
      .catch((error: unknown) => {
        console.error(error);
        setErrorMessage('Could not load available graphs. Check API connectivity and refresh.');
      })
      .finally(() => {
        setLoadingGraphs(false);
      });
  }, [graphType]);

  useEffect(() => {
    setPlaying(false);
    setPlaybackCompleted(false);
    setStepIdx(0);
    setLoadingGraphDef(true);
    setErrorMessage('');

    api
      .graphDef(graphType)
      .then((definition) => {
        setGraphDef(definition);
      })
      .catch((error: unknown) => {
        console.error(error);
        setGraphDef(null);
        setErrorMessage(`Could not load graph definition for "${graphType}".`);
      })
      .finally(() => {
        setLoadingGraphDef(false);
      });

    if (mode !== 'playback') {
      setExpList(null);
      return;
    }

    setLoadingExperiments(true);
    api
      .experiments(graphType)
      .then((res) => {
        setExpList(res);
        const first = res.items[0]?.id || '';
        setExpId(first);
      })
      .catch((error: unknown) => {
        console.error(error);
        setExpList({ graph_type: graphType, count: 0, items: [] });
        setExpId('');
        setErrorMessage(`Could not load experiments for "${graphType}".`);
      })
      .finally(() => {
        setLoadingExperiments(false);
      });
  }, [graphType, mode]);

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

    setLoadingExpData(true);
    setErrorMessage('');
    api
      .experimentData(graphType, expId, true, 1)
      .then((data) => {
        setExpData(data);
        setEpisodeIdx(0);
        setStepIdx(0);
        setPlaybackCompleted(false);
      })
      .catch((error: unknown) => {
        console.error(error);
        setExpData(null);
        setErrorMessage(`Could not load experiment "${expId}".`);
      })
      .finally(() => {
        setLoadingExpData(false);
      });
  }, [graphType, expId, mode]);

  useEffect(() => {
    if (mode !== 'playback') setPlaybackCompleted(false);
  }, [mode]);

  const currentEpisode: Episode | undefined = useMemo(() => expData?.episodes?.[episodeIdx], [expData, episodeIdx]);

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
          setStepIdx(latestData.episodes[finalIndex]?.steps.length ?? 0);
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
  }, [playing, speedIndex, mode]);

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
    for (let i = 0; i < upto; i += 1) seq.push(steps[i].state);
    if (upto > 0) seq.push(steps[Math.min(upto, steps.length) - 1].next_state);
    return seq;
  }, [currentEpisode, stepIdx]);

  const rewardTrend = useMemo(() => {
    if (mode !== 'playback') {
      return [] as { index: number; value: number; rawValue?: number; alpha?: number; epsilon?: number }[];
    }

    const trendPoints = expData?.trend_points ?? [];
    if (trendPoints.length > 0) {
      return trendPoints.map((point, idx) => ({
        index: typeof point.episode_num === 'number' ? point.episode_num : idx,
        value:
          typeof point.reward_rolling === 'number'
            ? point.reward_rolling
            : typeof point.reward === 'number'
              ? point.reward
              : 0,
        rawValue: typeof point.reward === 'number' ? point.reward : undefined,
        alpha:
          typeof point.alpha === 'number'
            ? point.alpha
            : typeof expData?.agent?.alpha === 'number'
              ? expData.agent.alpha
              : undefined,
        epsilon:
          typeof point.epsilon === 'number'
            ? point.epsilon
            : typeof expData?.agent?.epsilon === 'number'
              ? expData.agent.epsilon
              : undefined,
      }));
    }

    if (!expData?.episodes?.length) {
      return [] as { index: number; value: number; rawValue?: number; alpha?: number; epsilon?: number }[];
    }

    return expData.episodes.map((episode, idx) => ({
      index: typeof episode.episode_num === 'number' ? episode.episode_num : idx,
      value: typeof episode.total_reward === 'number' ? episode.total_reward : 0,
      rawValue: typeof episode.total_reward === 'number' ? episode.total_reward : undefined,
      alpha:
        typeof episode.alpha === 'number'
          ? episode.alpha
          : typeof expData.agent?.alpha === 'number'
            ? expData.agent.alpha
            : undefined,
      epsilon:
        typeof episode.epsilon === 'number'
          ? episode.epsilon
          : typeof expData.agent?.epsilon === 'number'
            ? expData.agent.epsilon
            : undefined,
    }));
  }, [mode, expData]);

  const jumpToEpisode = (value: number) => {
    if (!expData?.episodes?.length) return;
    const maxIndex = expData.episodes.length - 1;
    const target = Math.min(Math.max(0, value), maxIndex);
    setEpisodeIdx(target);
    setStepIdx(0);
    setPlaybackCompleted(false);
  };

  const stepCount = currentEpisode?.steps?.length ?? 0;
  const episodeCount = expData?.episodes?.length ?? 0;

  const dismissOnboarding = () => {
    setShowOnboarding(false);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('qlv-onboarding-dismissed', '1');
    }
  };

  const isBusy = loadingGraphs || loadingGraphDef || loadingExperiments || loadingExpData;

  return (
    <div className="app-shell" id="container">
      <aside className="app-sidebar">
        <div>
          <h1 className="app-title">Q-Learning Visualizer</h1>
          <p className="app-subtitle">Explore the environment live or replay trained policies.</p>
        </div>

        {showOnboarding && (
          <div className="app-onboarding" role="note" aria-label="Quick start">
            <div className="app-onboarding__header">
              <strong>Quick Start</strong>
              <button type="button" onClick={dismissOnboarding} aria-label="Dismiss quick start">
                <X size={14} />
              </button>
            </div>
            <ol>
              <li>Choose a graph.</li>
              <li>Use Play mode for manual exploration.</li>
              <li>Use Playback mode to inspect episodes and policy evolution.</li>
            </ol>
          </div>
        )}

        <section className="sidebar-card">
          <div className="sidebar-label">Mode</div>
          <ModePager mode={mode} onChange={(m) => { setMode(m); setPlaying(false); }} />

          <label className="sidebar-field">
            <span>Graph</span>
            <select
              value={graphType}
              disabled={loadingGraphs}
              onChange={(e) => setGraphType(e.target.value)}
            >
              {graphs.map((g) => (
                <option key={g.key} value={g.key}>
                  {g.key}
                </option>
              ))}
            </select>
          </label>

          {mode === 'playback' && (
            <>
              <label className="sidebar-field">
                <span>Experiment</span>
                <select
                  className="select-wide"
                  value={expId}
                  disabled={loadingExperiments || !expList?.items.length}
                  onChange={(e) => setExpId(e.target.value)}
                >
                  {expList?.items.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="sidebar-playback-transport" role="group" aria-label="Playback controls">
                <button
                  type="button"
                  onClick={() => {
                    setStepIdx(0);
                    setPlaying(false);
                    setEpisodeIdx(0);
                    setPlaybackCompleted(false);
                  }}
                  title="Restart"
                  disabled={loadingExpData || !episodeCount}
                >
                  <RefreshCcw className="playback-icon" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEpisodeIdx((i) => Math.max(0, i - 1));
                    setStepIdx(0);
                    setPlaybackCompleted(false);
                  }}
                  title="Previous episode"
                  disabled={loadingExpData || !episodeCount}
                >
                  <SkipBack className="playback-icon" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPlaybackCompleted(false);
                    setStepIdx((s) => Math.max(0, s - 1));
                  }}
                  title="Previous step"
                  disabled={loadingExpData || !episodeCount}
                >
                  <StepBack className="playback-icon" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!playing) setPlaybackCompleted(false);
                    setPlaying((p) => !p);
                  }}
                  title="Play/Pause"
                  disabled={loadingExpData || !episodeCount}
                >
                  {playing ? <Pause className="playback-icon" /> : <Play className="playback-icon" />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPlaybackCompleted(false);
                    setStepIdx((s) => Math.min(stepCount, s + 1));
                  }}
                  title="Next step"
                  disabled={loadingExpData || !episodeCount}
                >
                  <StepForward className="playback-icon" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (expData?.episodes) setEpisodeIdx((i) => Math.min(expData.episodes!.length - 1, i + 1));
                    setStepIdx(0);
                    setPlaybackCompleted(false);
                  }}
                  title="Next episode"
                  disabled={loadingExpData || !episodeCount}
                >
                  <SkipForward className="playback-icon" />
                </button>
              </div>

              <label className="sidebar-field">
                <span>Speed</span>
                <select value={speedIndex} onChange={(e) => setSpeedIndex(parseInt(e.target.value, 10))}>
                  {speedOptions.map((name, i) => (
                    <option key={name} value={i}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="sidebar-slider-block">
                <label htmlFor="episode-scrubber">Episode {episodeCount ? `${episodeIdx + 1}/${episodeCount}` : '0/0'}</label>
                <input
                  id="episode-scrubber"
                  type="range"
                  min={0}
                  max={Math.max(0, episodeCount - 1)}
                  value={Math.min(episodeIdx, Math.max(0, episodeCount - 1))}
                  disabled={!episodeCount}
                  onChange={(e) => jumpToEpisode(parseInt(e.target.value, 10))}
                />

                <label htmlFor="step-scrubber">Step {Math.min(stepIdx, stepCount)}/{stepCount}</label>
                <input
                  id="step-scrubber"
                  type="range"
                  min={0}
                  max={Math.max(0, stepCount)}
                  value={Math.min(stepIdx, stepCount)}
                  disabled={!episodeCount}
                  onChange={(e) => {
                    setPlaybackCompleted(false);
                    setStepIdx(parseInt(e.target.value, 10));
                  }}
                />
              </div>
            </>
          )}
        </section>

        {isBusy && (
          <div className="sidebar-status sidebar-status--loading" role="status">
            Loading data...
          </div>
        )}

        {mode === 'playback' && !loadingExperiments && !expList?.items.length && (
          <div className="sidebar-status" role="status">
            No experiments found for this graph.
          </div>
        )}

        {!!errorMessage && (
          <div className="sidebar-status sidebar-status--error" role="alert">
            {errorMessage}
          </div>
        )}
      </aside>

      <main className="app-main">
        <section className="viewer-stage">
          <div className="viewer-host" ref={viewerHostRef}>
            {graphDef ? (
              <>
                <div className={`viewer-pane viewer-pane--playback ${mode === 'playback' ? 'is-active' : ''}`}>
                  <PlaybackView
                    coords={graphDef.coords}
                    adjacency={graphDef.adjacency}
                    terminalRewards={graphDef.terminal_rewards}
                    currentState={currentState}
                    path={pathStates}
                    width={viewerSize.width}
                    height={viewerSize.height}
                    playbackStats={
                      mode === 'playback'
                        ? {
                            episodeIndex: episodeIdx,
                            episodeCount,
                            stepIndex: stepIdx,
                            stepCount,
                            totalReward: currentEpisode?.total_reward ?? null,
                          }
                        : undefined
                    }
                    policy={mode === 'playback' ? ((expData?.policy as Record<string, string | number> | undefined) ?? null) : null}
                    qValues={mode === 'playback' ? expData?.q_values ?? null : null}
                    episodes={mode === 'playback' ? expData?.episodes ?? null : null}
                    currentEpisodeIndex={mode === 'playback' ? episodeIdx : undefined}
                    currentStepIndex={mode === 'playback' ? stepIdx : undefined}
                    playbackCompleted={mode === 'playback' ? playbackCompleted : undefined}
                    hyperParams={
                      mode === 'playback'
                        ? {
                            alpha:
                              typeof expData?.episodes?.[episodeIdx]?.alpha === 'number'
                                ? expData?.episodes?.[episodeIdx]?.alpha
                                : typeof expData?.agent?.alpha === 'number'
                                  ? expData.agent.alpha
                                  : undefined,
                            epsilon:
                              typeof expData?.episodes?.[episodeIdx]?.epsilon === 'number'
                                ? expData?.episodes?.[episodeIdx]?.epsilon
                                : typeof expData?.agent?.epsilon === 'number'
                                  ? expData.agent.epsilon
                                  : undefined,
                            alphaDecayRate:
                              typeof expData?.agent?.alpha_decay_rate === 'number' ? expData.agent.alpha_decay_rate : undefined,
                            epsilonDecay:
                              typeof expData?.agent?.epsilon_decay === 'number' ? expData.agent.epsilon_decay : undefined,
                            gamma: typeof expData?.agent?.gamma === 'number' ? expData.agent.gamma : undefined,
                            stepCost:
                              typeof expData?.environment?.step_cost === 'number' ? expData.environment.step_cost : undefined,
                            stochasticity:
                              typeof expData?.environment?.stochasticity === 'number' ? expData.environment.stochasticity : undefined,
                          }
                        : null
                    }
                  />
                </div>
                <div className={`viewer-pane viewer-pane--play ${mode === 'play' ? 'is-active' : ''}`}>
                  <PlayAsAgentView
                    coords={graphDef.coords}
                    adjacency={graphDef.adjacency}
                    terminalRewards={graphDef.terminal_rewards}
                    width={viewerSize.width}
                    height={viewerSize.height}
                  />
                </div>
              </>
            ) : (
              <div className="viewer-empty">No graph selected.</div>
            )}
          </div>
        </section>

        {mode === 'playback' && rewardTrend.length > 0 && (
          <section id="reward-summary" className="reward-summary">
            <RewardTrendChart points={rewardTrend} width={viewerSize.width} />
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
