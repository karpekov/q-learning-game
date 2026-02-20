import type { Dispatch, SetStateAction } from 'react';
import { Checkbox } from '../modules/Checkbox';

type AgentControlsPanelProps = {
  ended: boolean;
  reset: () => void;
  current: string;
  visitedCount: number;
  stepCost: number;
  setStepCost: Dispatch<SetStateAction<number>>;
  stochasticity: number;
  setStochasticity: Dispatch<SetStateAction<number>>;
  easyMode: boolean;
  setEasyMode: Dispatch<SetStateAction<boolean>>;
  hardMode: boolean;
  setHardMode: Dispatch<SetStateAction<boolean>>;
  showQValues: boolean;
  setShowQValues: Dispatch<SetStateAction<boolean>>;
  onZoomOut: () => void;
  onResetTransform: () => void;
  onZoomIn: () => void;
};

export function AgentControlsPanel({
  ended,
  reset,
  current,
  visitedCount,
  stepCost,
  setStepCost,
  stochasticity,
  setStochasticity,
  easyMode,
  setEasyMode,
  hardMode,
  setHardMode,
  showQValues,
  setShowQValues,
  onZoomOut,
  onResetTransform,
  onZoomIn,
}: AgentControlsPanelProps) {
  return (
    <div className="agent-controls-panel">
      <div className="agent-controls-section">
        <div className="agent-controls-section__title">Session</div>
        <div className="agent-controls-row">
          {ended ? (
            <button onClick={reset} className="agent-control-btn agent-control-btn--success">
              Try Again
            </button>
          ) : (
            <button onClick={reset} className="agent-control-btn agent-control-btn--danger">
              Reset
            </button>
          )}
        </div>
        <div className="agent-controls-row">
          <div>
            <strong>Current:</strong> {current}
          </div>
          <div>
            <strong>Visited:</strong> {visitedCount}
          </div>
        </div>
      </div>

      <div className="agent-controls-section">
        <div className="agent-controls-section__title">Learning</div>
        <div className="agent-controls-column">
          <label className="agent-range-label">
            <span>Step cost</span>
            <input
              type="range"
              min={0}
              max={5}
              step={0.1}
              value={stepCost}
              onChange={(e) => setStepCost(parseFloat(e.target.value))}
            />
            <span className="agent-range-value">{stepCost.toFixed(1)}</span>
          </label>

          <label className="agent-range-label">
            <span>Stochasticity</span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={Math.round(stochasticity * 100)}
              onChange={(e) => setStochasticity(Math.max(0, Math.min(1, parseInt(e.target.value, 10) / 100)))}
            />
            <span className="agent-range-value">{Math.round(stochasticity * 100)}%</span>
          </label>
        </div>
      </div>

      <div className="agent-controls-section">
        <div className="agent-controls-section__title">Display</div>
        <div>
          <Checkbox
            label="Easy Mode"
            tip="Spoilers: reveals the full graph."
            checked={easyMode}
            onCheckedChange={setEasyMode}
          />
          <Checkbox
            label="Hard Mode"
            tip="Shows only local neighborhood."
            checked={hardMode}
            onCheckedChange={setHardMode}
          />
          <Checkbox label="Show Q-Values" checked={showQValues} onCheckedChange={setShowQValues} />
        </div>
      </div>

      <div className="agent-controls-section">
        <div className="agent-controls-section__title">View</div>
        <div className="agent-zoom-controls">
          <button onClick={onZoomOut} className="agent-control-btn" title="Zoom out">
            -
          </button>
          <button onClick={onResetTransform} className="agent-control-btn" title="Reset view">
            Reset View
          </button>
          <button onClick={onZoomIn} className="agent-control-btn" title="Zoom in">
            +
          </button>
        </div>
      </div>
    </div>
  );
}
