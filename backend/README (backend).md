# Q‑Learning Demo Backend (FastAPI)

This backend exposes a simple REST API to demo Q‑learning with pre‑trained runs. It reuses the existing Python modules for graph definitions and the experiment data format, and serves JSON for a web frontend that animates the agent’s episodes.

The API does not train on request. Instead, it lists and returns experiment data produced by `QLearningAgent.save_visualization_data(...)` from `q_learning.py`.

## How It Works

- Uses `graph_definitions.py` as the source of truth for graphs:
  - `AVAILABLE_GRAPHS` is surfaced via `/graphs`.
  - `get_graph(graph_type)` provides adjacency, terminal rewards, and node coordinates via `/graphs/{graph_type}`.
- Reuses `q_learning.py` output format:
  - The API loads JSON files created by `QLearningAgent.get_visualization_data()` (saved as `exploration_data.json` or `q_learning_data.json`).
  - `interactive_visualizer.py` remains a desktop pygame demo and is not imported by the server.

## API Endpoints

- GET `/health`
  - Basic health check.

- GET `/graphs`
  - Lists graphs from `graph_definitions.AVAILABLE_GRAPHS` with state counts and terminal states.

- GET `/graphs/{graph_type}`
  - Returns `{ graph_type, adjacency, terminal_rewards, coords }` for rendering the layout.

- GET `/experiments`
  - Returns the experiments root used and a count of experiments per graph type.

- GET `/experiments/{graph_type}`
  - Lists discovered experiments for a graph type. Each item includes `id`, `name`, `path`, derived `params` (epsilon/alpha/gamma/step_cost/stochasticity/decays), and optional `stochasticity_level` when present.

- GET `/experiments/{graph_type}/{exp_id}`
  - Returns experiment data.
  - Query params:
    - `include=` allows selecting sections like `environment`, `agent`, `policy`, `q_values`, `episodes`, `total_reward_history`, `episode_length_history`, `epsilon_history`, `alpha_history`, `intermediate_rewards`.
    - `every=N` returns every Nth episode when `episodes` are included (sampling large payloads).
  - Default: `environment`, `agent`, `policy`, `q_values` (no episodes).

- GET `/experiments/{graph_type}/{exp_id}/greedy-path?start=S&max_steps=500`
  - Computes a simple greedy path by following the learned policy from `start` to a terminal or until `max_steps`.

## Experiments Directory Layout

The backend scans a root experiments directory (auto‑detected or set via `EXPERIMENTS_DIR`). It supports two layouts:

1) Nested by stochasticity level:
```
q_learning_experiments/
  <graph_type>/
    s_0/
      exp_001/
        exploration_data.json
    s_1/
      exp_002/
        exploration_data.json
```

2) Flat per experiment:
```
q_learning_experiments/
  <graph_type>/
    exp_001/
      exploration_data.json
```

Accepted filenames: `exploration_data.json`, `q_learning_data.json`, or `data.json`.

### Experiments Root Resolution Order

1. `EXPERIMENTS_DIR` environment variable (absolute path recommended)
2. `<repo>/q_learning_experiments`
3. `<repo parent>/q_learning_experiments`

## Data Model (from q_learning.py)

Each experiment JSON should follow the schema produced by `QLearningAgent.get_visualization_data()`:

- `environment`:
  - `adjacency: { state: string[] }`
  - `terminal_rewards: { state: number }`
  - `step_cost: number`
  - `stochasticity: 0 | 1 | 2`
- `agent`:
  - `epsilon`, `alpha`, `gamma`, `initial_epsilon`, `epsilon_decay`, `epsilon_min`, `initial_alpha`, `alpha_decay_rate`, `optimistic_init`
- `q_values: { state: { actionIndexOrKey: number } }`
- `policy: { state: nextStateOrIndex }` (neighbor state or index string)
- `episodes: [ { steps: [{ state, action, intended?, next_state, reward }], total_reward, step_count } ]`
- Histories: `total_reward_history`, `episode_length_history`, `epsilon_history`, `alpha_history`, `intermediate_rewards`

## Run The Backend

Prereqs: Python 3.9+ and packages from `environment.yml` (or pip equivalents).

1) Install deps (conda recommended):
```
conda env create -f environment.yml
conda activate cs3600-q-learning
```

Or via pip:
```
pip install fastapi uvicorn numpy matplotlib networkx pygame tqdm
```

2) Start API (serves on `http://localhost:8000`):
```
python backend/main.py
```

3) Verify:
```
curl http://localhost:8000/health
curl http://localhost:8000/graphs
```

If your experiments live elsewhere, set:
```
# PowerShell
$env:EXPERIMENTS_DIR = "C:\\path\\to\\q_learning_experiments"
python backend/main.py
```

## Connect To The Frontend

The frontend (Vite + React) consumes these endpoints to render graphs and animate episodes.

- Configure API URL (optional): in repo root `.env`:
```
VITE_API_URL=http://localhost:8000
```

- Run the dev server:
```
npm install
npm run dev
```

- Open `http://localhost:5173` and:
  - Choose a graph (from `/graphs`).
  - Pick an experiment (`/experiments/{graph_type}`).
  - The app fetches `/graphs/{graph_type}` and `/experiments/{graph_type}/{exp_id}` with `include` params and plays episodes on an SVG graph.

## Keeping The Desktop Visualizer

`interactive_visualizer.py` remains a pygame desktop UI for local demos (not used by the server):
```
python interactive_visualizer.py --experiments --graph-type complex_maze
python interactive_visualizer.py --human-play --graph-type complex_maze
```

## Files

- `app/api.py` — FastAPI endpoints for graphs and experiments.
- `main.py` — Uvicorn entrypoint (`uvicorn.run("app.api:app", ...)`).
- `graph_definitions.py` — Graph structures and coordinates.
- `q_learning.py` — Environment and data format used by the API (training offline).
- `interactive_visualizer.py` — Desktop GUI for local visualization (not served).

## License

MIT — see [LICENSE](LICENSE).

