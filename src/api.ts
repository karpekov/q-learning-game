import type { GraphInfo, GraphDef, ExperimentListResponse, ExperimentDataSummary } from './types';

const BASE_URL = (import.meta.env?.VITE_API_URL as string) || 'http://localhost:8000';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json();
}

export const api = {
  health: () => get<{ status: string }>(`/health`),
  graphs: () => get<GraphInfo[]>(`/graphs`),
  graphDef: (graphType: string) => get<GraphDef>(`/graphs/${encodeURIComponent(graphType)}`),
  experiments: (graphType: string) => get<ExperimentListResponse>(`/experiments/${encodeURIComponent(graphType)}`),
  experimentData: (graphType: string, expId: string, withEpisodes = true, every = 1) => {
    const params = new URLSearchParams();
    const include = ['environment', 'agent', 'policy', 'q_values'];
    if (withEpisodes) include.push('episodes');
    include.forEach((v) => params.append('include', v));
    if (withEpisodes && every > 1) params.set('every', String(every));
    return get<ExperimentDataSummary>(`/experiments/${encodeURIComponent(graphType)}/${encodeURIComponent(expId)}?${params.toString()}`);
  },
  greedyPath: (graphType: string, expId: string, start = 'S') =>
    get<{ start: string; path: string[]; terminated: boolean; steps: number }>(
      `/experiments/${encodeURIComponent(graphType)}/${encodeURIComponent(expId)}/greedy-path?start=${encodeURIComponent(start)}`
    ),
};

