import { useState } from 'react';
import { Info } from 'lucide-react';

export function GraphInfoTip() {
  const [showInfoTip, setShowInfoTip] = useState(false);

  return (
    <div
      className="graph-info-trigger"
      onMouseEnter={() => setShowInfoTip(true)}
      onMouseLeave={() => setShowInfoTip(false)}
      onFocus={() => setShowInfoTip(true)}
      onBlur={() => setShowInfoTip(false)}
      tabIndex={0}
      role="button"
      aria-label="Graph viewer tips"
    >
      <div className={`graph-info-bubble ${showInfoTip ? 'is-visible' : ''}`}>
        <div className="graph-info-content">
          <div className="graph-info-title">Key</div>
          <div className="graph-info-entry">
            <svg width="12%" height="10%" viewBox="0 0 30 40" preserveAspectRatio="xMidYMid meet">
              <circle cx={15} cy={20} r={6} fill="#a8e6cf" />
            </svg>
            <p>Positive terminal state</p>
          </div>
          <div className="graph-info-entry">
            <svg width="12%" height="10%" viewBox="0 0 30 40" preserveAspectRatio="xMidYMid meet">
              <circle cx={15} cy={20} r={6} fill="#ffaaa7" />
            </svg>
            <p>Negative terminal state</p>
          </div>
        </div>
      </div>
      <div className="graph-info-trigger__icon">
        <Info />
      </div>
    </div>
  );
}
