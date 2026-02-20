import type { Coord } from '../../types';

export type AgentPlayViewProps = {
  coords: Record<string, Coord>;
  adjacency: Record<string, string[]>;
  terminalRewards: Record<string, number>;
  alpha?: number;
  gamma?: number;
  onQValueCalculated?: (data: { from: string; to: string; qValue: number }) => void;
  width?: number;
  height?: number;
};

export type QCalculation = {
  prev: number;
  reward: number;
  bestNext: number;
  updated: number;
  alpha: number;
  gamma: number;
};

export type AgentTooltipEntry = {
  to: string;
  value: number;
  direction: string;
  prev: number;
  reward: number;
  bestNext: number;
  updated: number;
  alpha: number;
  gamma: number;
};

export type AgentTooltipData = {
  node: string;
  x: number;
  y: number;
  entries: AgentTooltipEntry[];
};

export type QLabel = {
  key: string;
  x: number;
  y: number;
  label: string;
  color: string;
};
