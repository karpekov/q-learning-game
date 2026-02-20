import { Info } from 'lucide-react';
import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import './Checkbox.css';

type TooltipProps = {
  label: string;
  tip?: ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
};

export function Checkbox({ label, tip, checked, onCheckedChange }: TooltipProps) {
  const [showInfoTip, setShowInfoTip] = useState<boolean>(false);
  const tipId = useId();

  return (
    <div className="agent-checkbox-row">
      <label>
        {label}
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onCheckedChange(e.target.checked)}
          className="agent-checkbox-input"
        />
      </label>
      {tip && (
        <button
          type="button"
          className="agent-info-trigger"
          onMouseEnter={() => setShowInfoTip(true)}
          onMouseLeave={() => setShowInfoTip(false)}
          onFocus={() => setShowInfoTip(true)}
          onBlur={() => setShowInfoTip(false)}
          aria-describedby={tipId}
          aria-label={`Info about ${label}`}
        >
          <Info size={14} />
          <div id={tipId} className={`agent-info-tip ${showInfoTip ? 'is-visible' : ''}`}>
            {tip}
          </div>
        </button>
      )}
    </div>
  );
}
