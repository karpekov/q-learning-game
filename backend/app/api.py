import os
import json
from typing import List, Optional, Dict, Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from graph_definitions import AVAILABLE_GRAPHS, get_graph


app = FastAPI(title="Q-Learning Demo API", version="0.1.0")

# CORS for local dev
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "localhost:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ------------------------- Models -------------------------

class GraphInfo(BaseModel):
    key: str
    states: int
    terminals: List[str]


class ExperimentSummary(BaseModel):
    id: str  # relative id within graph folder (e.g. "s_0/exp_001")
    name: str
    graph_type: str
    path: str
    params: Dict[str, Any]
    stochasticity_level: Optional[int] = None


class ExperimentListResponse(BaseModel):
    graph_type: str
    count: int
    items: List[ExperimentSummary]


# ------------------------- Helpers -------------------------

def _resolve_experiments_root() -> str:
    # Allow override via env var; otherwise search common paths
    candidates = [
        os.environ.get("EXPERIMENTS_DIR"),
        os.path.join(os.getcwd(), "q_learning_experiments"),
        os.path.join(os.path.dirname(os.getcwd()), "q_learning_experiments"),
        os.path.join(os.path.dirname(__file__), "..", "..", "q_learning_experiments"),
    ]
    for c in candidates:
        if not c:
            continue
        path = os.path.abspath(c)
        if os.path.isdir(path):
            return path
    # Fallback to cwd/q_learning_experiments even if missing (API will just return empty lists)
    return os.path.abspath(os.path.join(os.getcwd(), "q_learning_experiments"))


def _find_experiment_files(graph_dir: str) -> List[Dict[str, Any]]:
    """Scan a graph directory for experiments and return metadata.

    Supports two layouts:
    - Nested by stochasticity: graph_dir/s_0/exp_1/exploration_data.json
    - Flat: graph_dir/exp_1/exploration_data.json or graph_dir/exp_1/data.json
    """
    items: List[Dict[str, Any]] = []
    if not os.path.isdir(graph_dir):
        return items

    def load_params_from_json(path: str) -> Optional[Dict[str, Any]]:
        try:
            with open(path, "r") as f:
                data = json.load(f)
            agent = data.get("agent", {})
            env = data.get("environment", {})
            # Normalize expected params
            params = {
                "epsilon": agent.get("epsilon"),
                "alpha": agent.get("alpha"),
                "gamma": agent.get("gamma"),
                "step_cost": env.get("step_cost"),
                "stochasticity": env.get("stochasticity"),
                "epsilon_decay": agent.get("epsilon_decay"),
                "epsilon_min": agent.get("epsilon_min"),
                "alpha_decay_rate": agent.get("alpha_decay_rate"),
                "initial_alpha": agent.get("initial_alpha", agent.get("alpha")),
                "optimistic_init": agent.get("optimistic_init", 0.0),
            }
            return {"params": params, "data": data}
        except Exception:
            return None

    # Check for s_* nested folders
    for entry in sorted(os.listdir(graph_dir)):
        sdir = os.path.join(graph_dir, entry)
        if os.path.isdir(sdir) and entry.startswith("s_"):
            try:
                stoch_level = int(entry.split("_")[1])
            except Exception:
                stoch_level = None
            for exp_entry in sorted(os.listdir(sdir)):
                exp_dir = os.path.join(sdir, exp_entry)
                if not os.path.isdir(exp_dir):
                    continue
                # Common filenames used in this repo
                for fname in ("exploration_data.json", "data.json", "q_learning_data.json"):
                    fpath = os.path.join(exp_dir, fname)
                    if os.path.isfile(fpath):
                        loaded = load_params_from_json(fpath)
                        if loaded:
                            items.append({
                                "id": f"{entry}/{exp_entry}",
                                "name": exp_entry,
                                "path": fpath,
                                "params": loaded["params"],
                                "stochasticity_level": stoch_level,
                            })
                        break

    # Also support flat experiments under the graph dir
    for exp_entry in sorted(os.listdir(graph_dir)):
        exp_dir = os.path.join(graph_dir, exp_entry)
        if os.path.isdir(exp_dir) and not exp_entry.startswith("s_"):
            for fname in ("exploration_data.json", "data.json", "q_learning_data.json"):
                fpath = os.path.join(exp_dir, fname)
                if os.path.isfile(fpath):
                    loaded = load_params_from_json(fpath)
                    if loaded:
                        items.append({
                            "id": exp_entry,
                            "name": exp_entry,
                            "path": fpath,
                            "params": loaded["params"],
                            "stochasticity_level": loaded["params"].get("stochasticity"),
                        })
                    break

    return items


def _load_experiment_json(base: str, graph_type: str, exp_id: str) -> Dict[str, Any]:
    graph_dir = os.path.join(base, graph_type)
    # exp_id can be nested like "s_0/exp_1"
    exp_dir = os.path.join(graph_dir, exp_id)
    if not os.path.isdir(exp_dir):
        raise HTTPException(status_code=404, detail="Experiment not found")
    for fname in ("exploration_data.json", "data.json", "q_learning_data.json"):
        fpath = os.path.join(exp_dir, fname)
        if os.path.isfile(fpath):
            with open(fpath, "r") as f:
                return json.load(f)
    raise HTTPException(status_code=404, detail="Experiment data file not found")


# ------------------------- Routes -------------------------

@app.get("/", tags=["meta"])
def root() -> dict:
    return {"name": app.title, "version": app.version}


@app.get("/health", tags=["meta"])
def health() -> dict:
    return {"status": "ok"}


@app.get("/graphs", response_model=List[GraphInfo], tags=["graphs"])
def list_graphs():
    result: List[GraphInfo] = []
    for key in AVAILABLE_GRAPHS:
        adj, terminals, _coords = get_graph(key)
        result.append(GraphInfo(key=key, states=len(adj), terminals=list(terminals.keys())))
    return result


@app.get("/graphs/{graph_type}", tags=["graphs"])
def get_graph_def(graph_type: str):
    try:
        adj, terminals, coords = get_graph(graph_type)
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"graph_type": graph_type, "adjacency": adj, "terminal_rewards": terminals, "coords": coords}


@app.get("/experiments", tags=["experiments"])
def list_experiment_groups() -> Dict[str, Any]:
    base = _resolve_experiments_root()
    groups = {}
    for g in AVAILABLE_GRAPHS:
        gdir = os.path.join(base, g)
        items = _find_experiment_files(gdir)
        groups[g] = {"count": len(items)}
    return {"root": base, "graphs": groups}


@app.get("/experiments/{graph_type}", response_model=ExperimentListResponse, tags=["experiments"])
def list_experiments(graph_type: str):
    if graph_type not in AVAILABLE_GRAPHS:
        raise HTTPException(status_code=404, detail=f"Unknown graph_type: {graph_type}")
    base = _resolve_experiments_root()
    gdir = os.path.join(base, graph_type)
    items_raw = _find_experiment_files(gdir)
    items = [
        ExperimentSummary(
            id=it["id"],
            name=it["name"],
            graph_type=graph_type,
            path=it["path"],
            params=it["params"],
            stochasticity_level=it.get("stochasticity_level"),
        )
        for it in items_raw
    ]
    return ExperimentListResponse(graph_type=graph_type, count=len(items), items=items)


@app.get("/experiments/{graph_type}/{exp_id:path}", tags=["experiments"])
def get_experiment(
    graph_type: str,
    exp_id: str,
    include: Optional[List[str]] = Query(None, description="Sections to include: environment,agent,policy,q_values,episodes,total_reward_history,episode_length_history,epsilon_history,alpha_history,intermediate_rewards"),
    every: int = Query(1, ge=1, description="Return every Nth episode in episodes array if included"),
):
    if graph_type not in AVAILABLE_GRAPHS:
        raise HTTPException(status_code=404, detail=f"Unknown graph_type: {graph_type}")
    base = _resolve_experiments_root()
    data = _load_experiment_json(base, graph_type, exp_id)

    # If include is specified, filter the payload
    if include:
        allowed = set(include)
        filtered: Dict[str, Any] = {}
        for key in allowed:
            if key == "episodes" and "episodes" in data:
                if every > 1:
                    filtered["episodes"] = data["episodes"][::every]
                else:
                    filtered["episodes"] = data["episodes"]
            elif key in data:
                filtered[key] = data[key]
            elif key in ("environment", "agent") and key in data:
                filtered[key] = data[key]
        # Always attach minimal meta
        filtered["meta"] = {
            "graph_type": graph_type,
            "exp_id": exp_id,
        }
        return filtered

    # Default: return summary without heavy arrays
    summary_keys = [
        "environment",
        "agent",
        "policy",
        "q_values",
    ]
    result = {k: data.get(k) for k in summary_keys if k in data}
    result["meta"] = {"graph_type": graph_type, "exp_id": exp_id}
    return result


@app.get("/experiments/{graph_type}/{exp_id:path}/greedy-path", tags=["experiments"])
def get_greedy_path(graph_type: str, exp_id: str, start: str = "S", max_steps: int = 500):
    if graph_type not in AVAILABLE_GRAPHS:
        raise HTTPException(status_code=404, detail=f"Unknown graph_type: {graph_type}")
    base = _resolve_experiments_root()
    data = _load_experiment_json(base, graph_type, exp_id)

    adj = data.get("environment", {}).get("adjacency")
    policy = data.get("policy")
    terminals = set((data.get("environment", {}).get("terminal_rewards") or {}).keys())
    if adj is None or policy is None:
        raise HTTPException(status_code=400, detail="Experiment missing adjacency or policy")

    path = [start]
    current = start
    steps = 0
    while steps < max_steps and current not in terminals:
        act = policy.get(current)
        if not act or act == "-":
            break
        nxt = act if act in adj.get(current, []) else act
        # If the policy value is an index string (older formats), map to neighbor
        if nxt not in adj.get(current, []):
            try:
                idx = int(act)
                neighbors = adj.get(current, [])
                if 0 <= idx < len(neighbors):
                    nxt = neighbors[idx]
                else:
                    break
            except Exception:
                break
        path.append(nxt)
        current = nxt
        steps += 1

    return {"start": start, "path": path, "terminated": current in terminals, "steps": steps}
