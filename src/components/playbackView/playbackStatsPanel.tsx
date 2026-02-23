import React, { useMemo, useState } from 'react';
import { Info } from 'lucide-react';
import { Checkbox } from '../modules/Checkbox';
import type { PlaybackViewProps } from './types';
import { formatParam } from './utils';

type GraphStatsPanelProps = {
  playbackStats: NonNullable<PlaybackViewProps['playbackStats']>;
  hyperParams: PlaybackViewProps['hyperParams'];
  showPolicy: boolean;
  showQValues: boolean;
  setShowPolicy: React.Dispatch<React.SetStateAction<boolean>>;
  setShowQValues: React.Dispatch<React.SetStateAction<boolean>>;
  onZoomOut: () => void;
  onResetTransform: () => void;
  onZoomIn: () => void;
  onEpisodeJump?: (episodeIndex: number) => void;
};

export function GraphStatsPanel({
  playbackStats,
  hyperParams,
  showPolicy,
  showQValues,
  setShowPolicy,
  setShowQValues,
  onZoomOut,
  onResetTransform,
  onZoomIn,
  onEpisodeJump,
}: GraphStatsPanelProps) {
  const [showAlphaTip, setShowAlphaTip] = useState(false);
  const [showEpsilonTip, setShowEpsilonTip] = useState(false);

  const alphaTip = useMemo(
    () =>
      hyperParams
        ? hyperParams.alphaDecayRate != null
          ? `Alpha decay rate per episode: ${hyperParams.alphaDecayRate}`
          : 'Alpha decay: none'
        : undefined,
    [hyperParams]
  );

  const epsilonTip = useMemo(
    () =>
      hyperParams
        ? hyperParams.epsilonDecay != null
          ? `Epsilon decay factor per episode: ${hyperParams.epsilonDecay}`
          : 'Epsilon decay: none'
        : undefined,
    [hyperParams]
  );

  return (
    <div className="graph-stats-panel">
      <div className="graph-stats-section">
        <div className="graph-stats-section__title">Training</div>
        <div className="graph-stats-summary">
          <div className="graph-inline-info">
            <p>
              <strong>Alpha:</strong> {formatParam(hyperParams?.alpha, 6)}
            </p>
            <span
              className="graph-inline-info__icon"
              onMouseEnter={() => setShowAlphaTip(true)}
              onMouseLeave={() => setShowAlphaTip(false)}
              onFocus={() => setShowAlphaTip(true)}
              onBlur={() => setShowAlphaTip(false)}
              tabIndex={0}
              aria-label="Alpha decay info"
            >
              <Info size={14} />
              <div className={`graph-info-bubble graph-info-bubble--inline ${showAlphaTip ? 'is-visible' : ''}`}>
                <div className="graph-info-content">
                  <div className="graph-info-title">Alpha decay</div>
                  <p>{alphaTip || 'Alpha decay: none'}</p>
                </div>
              </div>
            </span>
          </div>
          <div className="graph-inline-info">
            <p>
              <strong>Epsilon:</strong> {formatParam(hyperParams?.epsilon, 6)}
            </p>
            <span
              className="graph-inline-info__icon"
              onMouseEnter={() => setShowEpsilonTip(true)}
              onMouseLeave={() => setShowEpsilonTip(false)}
              onFocus={() => setShowEpsilonTip(true)}
              onBlur={() => setShowEpsilonTip(false)}
              tabIndex={0}
              aria-label="Epsilon decay info"
            >
              <Info size={14} />
              <div className={`graph-info-bubble graph-info-bubble--inline ${showEpsilonTip ? 'is-visible' : ''}`}>
                <div className="graph-info-content">
                  <div className="graph-info-title">Epsilon decay</div>
                  <p>{epsilonTip || 'Epsilon decay: none'}</p>
                </div>
              </div>
            </span>
          </div>
          <p>
            <strong>Gamma:</strong> {hyperParams?.gamma != null ? hyperParams.gamma.toFixed(3) : '-'}
          </p>
          <p>
            <strong>Step cost:</strong> {hyperParams?.stepCost != null ? hyperParams.stepCost.toFixed(3) : '-'}
          </p>
          <p>
            <strong>Stochasticity:</strong> {hyperParams?.stochasticity != null ? `${(hyperParams.stochasticity * 100).toFixed(1)}%` : '-'}
          </p>
        </div>
      </div>

      <div className="graph-stats-section">
        <div className="graph-stats-section__title">Playback</div>
        <div className="graph-stats-row">
          <p>
            <strong>Episode:</strong> {playbackStats.episodeIndex + 1}/{playbackStats.episodeCount}
          </p>
          <p>
            <strong>Step:</strong> {Math.min(playbackStats.stepIndex, playbackStats.stepCount)}/{playbackStats.stepCount}
          </p>
          <p>
            <strong>Reward:</strong> {playbackStats.totalReward != null ? playbackStats.totalReward.toFixed(2) : '-'}
          </p>
        </div>

        {onEpisodeJump && (
          <div className="graph-episode-input">
            <span>Jump to episode</span>
            <input
              type="number"
              min={1}
              max={Math.max(1, playbackStats.episodeCount)}
              value={Math.min(playbackStats.episodeCount, playbackStats.episodeIndex + 1)}
              onChange={(e) => onEpisodeJump(Math.max(0, parseInt(e.target.value || '1', 10) - 1))}
            />
            <span className="graph-episode-total">of {playbackStats.episodeCount || 0}</span>
          </div>
        )}
      </div>

      <div className="graph-stats-section">
        <div className="graph-stats-section__title">Display</div>
        <div className="graph-stats-checks">
          <Checkbox label="Show Final Policy" checked={showPolicy} onCheckedChange={setShowPolicy} />
          <Checkbox label="Show Q-values" checked={showQValues} onCheckedChange={setShowQValues} />
        </div>
      </div>

      <div className="graph-stats-section">
        <div className="graph-stats-section__title">View</div>
        <div className="graph-zoom-controls">
          <button onClick={onZoomOut} className="graph-zoom-button" title="Zoom out">
            -
          </button>
          <button onClick={onResetTransform} className="graph-zoom-button" title="Reset view">
            Reset View
          </button>
          <button onClick={onZoomIn} className="graph-zoom-button" title="Zoom in">
            +
          </button>
        </div>
      </div>
    </div>
  );
}
