import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api';
import type { GraphDef, GraphInfo, ExperimentListResponse, Episode, ExperimentDataSummary } from './types';
import {Play, Pause, ChevronFirst, ChevronLast, RefreshCcw, SkipBack, SkipForward, ChevronLeft, ChevronRight} from 'lucide-react'
import GraphViewer from './components/GraphViewer';
import AgentPlayView from './components/AgentPlayView';
import ModePager from './components/ModePager';

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

  // Pager helpers for edge arrows
  const pages = ['play', 'playback'] as const;
  const pageIndex = mode === 'play' ? 0 : 1;
  const goPage = (i: number) => {
    const clamped = Math.max(0, Math.min(pages.length - 1, i));
    setMode(pages[clamped]);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 16, minWidth: '100vw', minHeight: '100vh', boxSizing: 'border-box', maxWidth:'100vw' }}>
      <h2 style={{ margin: 0, fontFamily: 'var(--font-space-grotesk)', fontWeight: 700, fontSize: '2.0em' }}>Q-Learning Visualizer</h2>

      {/* Controls: graph + experiment selection */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
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
          <>
            <label>
              Experiment:&nbsp;
              <select value={expId} onChange={(e) => setExpId(e.target.value)} style={{ minWidth: 150 }}>
                {expList?.items.map((it) => (
                  <option key={it.id} value={it.id}>{it.name}</option>
                ))}
              </select>
            </label>

            <button onClick={() => { setStepIdx(0); setPlaying(false); }} title='Restart'><RefreshCcw /></button>
            <button onClick={() => { setEpisodeIdx((i) => Math.max(0, i - 1)); setStepIdx(0); }} title='Previous episode'><SkipBack /></button>
            <button onClick={() => setStepIdx((s) => Math.max(0, s - 1))} title='Previous step'><ChevronFirst /></button>
            <button onClick={() => setPlaying((p) => !p)} title='Play/Pause'>{playing ? <Pause /> : <Play />}</button>
            <button onClick={() => setStepIdx((s) => s + 1)} title="Next step"><ChevronLast /></button>
            <button onClick={() => { if (expData?.episodes) setEpisodeIdx((i) => Math.min(expData.episodes!.length - 1, i + 1)); setStepIdx(0); }} title='Next episode'><SkipForward /></button>


            <label>
              Speed:&nbsp;
              <select value={speedIndex} onChange={(e) => setSpeedIndex(parseInt(e.target.value, 10))}>
                {speedOptions.map((name, i) => (
                  <option key={name} value={i}>{name}</option>
                ))}
              </select>
            </label>
          </>
        )}
      </div>

      {/* Viewers with smooth transition */}
      {graphDef && (
        <div style={{ position: 'relative', width: '100%', height: viewerHeight, overflow: 'hidden' }}>
          {/* Edge pagination buttons */}
          <button
            aria-label="Previous mode"
            onClick={() => goPage(pageIndex - 1)}
            disabled={pageIndex <= 0}
            style={{
              position: 'absolute', left: 8, top: '50%', transform: 'translateY(-100%)', zIndex: 5,
              width: 44, height: 44,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: 'transparent',
              color: pageIndex > 0 ? 'black' : 'gray',
              backdropFilter: 'blur(2px)', 
              cursor: pageIndex > 0 ? 'pointer' : 'not-allowed'
            }}
          >
            <ChevronLeft />
          </button>
          <button
            aria-label="Next mode"
            onClick={() => { goPage(pageIndex + 1); setPlaying(false); }}
            disabled={pageIndex >= pages.length - 1}
            style={{
              position: 'absolute', right: 8, top: '50%', transform: 'translateY(-100%)', zIndex: 5,
              width: 44, height: 44,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: 'transparent',
              color: pageIndex < pages.length - 1 ? 'black' : 'gray',
              backdropFilter: 'blur(2px)', cursor: pageIndex < pages.length - 1 ? 'pointer' : 'not-allowed'
            }}
          >
            <ChevronRight />
          </button>
          <div
            style={{
              position: 'absolute', inset: 0,
              opacity: mode === 'playback' ? 1 : 0,
              transform: `translateX(${mode === 'playback' ? '0%' : '100%'})`,
              transition: 'opacity 250ms ease, transform 250ms ease',
              pointerEvents: mode === 'playback' ? 'auto' : 'none',
            }}
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
            />
          </div>
          <div
            style={{
              position: 'absolute', inset: 0,
              opacity: mode === 'play' ? 1 : 0,
              transform: `translateX(${mode === 'play' ? '0%' : '-100%'})`,
              transition: 'opacity 250ms ease, transform 250ms ease',
              pointerEvents: mode === 'play' ? 'auto' : 'none',
            }}
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
    </div>
  );
}

export default App;
