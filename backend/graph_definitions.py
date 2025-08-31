"""
Graph Definitions for MDP Room Exploration
==========================================

This module contains graph definitions for different room layouts that can be used
in the MDP visualization system. Each graph defines the room adjacency structure,
terminal rewards, and room coordinates for visualization.
"""

import os
import matplotlib.pyplot as plt

# Available graph types
AVAILABLE_GRAPHS = ["custom_rooms", "simple_grid", "complex_maze"]

def create_room_graph():
    """Create the default adjacency structure for the room graph"""
    adj = {
        "S": ["A"],
        "A": ["S", "L", "F", "K"],
        "L": ["A", "G"],
        "G": ["L", "W"],
        "W": ["G", "R"],
        "R": ["W", "J"],
        "F": ["A", "T", "J"],
        "K": ["A", "T", "D"],
        "T": ["F", "K", "H", "D", "Z"],  # pit   –10
        "D": ["K", "T", "Z"],
        "Z": ["D", "T", "H"],
        "H": ["T", "Z", "J"],
        "J": ["F", "R", "H"],            # goal  +10
    }
    terminal_rewards = {"J": 10.0, "T": -10.0}

    # Room coordinates for visualization
    room_coords = {
        "S": (0, 4),
        "A": (2, 4),
        "L": (2, 6),
        "G": (4, 6),
        "W": (6, 6),
        "R": (8, 6),
        "F": (5, 4),
        "K": (2, 2),
        "T": (5, 2),
        "D": (4, 0),
        "Z": (6, 0),
        "H": (8, 2),
        "J": (8, 4)
    }

    return adj, terminal_rewards, room_coords

def create_simple_grid():
    """Classic RL 4X3 grid layout"""
    adj = {
        "S": ["N5", "N8"],
        "N1": ["N5", "N2"],
        "N2": ["N1", "N3"],
        "N3": ["N2", "N4", "N6"],
        "N4": ["N3", "N7"],
        "N5": ["S", "N1"],
        "N6": ["N3", "N9", "N7"],
        "N7": ["N4", "N6", "N10"],
        "N8": ["S", "N9"],
        "N9": ["N6", "N8", "N10"],
        "N10": ["N7", "N9"],

    }
    terminal_rewards = {"N4": 10.0, "N7": -10.0}

    room_coords = {
        "S": (0, 0),
        "N1": (0, 6),
        "N2": (3, 6),
        "N3": (6, 6),
        "N4": (9, 6),
        "N5": (0, 3),
        "N6": (6, 3),
        "N7": (9, 3),
        "N8": (3, 0),
        "N9": (6, 0),
        "N10": (9, 0)
    }

    return adj, terminal_rewards, room_coords

def create_complex_maze():
    """Create a complex grid-based maze matching the 20x23 layout"""

    # Definition from https://github.com/karpekov/cs3600-mdp-gridworld
    rows = 20
    cols = 23

    obstacles = set()

    # Top border walls
    for c in range(cols):
        obstacles.add((0, c))

    # Bottom border walls
    for c in range(cols):
        obstacles.add((rows-1, c))

    # Left border walls
    for r in range(rows):
        obstacles.add((r, 0))

    # Right border walls
    for r in range(rows):
        obstacles.add((r, cols-1))

    # Row #2
    for c in range(cols):
        obstacles.add((2, c))
    obstacles.remove((2, 1))
    obstacles.remove((2, 16))

    # Row #4
    for c in range(cols):
        obstacles.add((4, c))
    obstacles.remove((4, 1))
    obstacles.remove((4, 6))

    # Column #2
    for r in range(rows):
        obstacles.add((r, 2))
    obstacles.remove((1, 2))
    obstacles.remove((18, 2))

    # Row #17
    for c in range(cols):
        obstacles.add((17, c))
    obstacles.remove((17, 1))
    obstacles.remove((17, 21))

    # Row #5
    obstacles.add((5, 10))

    # Row #6
    obstacles.add((6, 3))
    obstacles.add((6, 4))
    obstacles.add((6, 5))
    obstacles.add((6, 7))
    obstacles.add((6, 17))
    obstacles.add((6, 18))
    obstacles.add((6, 19))

    # Row #7
    for c in range(10, 18):
        obstacles.add((7, c))

    # Row #8
    obstacles.add((8, 10))
    obstacles.add((8, 16))
    obstacles.add((8, 17))

    # Row #9
    obstacles.add((9, 10))
    obstacles.add((9, 16))
    obstacles.add((9, 17))
    obstacles.add((9, 18))
    obstacles.add((9, 20))
    obstacles.add((9, 21))

    # Row #10
    obstacles.add((10, 6))
    obstacles.add((10, 7))
    obstacles.add((10, 8))
    obstacles.add((10, 9))
    obstacles.add((10, 10))
    obstacles.add((10, 16))

    # Row #11
    obstacles.add((11, 4))
    obstacles.add((11, 12))
    obstacles.add((11, 16))

    # Row #12
    obstacles.add((12, 4))
    obstacles.add((12, 12))
    obstacles.add((12, 14))
    obstacles.add((12, 16))
    obstacles.add((12, 17))
    obstacles.add((12, 18))
    obstacles.add((12, 19))
    obstacles.add((12, 20))

    # Row #13
    obstacles.add((13, 4))
    obstacles.add((13, 5))
    obstacles.add((13, 7))
    obstacles.add((13, 12))
    obstacles.add((13, 16))

    # Row #14
    obstacles.add((14, 7))
    obstacles.add((14, 12))
    obstacles.add((14, 16))

    # Row #15
    obstacles.add((15, 3))
    obstacles.add((15, 4))
    obstacles.add((15, 5))
    obstacles.add((15, 7))
    obstacles.add((15, 8))
    obstacles.add((15, 9))
    obstacles.add((15, 10))
    obstacles.add((15, 11))
    obstacles.add((15, 12))
    obstacles.add((15, 19))
    obstacles.add((15, 20))
    obstacles.add((15, 21))

    # Row #16
    obstacles.add((16, 11))

    terminals = {
        (15, 17): +1000,

        (6, 16): -5,
        (8, 21): -5,
        (10, 17): -8,
        (13, 17): -12,

        (9, 6): -6,
        (7, 8): -20,
        (8, 8): -10,

        (11, 10): -10,
        (12, 8): -20,
        (13, 11): -5,
        (14, 10): -20,

        (10, 12): -10,
        (10, 13): -20,
        (10, 14): -15,
        (9, 14): -20,
        (12, 15): -20,
        (14, 13): -10,
        (15, 15): -8
    }

    # Convert the above definition to the one compatible with RoomEnvironment.
    # Generate all valid states (non-obstacle cells)
    valid_states = set()
    for r in range(rows):
        for c in range(cols):
            if (r, c) not in obstacles:
                valid_states.add((r, c))

    # Build adjacency list - 4-directional movement (up, down, left, right)
    adj = {}
    directions = [(-1, 0), (1, 0), (0, -1), (0, 1)]  # up, down, left, right

    for state in valid_states:
        r, c = state
        neighbors = []

        for dr, dc in directions:
            new_r, new_c = r + dr, c + dc
            new_state = (new_r, new_c)

            # Check if the new state is valid (in bounds and not an obstacle)
            if (0 <= new_r < rows and 0 <= new_c < cols and
                new_state in valid_states):
                neighbors.append(new_state)

        adj[state] = neighbors

    # Set start state to (16, 3) as requested
    start_state = (16, 3) if (16, 3) in valid_states else (1, 1)

    # Convert to string keys for compatibility with existing system
    # But use meaningful names that show coordinates
    adj_str = {}
    terminal_rewards_str = {}
    room_coords = {}

    # Special handling for start state and goal state
    start_key = "S"
    goal_key = "GOAL"

    for state in valid_states:
        r, c = state
        if state == start_state:
            key = "S"
        elif state == (16, 17):  # The positive terminal
            key = "GOAL"
        else:
            key = f"({r},{c})"

        # Convert neighbors to string keys
        neighbors_str = []
        for neighbor in adj[state]:
            nr, nc = neighbor
            if neighbor == start_state:
                neighbor_key = "S"
            elif neighbor == (16, 17):
                neighbor_key = "GOAL"
            else:
                neighbor_key = f"({nr},{nc})"
            neighbors_str.append(neighbor_key)

        adj_str[key] = neighbors_str

        # Set coordinates for visualization (flip y for matplotlib)
        room_coords[key] = (c, rows - 1 - r)  # x=col, y=flipped_row

        # Add terminal rewards if this state has them
        if state in terminals:
            terminal_rewards_str[key] = terminals[state]

    return adj_str, terminal_rewards_str, room_coords

def get_graph(graph_type="custom_rooms"):
    """
    Get a graph definition by type

    Args:
        graph_type (str): Type of graph to create. Options:
            - "custom_rooms": Original room layout with pit and goal
            - "simple_grid": Simple 3x3 grid layout
            - "complex_maze": More complex maze-like structure

    Returns:
        tuple: (adjacency_dict, terminal_rewards_dict, room_coordinates_dict)
    """
    if graph_type == "custom_rooms":
        return create_room_graph()
    elif graph_type == "simple_grid":
        return create_simple_grid()
    elif graph_type == "complex_maze":
        return create_complex_maze()
    else:
        raise ValueError(f"Unknown graph type: {graph_type}. Available types: {AVAILABLE_GRAPHS}")

def list_available_graphs():
    """List all available graph types with descriptions"""
    descriptions = {
        "custom_rooms": "Original room layout with goal (+10) and pit (-10)",
        "simple_grid": "Simple 3x3 grid with goal (+5) and trap (-5)",
        "complex_maze": "Complex maze with goal (+100) and multiple traps (-5 to -12)"
    }

    print("Available graph types:")
    for graph_type in AVAILABLE_GRAPHS:
        print(f"  - {graph_type}: {descriptions[graph_type]}")

    return AVAILABLE_GRAPHS


def viz_graph(graph_type="complex_maze"):
    """Simple graph visualization"""

    # Create graphs directory if it doesn't exist
    graphs_dir = "graphs"
    os.makedirs(graphs_dir, exist_ok=True)

    # Get graph data
    adj, rewards, coords = get_graph(graph_type)

    # Create plot
    plt.figure(figsize=(12, 8))

    # Draw connections
    for state, neighbors in adj.items():
        x1, y1 = coords[state]
        for neighbor in neighbors:
            x2, y2 = coords[neighbor]
            plt.plot([x1, x2], [y1, y2], 'b-', alpha=0.5, linewidth=1)

    # Draw nodes
    for state, (x, y) in coords.items():
        if state == "S":
            plt.scatter(x, y, c='orange', s=200,
                        label='Start' if state == "S" else "")
        elif state == "GOAL":
            plt.scatter(x, y, c='green', s=200, label='Goal')
        elif state in rewards:
            plt.scatter(x, y, c='red', s=200, label='Trap' if len(
                [s for s in rewards if s != "GOAL"]) == 1 else "")
        else:
            plt.scatter(x, y, c='lightblue', s=150)

        # Add labels
        plt.text(x, y+0.15, state, ha='center', fontsize=8, fontweight='bold')
        if state in rewards:
            plt.text(x, y-0.2, f'{rewards[state]:+}',
                     ha='center', fontsize=7, color='black')

    plt.title(f'{graph_type.replace("_", " ").title()} Graph Structure')
    plt.axis('equal')
    plt.grid(True, alpha=0.3)
    plt.legend()

    # Save in graphs folder
    plt.tight_layout()
    output_path = os.path.join(graphs_dir, f'{graph_type}_viz.png')
    plt.savefig(output_path, dpi=150, bbox_inches='tight')
    print(f"Graph saved as {output_path}")
    # plt.show()

if __name__ == "__main__":
    # Demo the available graphs
    list_available_graphs()

    print("\nTesting graph creation:")
    for graph_type in AVAILABLE_GRAPHS:
        adj, rewards, coords = get_graph(graph_type)
        print(f"\n{graph_type}:")
        print(f"  States: {len(adj)}")
        print(f"  Terminal states: {list(rewards.keys())}")
        print(f"  Rewards: {rewards}")

        viz_graph(graph_type)
