import type { Coord, Episode, ExperimentDataSummary } from '../../types';

export type PlaybackStats = {
  episodeIndex: number;
  episodeCount: number;
  stepIndex: number;
  stepCount: number;
  totalReward?: number | null;
};

export type PolicyValue = string | number;

export type QValuesMap = ExperimentDataSummary['q_values'];

export type GraphViewerProps = {
  coords: Record<string, Coord>;
  adjacency: Record<string, string[]>;
  terminalRewards: Record<string, number>;
  currentState?: string | null;
  path?: string[];
  width?: number;
  height?: number;
  playbackStats?: PlaybackStats;
  policy?: Record<string, PolicyValue> | null;
  qValues?: QValuesMap | null;
  hyperParams?: {
    alpha?: number | null;
    epsilon?: number | null;
    alphaDecayRate?: number | null;
    epsilonDecay?: number | null;
    gamma?: number | null;
    stepCost?: number | null;
    stochasticity?: number | null;
  } | null;
  episodes?: Episode[] | null;
  currentEpisodeIndex?: number;
  currentStepIndex?: number;
  playbackCompleted?: boolean;
  onEpisodeJump?: (episodeIndex: number) => void;
};

export type TooltipEntry = {
  target: string;
  label: string;
  color: string;
  direction: string;
};

export type TooltipData = {
  node: string;
  x: number;
  y: number;
  entries: TooltipEntry[];
};

export type PathSegment = {
  key: string;
  from: Coord;
  to: Coord;
};

export type PolicyArrow = {
  key: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
};

export type QValueLabel = {
  key: string;
  x: number;
  y: number;
  label: string;
  color: string;
};
