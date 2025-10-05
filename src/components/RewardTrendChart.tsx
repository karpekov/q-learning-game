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

type Point = {
  index: number;
  value: number;
};

type Props = {
  points: Point[];
  width: number;
  height?: number;
};

const RewardTrendChart: React.FC<Props> = ({ points, width }) => {
  if (!points.length || width <= 0) return null;

  const data = points.map((p) => ({
    episode: p.index + 1,
    reward: p.value,
  }));

  const min = Math.min(...data.map((d) => d.reward));
  const max = Math.max(...data.map((d) => d.reward));
  const span = Math.max(Math.abs(min), Math.abs(max)) || 1;
  const domainMin = min === max ? min - 1 : min;
  const domainMax = min === max ? max + 1 : max;

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
    <div style={{ width, maxWidth: '100%', height: '50vh' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <strong style={{ fontFamily: 'var(--font-space-grotesk)', fontWeight: 700, fontSize: '1.6em' }}>Reward Trend</strong>
        <span style={{ fontSize: 12, color: '#6c757d' }}>
          Episodes: {data.length} · Range: {min.toFixed(2)} - {max.toFixed(2)}
        </span>
      </div>
      <div style={{ width: '100%', height: '100%' }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 12, right: 16, left: 0, bottom: 12 }}>
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
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              fontSize={12}
              domain={[domainMin, domainMax]}
            />
            <Tooltip
              contentStyle={{ borderRadius: 8, background: 'rgba(234,238,224,0.7)', boxShadow: '0 4px 12px rgba(0,0,0,0.12)', backdropFilter: 'blur(8px)', border: 'none' }}
              labelStyle={{ fontWeight: 600, marginBottom: 4 }}
              formatter={(value: number) => [`${value.toFixed(2)}`, 'Reward']}
              labelFormatter={(label) => `Episode ${label}`}
            />
            <Area type="monotone" dataKey="reward" stroke="none" fill="url(#rewardArea)" />
            <Line
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
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default RewardTrendChart;
