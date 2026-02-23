import type { CSSProperties } from 'react';
import { qValueColor } from '../playbackView/utils';

type ValueEntry = {
  id: string;
  target: string;
  direction?: string;
  label: string;
  color: string;
};

type FormulaEntry = {
  id: string;
  target: string;
  direction?: string;
  prev: number;
  reward: number;
  bestNext: number;
  updated: number;
  alpha: number;
  gamma: number;
  stateLabel: string;
};

type TooltipPosition = {
  x: number;
  y: number;
};

type QValuesTooltipProps = {
  title: string;
  position: TooltipPosition;
  mode: 'value' | 'formula';
  valueEntries?: ValueEntry[];
  formulaEntries?: FormulaEntry[];
  className?: string;
};

export function QValuesTooltip({
  title,
  position,
  mode,
  valueEntries = [],
  formulaEntries = [],
  className,
}: QValuesTooltipProps) {
  const maxWidth = 400;
  const maxHeight = 260;
  const clampedX = typeof window !== 'undefined' ? Math.max(8, Math.min(position.x, window.innerWidth - maxWidth - 16)) : position.x;
  const clampedY = typeof window !== 'undefined' ? Math.max(8, Math.min(position.y, window.innerHeight - maxHeight - 16)) : position.y;
  const style: CSSProperties = { left: clampedX, top: clampedY };

  return (
    <div className={`graph-tooltip ${className ?? ''}`.trim()} style={style}>
      <div className="graph-tooltip-title">{title}</div>

      {mode === 'value' ? (
        <div className="graph-tooltip-list">
          {valueEntries.map((entry) => (
            <div key={entry.id} className="graph-tooltip-entry">
              <span className="graph-tooltip-target">
                {entry.direction && <span className="graph-tooltip-direction">{entry.direction}</span>}
                {entry.target}
              </span>
              <span className="graph-tooltip-value" style={{ color: entry.color }}>{entry.label}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="agent-q-tooltip-list">
          {formulaEntries.map((entry) => (
            <div key={entry.id} className="agent-q-tooltip-entry">
              <div className="agent-q-tooltip-edge">
                {entry.direction && <span className="agent-q-tooltip-direction">{entry.direction}</span>}
                {entry.target}:
              </div>
              <div className="agent-q-tooltip-formula">Q(s,a) ← Q(s,a) + α (r + γ·maxQ - Q(s,a))</div>
              <div className="agent-q-tooltip-values">
                Q(s,a) ← {entry.prev.toFixed(3)} + {entry.alpha.toFixed(3)} * ({entry.reward.toFixed(3)} + {entry.gamma.toFixed(3)} *{' '}<span style={{ color: qValueColor(entry.bestNext) }}>{entry.bestNext.toFixed(3)}</span>{' '} - {entry.prev.toFixed(3)})
              </div>
              <div className="agent-q-tooltip-values">
                Q({entry.stateLabel},{entry.stateLabel} → {entry.target}) ={' '}
                <span className="agent-q-tooltip-result" style={{ color: qValueColor(entry.updated) }}>
                  {entry.updated.toFixed(3)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export type { FormulaEntry, TooltipPosition, ValueEntry };
