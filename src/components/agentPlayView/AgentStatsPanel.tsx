type AgentStatsPanelProps = {
  pathLength: number;
  stepCost: number;
  ended: boolean;
  current: string;
  terminalRewards: Record<string, number>;
  episodes: number[];
  latestReward: number | null;
  bestReward: number | null;
};

export function AgentStatsPanel({
  pathLength,
  stepCost,
  ended,
  current,
  terminalRewards,
  episodes,
  latestReward,
  bestReward,
}: AgentStatsPanelProps) {
  const moves = Math.max(0, pathLength - 1);
  const term = ended && current in terminalRewards ? terminalRewards[current] : 0;
  const currentScore = -moves * stepCost + (ended ? term : 0);

  return (
    <div className="agent-stats">
      <div><strong>Moves:</strong> {moves}</div>
      <div><strong>Current Score:</strong> {currentScore > 0 ? `+${currentScore}` : `${currentScore}`}</div>
      <div><strong>Episodes:</strong> {episodes.length}</div>
      <div><strong>Latest:</strong> {latestReward !== null ? (latestReward > 0 ? `+${latestReward.toFixed(2)}` : `${latestReward.toFixed(2)}`) : '-'}</div>
      <div><strong>Best:</strong> {bestReward !== null ? (bestReward > 0 ? `+${bestReward.toFixed(2)}` : `${bestReward.toFixed(2)}`) : '-'}</div>
      <div className="agent-stats__hint">
        Hint: Click neighboring nodes or use the arrow keys to move.
      </div>
      {ended && (
        <div className="agent-stats__completed">
          Round finished. Terminal: <span className={terminalRewards[current] > 0 ? 'agent-stats__positive' : 'agent-stats__negative'}>{terminalRewards[current] > 0 ? `+${terminalRewards[current]}` : terminalRewards[current]}</span>. Total with step cost applied: <span className={episodes[episodes.length - 1] > 0 ? 'agent-stats__positive' : 'agent-stats__negative'}>{episodes[episodes.length - 1] > 0 ? `+${episodes[episodes.length - 1]}` : episodes[episodes.length - 1]}</span>
        </div>
      )}
    </div>
  );
}
