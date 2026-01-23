import { Info } from 'lucide-react';
import { ReactNode, useState } from 'react';
import './Checkbox.css';

type TooltipProps = {
    label: string;
    tip?: ReactNode;
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
};

export function Checkbox({ label, tip, checked, onCheckedChange }: TooltipProps) {
    const [showInfoTip, setShowInfoTip] = useState<boolean>(false);

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
            {tip && (<div
                className="agent-info-trigger"
                onMouseEnter={() => setShowInfoTip(true)}
                onMouseLeave={() => setShowInfoTip(false)}
            >
                <Info size={14} />
                <div className={`agent-info-tip ${showInfoTip ? 'is-visible' : ''}`}>
                {tip}
                </div>
            </div>)}
        </div>
    );
}
