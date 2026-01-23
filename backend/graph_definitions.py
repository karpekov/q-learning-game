"""
Grid-Based Graph Definitions for MDP Room Exploration
====================================================

This module provides a concise way to define grid-based mazes with various cell types:
- Start state (S)
- Terminal states with rewards (positive/negative)
- Non-terminal states with rewards
- Obstacles/walls (X)
- Portals (a, b, c, etc.)
"""

import os
import matplotlib.pyplot as plt
import numpy as np
from typing import Dict, List, Tuple, Optional, Any
from dataclasses import dataclass
from enum import Enum

class CellType(Enum):
    EMPTY = "."
    START = "S"
    TERMINAL_POS = "G"  # Goal
    TERMINAL_NEG = "T"  # Trap
    REWARD_POS = "+"    # Positive reward cell
    REWARD_NEG = "-"    # Negative reward cell
    OBSTACLE = "X"      # Wall
    PORTAL = "P"        # Portal (a, b, c, etc.)

@dataclass
class Portal:
    """Portal definition with activation requirements"""
    id: str  # e.g., "a", "b", "c"
    location: Tuple[int, int]
    destination: Tuple[int, int]
    wall_bangs_required: int = 1  # Number of wall hits needed to activate
    wall_bang_direction: str = "right"  # Direction to bang: "up", "down", "left", "right"
    bidirectional: bool = True

@dataclass
class GridMaze:
    """Concise grid maze definition"""
    name: str
    grid: List[str]  # Each string is a row, characters define cell types
    rewards: Dict[str, float]  # Cell type -> reward value
    portals: List[Portal] = None
    start_pos: Optional[Tuple[int, int]] = None  # Override start position

# Available graph types
AVAILABLE_GRAPHS = ["simple_grid", "complex_maze", "portal_demo", "custom_rooms"]

# ======================== Grid Definitions ========================

def create_simple_grid_maze() -> GridMaze:
    """Simple 4x3 grid with goal and trap"""
    return GridMaze(
        name="simple_grid",
        grid=[
            "S..G",
            "....",
            "X.TX"
        ],
        rewards={
            "G": 10.0,   # Goal
            "T": -10.0,  # Trap
        }
    )

def create_portal_demo_maze() -> GridMaze:
    """Demo maze with portals"""
    return GridMaze(
        name="portal_demo",
        grid=[
            "S....X.....",
            "..X..X..+..",
            "..X..X.....",
            "a...X.....b",
            "..X..X.....",
            "..X..X..-..",
            "..........G"
        ],
        rewards={
            "G": 100.0,
            "+": 10.0,
            "-": -10.0,

        },
        portals=[
            Portal("a", (3, 0), (3, 10), wall_bangs_required=2, wall_bang_direction="left"),
            Portal("b", (3, 10), (3, 0), wall_bangs_required=2, wall_bang_direction="right")
        ]
    )

def create_complex_maze_grid() -> GridMaze:
    """Complex maze using grid notation"""
    return GridMaze(
        name="complex_maze",
        grid=[
            ".....................",
            ".XXXXXXXXXXXXX..XXXXX",
            ".X...................",
            ".XXXX.XXXXXXXXXXXXXXX",
            ".X.......X...........",
            ".XXXX.X........TXXX..",
            ".X.....T.XXXXXXXX....",
            ".X.....T.X.....XX...T",
            ".X...T...X...T.XXX.XX",
            ".X...XXXXX.TTT.XT....",
            ".X.X.....T.X...X.....",
            ".X.X...T...X.XTXXXXX.",
            ".X.XX.X...TX...XT....",
            ".X....X..T.XT..X.....",
            ".XXXX.XXXXXX..T.G.XXX",
            ".X.S......X..........",
            ".XXXXXXXXXXXXXXXXXXX.",
            ".....................",
        ],
        rewards={
            # Positive terminals
            "G": 1000.0,
            # Negative rewards scattered throughout
            "T": -100.0,
            "-": -10.0,
        },
        # start_pos=(15, 3)  # Custom start position
    )

# ======================== Conversion Functions ========================

def grid_to_graph(maze: GridMaze) -> Tuple[Dict[str, List[str]], Dict[str, float], Dict[str, Tuple[int, int]], Dict[str, Any]]:
    """Convert grid maze to adjacency list format"""

    rows = len(maze.grid)
    cols = len(maze.grid[0]) if rows > 0 else 0

    # Find all valid positions and their types
    positions = {}  # (row, col) -> cell_type
    start_pos = maze.start_pos

    # Parse grid - now all tokens are single characters
    for r, row in enumerate(maze.grid):
        for c, cell in enumerate(row):
            if cell != CellType.OBSTACLE.value:
                positions[(r, c)] = cell
                if cell == CellType.START.value and not start_pos:
                    start_pos = (r, c)

    # Build adjacency list
    adj = {}
    terminal_rewards = {}  # Only for truly terminal states (G, T)
    intermediate_rewards = {}  # For collectible rewards (+, -)
    room_coords = {}

    # Portal state tracking
    portal_states = {}  # portal_id -> {location, destination, bangs_required}
    if maze.portals:
        for portal in maze.portals:
            portal_states[portal.id] = {
                'location': portal.location,
                'destination': portal.destination,
                'bangs_required': portal.wall_bangs_required,
                'bidirectional': portal.bidirectional
            }

    directions = [(-1, 0), (1, 0), (0, -1), (0, 1)]  # up, down, left, right

    for (r, c), cell_type in positions.items():
        # Generate state key
        if (r, c) == start_pos:
            state_key = "S"
        elif cell_type.islower() and cell_type.isalpha():
            state_key = cell_type  # Portal: a, b, c, etc.
        elif cell_type == CellType.TERMINAL_POS.value:
            state_key = "GOAL"
        else:
            state_key = f"({r},{c})"

        # Find neighbors
        neighbors = []
        for dr, dc in directions:
            nr, nc = r + dr, c + dc
            if (nr, nc) in positions:
                neighbor_pos = (nr, nc)
                neighbor_cell = positions[neighbor_pos]

                # Generate neighbor key
                if neighbor_pos == start_pos:
                    neighbor_key = "S"
                elif neighbor_cell.islower() and neighbor_cell.isalpha():
                    neighbor_key = neighbor_cell  # Portal: a, b, c, etc.
                elif neighbor_cell == CellType.TERMINAL_POS.value:
                    neighbor_key = "GOAL"
                else:
                    neighbor_key = f"({nr},{nc})"

                neighbors.append(neighbor_key)


        adj[state_key] = neighbors

        # Set coordinates for visualization (flip y for matplotlib)
        room_coords[state_key] = (c, rows - 1 - r)

        # Add rewards - distinguish between terminal and intermediate
        if cell_type in maze.rewards:
            reward_value = maze.rewards[cell_type]
            # Terminal rewards: G (goal) and T (trap) end the game
            if cell_type in [CellType.TERMINAL_POS.value, CellType.TERMINAL_NEG.value]:
                terminal_rewards[state_key] = reward_value
            # Intermediate rewards: + and - are collectible and don't end the game
            elif cell_type in [CellType.REWARD_POS.value, CellType.REWARD_NEG.value]:
                intermediate_rewards[state_key] = reward_value
            else:
                # For other cell types with rewards, treat as terminal by default
                terminal_rewards[state_key] = reward_value
        elif cell_type == CellType.TERMINAL_POS.value and "G" not in maze.rewards:
            terminal_rewards[state_key] = 100.0  # Default goal reward
        elif cell_type == CellType.TERMINAL_NEG.value and "T" not in maze.rewards:
            terminal_rewards[state_key] = -100.0  # Default trap reward

    # Build portal info dictionary
    portal_info = {}
    if maze.portals:
        for portal in maze.portals:
            portal_info[portal.id] = {
                'destination': portal.destination,
                'wall_bangs_required': portal.wall_bangs_required,
                'wall_bang_direction': portal.wall_bang_direction,
                'location': portal.location,
                'bidirectional': portal.bidirectional
            }

    return adj, terminal_rewards, room_coords, portal_info, intermediate_rewards

# ======================== Legacy Support ========================

def create_room_graph():
    """Legacy room graph for backward compatibility"""
    adj = {
        "S": ["A"],
        "A": ["S", "L", "F", "K"],
        "L": ["A", "G"],
        "G": ["L", "W"],
        "W": ["G", "R"],
        "R": ["W", "J"],
        "F": ["A", "T", "J"],
        "K": ["A", "T", "D"],
        "T": ["F", "K", "H", "D", "Z"],
        "D": ["K", "T", "Z"],
        "Z": ["D", "T", "H"],
        "H": ["T", "Z", "J"],
        "J": ["F", "R", "H"],
    }
    terminal_rewards = {"J": 10.0, "T": -10.0}
    room_coords = {
        "S": (0, 4), "A": (2, 4), "L": (2, 6), "G": (4, 6), "W": (6, 6), "R": (8, 6),
        "F": (5, 4), "K": (2, 2), "T": (5, 2), "D": (4, 0), "Z": (6, 0), "H": (8, 2), "J": (8, 4)
    }
    return adj, terminal_rewards, room_coords, {}, {}  # adj, terminal_rewards, room_coords, portal_info, intermediate_rewards

def create_simple_grid():
    """Legacy simple grid"""
    return grid_to_graph(create_simple_grid_maze())

def create_complex_maze():
    """Legacy complex maze"""
    return grid_to_graph(create_complex_maze_grid())

# ======================== Main Interface ========================

def get_graph(graph_type="simple_grid"):
    """Get a graph definition by type"""
    if graph_type == "custom_rooms":
        return create_room_graph()
    elif graph_type == "simple_grid":
        return grid_to_graph(create_simple_grid_maze())
    elif graph_type == "complex_maze":
        return grid_to_graph(create_complex_maze_grid())
    elif graph_type == "portal_demo":
        return grid_to_graph(create_portal_demo_maze())
    else:
        raise ValueError(f"Unknown graph type: {graph_type}. Available types: {AVAILABLE_GRAPHS}")

def create_custom_maze(grid_lines: List[str], rewards: Dict[str, float],
                      portals: List[Portal] = None, name: str = "custom") -> GridMaze:
    """Create a custom maze from grid definition"""
    return GridMaze(
        name=name,
        grid=grid_lines,
        rewards=rewards,
        portals=portals or []
    )

# ======================== Visualization ========================

def viz_graph(graph_type="simple_grid"):
    """Enhanced graph visualization with portal support"""

    graphs_dir = "graphs"
    os.makedirs(graphs_dir, exist_ok=True)

    adj, rewards, coords, portal_info, intermediate_rewards = get_graph(graph_type)

    plt.figure(figsize=(15, 10))

    # Draw connections
    for state, neighbors in adj.items():
        x1, y1 = coords[state]
        for neighbor in neighbors:
            if neighbor.startswith("PORTAL_TO_"):
                # Portal connection - draw dashed line
                dest_state = neighbor.replace("PORTAL_TO_", "")
                if dest_state in coords:
                    x2, y2 = coords[dest_state]
                    plt.plot([x1, x2], [y1, y2], 'purple', linestyle='--',
                            alpha=0.7, linewidth=2, label='Portal' if 'Portal' not in plt.gca().get_legend_handles_labels()[1] else "")
            else:
                if neighbor in coords:
                    x2, y2 = coords[neighbor]
                    plt.plot([x1, x2], [y1, y2], 'b-', alpha=0.5, linewidth=1)

    # Draw nodes
    for state, (x, y) in coords.items():
        if state == "S":
            plt.scatter(x, y, c='orange', s=300, marker='s', label='Start')
        elif state == "GOAL":
            plt.scatter(x, y, c='green', s=300, marker='*', label='Goal')
        elif state.startswith("P"):
            plt.scatter(x, y, c='purple', s=300, marker='D', label='Portal' if 'Portal' not in plt.gca().get_legend_handles_labels()[1] else "")
        elif state in rewards:
            color = 'red' if rewards[state] < 0 else 'gold'
            plt.scatter(x, y, c=color, s=200,
                       label='Trap' if rewards[state] < 0 and 'Trap' not in plt.gca().get_legend_handles_labels()[1] else
                             'Reward' if rewards[state] > 0 and 'Reward' not in plt.gca().get_legend_handles_labels()[1] else "")
        else:
            plt.scatter(x, y, c='lightblue', s=150)

        # Add labels
        plt.text(x, y+0.2, state, ha='center', fontsize=9, fontweight='bold')
        if state in rewards:
            plt.text(x, y-0.25, f'{rewards[state]:+g}', ha='center', fontsize=8, color='black')

    plt.title(f'{graph_type.replace("_", " ").title()} Graph Structure')
    plt.axis('equal')
    plt.grid(True, alpha=0.3)
    plt.legend()
    plt.tight_layout()

    output_path = os.path.join(graphs_dir, f'{graph_type}_viz.png')
    plt.savefig(output_path, dpi=150, bbox_inches='tight')
    print(f"Graph saved as {output_path}")

def list_available_graphs():
    """List all available graph types with descriptions"""
    descriptions = {
        "custom_rooms": "Original room layout with goal (+10) and pit (-10)",
        "simple_grid": "Simple 4x3 grid with goal and trap",
        "complex_maze": "Complex maze with goal (+1000) and multiple traps",
        "portal_demo": "Demo maze with bidirectional portals"
    }

    print("Available graph types:")
    for graph_type in AVAILABLE_GRAPHS:
        print(f"  - {graph_type}: {descriptions[graph_type]}")

    return AVAILABLE_GRAPHS

# ======================== Usage Examples ========================

if __name__ == "__main__":
    # Example 1: Simple custom maze
    simple_custom = create_custom_maze(
        grid_lines=[
            "S.X",
            "..X",
            "X.G"
        ],
        rewards={"G": 50.0}
    )

    # Example 2: Maze with portals
    portal_maze = create_custom_maze(
        grid_lines=[
            "S...P1",
            "..X...",
            "..X...",
            "P2...G"
        ],
        rewards={"G": 100.0},
        portals=[
            Portal("P1", (0, 4), (3, 0), wall_bangs_required=1),
            Portal("P2", (3, 0), (0, 4), wall_bangs_required=1)
        ]
    )

    # Demo all available graphs
    list_available_graphs()
    for graph_type in AVAILABLE_GRAPHS:
        print(f"\nTesting {graph_type}:")
        adj, rewards, coords, portal_info, intermediate_rewards = get_graph(graph_type)
        print(f"  States: {len(adj)}")
        print(f"  Terminal states: {list(rewards.keys())}")
        viz_graph(graph_type)
