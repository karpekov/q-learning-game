import React from 'react';
import {
  Area,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ValueType, NameType, Payload } from 'recharts/types/component/DefaultTooltipContent';
import './RewardTrendChart.css';

type Point = {
  index: number;
  value: number;
  alpha?: number;
  epsilon?: number;
};

type Props = {
  points: Point[];
  width: number;
  height?: number;
};

type RewardTooltipPayload = Payload<ValueType, NameType>;
type RewardTooltipProps = {
  active?: boolean;
  payload?: RewardTooltipPayload[];
  label?: NameType;
};

const RewardTooltip: React.FC<RewardTooltipProps> = ({ active, payload, label }) => {
  if (!active || !payload || payload.length === 0) {
    return null;
  }
  const typedPayload = payload as Payload<ValueType, NameType>[];
  const rewardEntry = typedPayload.find((entry) => entry && entry.dataKey === 'reward') ?? typedPayload[typedPayload.length - 1];
  const rawValue = rewardEntry && typeof rewardEntry.value === 'number'
    ? rewardEntry.value
    : Number(rewardEntry?.value);
  const formatted = Number.isFinite(rawValue) ? rawValue.toFixed(2) : '-';

  const alphaEntry = typedPayload.find((entry) => entry && entry.dataKey === 'alpha');
  const epsilonEntry = typedPayload.find((entry) => entry && entry.dataKey === 'epsilon');
  const formattedAlpha = typeof alphaEntry?.value === 'number' ? alphaEntry.value.toFixed(4) : undefined;
  const formattedEpsilon = typeof epsilonEntry?.value === 'number' ? epsilonEntry.value.toFixed(4) : undefined;

  return (
    <div className="reward-tooltip">
      <div className="reward-tooltip__title">Episode {label ?? '-'}</div>
      <div className="reward-tooltip__value">Reward : {formatted}</div>
      {formattedEpsilon && <div className="reward-tooltip__value">ε : {formattedEpsilon}</div>}
      {formattedAlpha && <div className="reward-tooltip__value">α : {formattedAlpha}</div>}
    </div>
  );
};

const RewardTrendChart: React.FC<Props> = ({ points, width }) => {
  if (!points.length || width <= 0) return null;

  const data = points.map((p) => ({
    episode: p.index + 1,
    reward: p.value,
    alpha: p.alpha,
    epsilon: p.epsilon,
  }));

  const min = Math.min(...data.map((d) => d.reward));
  const max = Math.max(...data.map((d) => d.reward));
  const span = Math.max(Math.abs(min), Math.abs(max)) || 1;
  const domainMin = min === max ? min - 1 : min;
  const domainMax = min === max ? max + 1 : max;
  const hasAlpha = data.some((d) => typeof d.alpha === 'number');
  const hasEpsilon = data.some((d) => typeof d.epsilon === 'number');
  const legendItems = [
    { key: 'reward', label: 'Reward', color: '#20c997' },
    hasAlpha ? { key: 'alpha', label: 'Alpha', color: '#f08c00' } : null,
    hasEpsilon ? { key: 'epsilon', label: 'Epsilon', color: '#0d6efd' } : null,
  ].filter((x): x is { key: string; label: string; color: string } => Boolean(x));

  const colorForReward = (value: number) => {
    if (!Number.isFinite(value)) {
      return { hue: 210, saturation: 10, lightness: 55, css: 'hsl(210 10% 55%)' };
    }
    const norm = Math.max(-1, Math.min(1, value / span));
    const hue = norm >= 0 ? 140 : 5;
    const intensity = Math.abs(norm);
    const saturation = 55 + intensity * 35;
    const lightness = 60 - intensity * 25;
    return { hue, saturation, lightness, css: `hsl(${hue} ${saturation}% ${lightness}%)` };
  };

  const gradientStops = data.map((d, idx) => ({
    offset: data.length === 1 ? 0 : idx / (data.length - 1),
    color: colorForReward(d.reward).css,
  }));

  const areaTop = colorForReward(domainMax);

  return (
    <div className="reward-chart" style={{ width }}>
      <div className="reward-chart__header">
        <strong className="reward-chart__title">Reward Trend</strong>
        <span className="reward-chart__meta">
          Episodes: {data.length} · Reward Range: {min.toFixed(2)} - {max.toFixed(2)}
          {legendItems.length > 0 && (
            <div className="reward-chart__legend">
              {legendItems.map((item) => (
                <span key={item.key} className="reward-chart__legend-item">
                  <span className="reward-chart__legend-swatch" style={{ backgroundColor: item.color }} />
                  {item.label}
                </span>
              ))}
            </div>
          )}
        </span>
      </div>
      <div className="reward-chart__body">
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 12, right: 20, left: 20, bottom: 12 }}>
            <defs>
              <linearGradient id="rewardArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={`hsla(${areaTop.hue} ${areaTop.saturation}% ${areaTop.lightness}%, 0.28)`} />
                <stop offset="95%" stopColor={`hsla(${areaTop.hue} ${areaTop.saturation}% ${areaTop.lightness}%, 0)`} />
              </linearGradient>
              <linearGradient id="rewardLineGradient" x1="0" y1="0" x2="1" y2="0">
                {gradientStops.map((stop, idx) => (
                  <stop key={idx} offset={`${(stop.offset * 100).toFixed(2)}%`} stopColor={stop.color} />
                ))}
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(33,37,41,0.08)" vertical={false} />
            <XAxis
              dataKey="episode"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              fontSize={12}
            />
            <YAxis
              yAxisId="reward"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              fontSize={12}
              domain={[domainMin, domainMax]}
              label={{ value: 'Reward', angle: -90, position: 'left', offset: 12, fill: '#6c757d', fontSize: 11 }}
            />
            {(hasAlpha || hasEpsilon) && (
              <YAxis
                yAxisId="hyper"
                orientation="right"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                fontSize={12}
                domain={[0, 1]}
                ticks={[0, 0.25, 0.5, 0.75, 1]}
                tickFormatter={(v) => v.toFixed(2)}
                stroke="#adb5bd"
                label={{ value: 'α / ε (0-1)', angle: 90, position: 'right', offset: 12, fill: '#6c757d', fontSize: 11 }}
              />
            )}
            <Tooltip content={<RewardTooltip />} />
            <Area yAxisId="reward" type="monotone" dataKey="reward" stroke="none" fill="url(#rewardArea)" />
            <Line
              yAxisId="reward"
              type="monotone"
              dataKey="reward"
              stroke="url(#rewardLineGradient)"
              strokeWidth={2}
              dot={({ cx, cy, payload }) => {
                const color = colorForReward(payload.reward).css;
                return <circle cx={cx} cy={cy} r={2.8} fill={color} stroke="#ffffff" strokeWidth={1.2} />;
              }}
              activeDot={({ cx, cy, payload }) => {
                const color = colorForReward(payload.reward).css;
                return <circle cx={cx} cy={cy} r={4.5} fill={color} stroke="#ffffff" strokeWidth={1.5} />;
              }}
            />
            {hasAlpha && (
              <Line
                yAxisId="hyper"
                type="monotone"
                dataKey="alpha"
                stroke="#f08c00"
                strokeWidth={1.6}
                dot={false}
                activeDot={{ r: 3, strokeWidth: 1, stroke: '#fff' }}
              />
            )}
            {hasEpsilon && (
              <Line
                yAxisId="hyper"
                type="monotone"
                dataKey="epsilon"
                stroke="#0d6efd"
                strokeWidth={1.6}
                dot={false}
                activeDot={{ r: 3, strokeWidth: 1, stroke: '#fff' }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="reward-chart__description">
        <p>Q-learning is an agent learning by trial and error. It starts with a blank Q-table (its memory of how good actions are), takes an action, observes the reward and the next state, and then adjusts its belief about that action. It achieves this by evaluating the utility of each action. In our simulations, the agent can perform any 4 actions (up, down, left, right) at any state. Whenever it performs an action, it evaluates the action by calculating its <i>Q-value</i>. The Q-learning agent calculates a state-action pair's q-value using the Bellman formula <code>Q(s, a) ← Q(s, a) + α · [r + γ · max Q(s’, a’) – Q(s, a)]</code>. The Q-value for a state-action pair is always calculated/updated immediately after the agent has taken said action and observed the resulting reward. </p>
        <p>
          <ol>
            <li><code>Alpha (α)</code> is the learning rate: a high α learns fast from every experience but may overreact to noise. A low α is calmer and steadier, essentially telling the agent to trust its prior knowledge more and new information less, leading to more gradual learning.</li>
            <li><code>Gamma (γ)</code> is the discount factor: values near 1 say “future rewards matter almost as much as now,” while smaller γ makes the agent short-sighted and focused on quick wins.</li>
            <li><code>Epsilon (ε)</code> controls exploration in an ε-greedy policy: with probability <i>p = ε</i>, pick a random action to discover new options or with <i>p = 1-ε</i>, choose the best action you currently know. Epsilon decay slowly turns an <i>explorer</i> into an <i>exploiter</i> as training progresses. Alpha decay similarly tapers how aggressively you update once your estimates are more mature.</li>
            <li><code>Step cost</code> is a small negative reward per move. It pushes the agent to finish in fewer steps instead of wandering.</li>
            <li><code>Stochasticity</code> describes how often the environment perturbs your chosen action (a slip or misfire), so the agent must find strategies that still work under randomness. Notice how the agent becomes more averse to 'riskier' routes when there is higher stochasticity even if it takes longer or is less direct?</li>
          </ol>
        </p>
        <p>Think of a delivery driver learning a city. The state is where you are; an action is which street to take next. The reward mixes tips with fuel and time costs; reaching the customer is a big positive terminal reward, while a traffic jam or dead end is a negative terminal. Alpha is how aggressively you revise your mental map after each trip. Gamma is how much you care about the rest of your shift versus this block. Epsilon is how often you try a new shortcut instead of the usual route. Step cost is the clock ticking while you drive. Stochasticity is the unexpected detour or light that forces a different turn. Over many deliveries, your “Q-table” becomes a map of which turns or actions tend to pay off, and as epsilon decays you increasingly follow those best-known routes.</p>
      </div>
    </div>
  );
};

export default RewardTrendChart;
