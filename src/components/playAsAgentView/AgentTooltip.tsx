import { QValuesTooltip, type FormulaEntry } from '../modules/QValuesTooltip';
import type { AgentTooltipData } from './types';

type AgentTooltipProps = {
  tooltip: AgentTooltipData;
};

export function AgentTooltip({ tooltip }: AgentTooltipProps) {
  const entries: FormulaEntry[] = tooltip.entries.map((entry) => ({
    id: `${tooltip.node}->${entry.to}`,
    target: entry.to,
    direction: entry.direction,
    prev: entry.prev,
    reward: entry.reward,
    bestNext: entry.bestNext,
    updated: entry.updated,
    alpha: entry.alpha,
    gamma: entry.gamma,
    stateLabel: tooltip.node,
  }));

  return (
    <QValuesTooltip
      title={`We moved from ${tooltip.node} to...`}
      position={{ x: tooltip.x, y: tooltip.y }}
      mode="formula"
      className="agent-q-tooltip"
      formulaEntries={entries}
    />
  );
}
