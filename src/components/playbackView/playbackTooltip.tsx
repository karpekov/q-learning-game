import { QValuesTooltip, type ValueEntry } from '../modules/QValuesTooltip';
import type { TooltipData } from './types';

type PlaybackTooltipProps = {
  tooltip: TooltipData;
};

export function PlaybackTooltip({ tooltip }: PlaybackTooltipProps) {
  const entries: ValueEntry[] = tooltip.entries.map((entry) => ({
    id: `${tooltip.node}-${entry.target}`,
    target: entry.target,
    direction: entry.direction,
    label: entry.label,
    color: entry.color,
  }));

  return (
    <QValuesTooltip
      title={tooltip.node}
      position={{ x: tooltip.x, y: tooltip.y }}
      mode="value"
      valueEntries={entries}
    />
  );
}
