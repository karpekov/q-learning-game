export type Coord = [number, number];

export interface GraphInfo {
  key: string;
  states: number;
  terminals: string[];
}

export interface GraphDef {
  graph_type: string;
  adjacency: Record<string, string[]>;
  terminal_rewards: Record<string, number>;
  coords: Record<string, Coord>;
}

export interface ExperimentSummary {
  id: string;
  name: string;
  graph_type: string;
  path: string;
  params: Record<string, any>;
  stochasticity_level?: number;
}

export interface ExperimentListResponse {
  graph_type: string;
  count: number;
  items: ExperimentSummary[];
}

export interface EpisodeStep {
  step: number;
  state: string;
  action: number | string;
  intended?: string;
  next_state: string;
  reward: number;
  q_value?: number;
}

export interface Episode {
  episode_num?: number;
  steps: EpisodeStep[];
  total_reward: number;
  step_count: number;
  epsilon?: number;
  alpha?: number;
}

export interface ExperimentDataSummary {
  environment: {
    adjacency: Record<string, string[]>;
    terminal_rewards: Record<string, number>;
    step_cost?: number;
    stochasticity?: number;
  };
  agent: Record<string, any>;
  policy: Record<string, string> | Record<string, number>;
  q_values: Record<string, Record<string, number>> | Record<string, Record<number, number>>;
  episodes?: Episode[];
  meta?: { graph_type: string; exp_id: string };
}

