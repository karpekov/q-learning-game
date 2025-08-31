"""
interactive_visualizer.py
Visualization tool for the room exploration MDP results.

Usage:
    python interactive_visualizer.py                      # Interactive visualization
    python interactive_visualizer.py --static-step 100    # Static visualization every 100 episodes
    python interactive_visualizer.py --experiments        # Load multiple experiments from q_learning_experiments
    python interactive_visualizer.py --experiments --experiments-graph complex_maze
    python interactive_visualizer.py --episode-skip 10    # Skip episodes, showing only every 10th episode
    python interactive_visualizer.py --experiments --episode-skip 50  # Load multiple experiments and skip every 50 episodes
    python interactive_visualizer.py --human-play         # Play the game manually by selecting actions
    python interactive_visualizer.py --human-play --graph-type complex_maze
"""

import os
import json
import argparse
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.patches as patches
import matplotlib.animation as animation
from matplotlib.colors import LinearSegmentedColormap
import matplotlib.cm as cm
import pygame
from pygame.locals import *
import networkx as nx
import math
from collections import defaultdict
from graph_definitions import get_graph, AVAILABLE_GRAPHS

# Room coordinates (standard x-y grid where 0 is in the bottom left corner)
ROOM_COORDS = {
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

# Constants for visualization
ROOM_SIZE = 0.8
GRID_SIZE = 10
COLORS = {
    'background': '#f5f5f5',
    'room': '#f0f0f080',  # Light gray with transparency
    'wall': '#212529',
    'agent': '#dc3545',
    'goal': '#28a74580',  # Pleasant green with transparency
    'pit': '#dc354580',   # Red with transparency
    'path': '#0d6efd',
    'text': '#212529'
}

class MDPVisualizer:
    def __init__(self, data_path='q_learning_data', episode_skip=1, graph_type='custom_rooms', experiments_graph_filter=None):
        self.episode_skip = max(1, episode_skip)  # Ensure at least 1
        self.graph_type = graph_type
        self.experiments = []
        self.current_experiment_index = 0

        # Get graph information
        self.adj_template, self.terminal_rewards_template, self.room_coords = get_graph(graph_type)

        # Check if this is a experiments directory
        if data_path == 'q_learning_experiments' and os.path.isdir(data_path):
            # Load experiments from specific graph subdirectory if specified
            if experiments_graph_filter:
                experiments_path = os.path.join(data_path, experiments_graph_filter)
                if os.path.isdir(experiments_path):
                    self.load_experiments(experiments_path, experiments_graph_filter)
                else:
                    print(f"Warning: No experiments found for graph type '{experiments_graph_filter}' at {experiments_path}")
                    print(f"Available graph directories:")
                    for item in os.listdir(data_path):
                        item_path = os.path.join(data_path, item)
                        if os.path.isdir(item_path):
                            print(f"  - {item}")
                    # Still need to initialize episodes for visualization to work
                    self.episodes = []
                    self.adj = {}
                    self.terminal_rewards = {}
                    self.q_values = {}
                    self.policy = {}
            else:
                # Load all experiments from all graph types
                self.load_all_experiments(data_path)
        else:
            # Load single experiment
            self.load_single_data(data_path)

        # Set current data to first experiment
        if self.experiments:
            self.set_current_experiment(0)
        else:
            # Initialize empty data if no experiments loaded
            self.episodes = []
            self.adj = self.adj_template
            self.terminal_rewards = self.terminal_rewards_template
            self.q_values = {}
            self.policy = {}
            self.data = None

    def load_experiments(self, experiments_dir, graph_type=None):
        """Load all experiments from the experiments directory"""
        graph_name = graph_type if graph_type else "mixed"
        print(f"Loading experiments from {experiments_dir} ({graph_name})...")

        # Check if this directory uses the new nested structure (has s_0, s_1, etc. subdirectories)
        has_stochasticity_subdirs = any(
            item.startswith('s_') and os.path.isdir(os.path.join(experiments_dir, item))
            for item in os.listdir(experiments_dir)
        )

        if has_stochasticity_subdirs:
            # New nested structure: experiments_dir/s_0/exp_1/...
            print(f"  Using new nested structure with stochasticity subdirectories")

            # Find all stochasticity level directories (s_0, s_1, etc.)
            for stoch_dir in sorted(os.listdir(experiments_dir)):
                if stoch_dir.startswith('s_') and os.path.isdir(os.path.join(experiments_dir, stoch_dir)):
                    stoch_path = os.path.join(experiments_dir, stoch_dir)
                    stoch_level = stoch_dir[2:]  # Extract level from 's_0' -> '0'
                    print(f"  Loading from stochasticity level {stoch_level} ({stoch_dir})...")

                    # Find all experiment directories within this stochasticity level
                    for exp_dir in sorted(os.listdir(stoch_path)):
                        exp_path = os.path.join(stoch_path, exp_dir)
                        if os.path.isdir(exp_path):
                            self._load_single_experiment(exp_path, exp_dir, graph_type, stoch_level)
        else:
            # Old flat structure: experiments_dir/exp_1/...
            print(f"  Using legacy flat structure")
            # Find all experiment directories
            for exp_dir in sorted(os.listdir(experiments_dir)):
                exp_path = os.path.join(experiments_dir, exp_dir)
                if os.path.isdir(exp_path):
                    self._load_single_experiment(exp_path, exp_dir, graph_type)

        print(f"Loaded {len(self.experiments)} experiments for {graph_name}")

    def _load_single_experiment(self, exp_path, exp_name, graph_type=None, stoch_level=None):
        """Load a single experiment from its directory"""
        # Look for exploration_data.json in the experiment directory
        data_file = os.path.join(exp_path, "exploration_data.json")
        if os.path.exists(data_file):
            try:
                with open(data_file, 'r') as f:
                    data = json.load(f)

                # Extract parameters
                epsilon = data['agent']['epsilon']
                alpha = data['agent']['alpha']
                gamma = data['agent']['gamma']
                step_cost = data['environment']['step_cost']
                stochasticity = data['environment'].get('stochasticity', 1)  # Default to 1 for backward compatibility
                epsilon_decay = data['agent'].get('epsilon_decay', 1.0)  # Default to no decay for backward compatibility
                epsilon_min = data['agent'].get('epsilon_min', 0.01)  # Default value
                alpha_decay_rate = data['agent'].get('alpha_decay_rate', 0.0)  # Default to no decay
                initial_alpha = data['agent'].get('initial_alpha', alpha)  # Default value
                optimistic_init = data['agent'].get('optimistic_init', 0.0)  # Default value

                # Add stochasticity level to experiment name if provided
                if stoch_level is not None:
                    display_name = f"s{stoch_level}_{exp_name}"
                else:
                    display_name = exp_name

                # Create experiment info
                exp_info = {
                    "name": display_name,
                    "path": data_file,
                    "data": data,
                    "graph_type": graph_type,  # Track which graph this experiment belongs to
                    "stochasticity_level": stoch_level,  # Track stochasticity level
                    "params": {
                        "epsilon": epsilon,
                        "alpha": alpha,
                        "gamma": gamma,
                        "step_cost": step_cost,
                        "stochasticity": stochasticity,
                        "epsilon_decay": epsilon_decay,
                        "epsilon_min": epsilon_min,
                        "alpha_decay_rate": alpha_decay_rate,
                        "initial_alpha": initial_alpha,
                        "optimistic_init": optimistic_init
                    }
                }

                self.experiments.append(exp_info)
                print(f"    Loaded: {display_name} (ε={epsilon}, α={alpha}, γ={gamma}, cost={step_cost}, stoch={stochasticity}, ε_decay={epsilon_decay}, ε_min={epsilon_min}, α_decay={alpha_decay_rate}, α_initial={initial_alpha}, Q_init={optimistic_init})")
            except Exception as e:
                print(f"    Error loading {data_file}: {e}")

    def load_all_experiments(self, base_experiments_dir):
        """Load experiments from all graph type subdirectories"""
        print(f"Loading experiments from all graph types in {base_experiments_dir}...")

        total_loaded = 0
        for item in sorted(os.listdir(base_experiments_dir)):
            item_path = os.path.join(base_experiments_dir, item)
            if os.path.isdir(item_path):
                # Check if this looks like a graph type directory
                if any(f.endswith('.json') or os.path.isdir(os.path.join(item_path, f))
                       for f in os.listdir(item_path)):
                    prev_count = len(self.experiments)
                    self.load_experiments(item_path, item)
                    total_loaded += len(self.experiments) - prev_count

        print(f"Total loaded: {total_loaded} experiments from all graph types")

    def load_single_data(self, data_path):
        """Load a single experiment data file"""
        # Load the exploration data
        if os.path.isdir(data_path):
            # Find the most recent file in the directory
            files = sorted(os.listdir(data_path))
            if not files:
                raise ValueError(f"No data files found in {data_path}")
            data_file = os.path.join(data_path, files[-1])
        else:
            # Use the path directly if it's a file
            data_file = data_path if data_path.endswith('.json') else f"{data_path}.json"

        with open(data_file, 'r') as f:
            data = json.load(f)

        # Extract parameters
        epsilon = data['agent']['epsilon']
        alpha = data['agent']['alpha']
        gamma = data['agent']['gamma']
        step_cost = data['environment']['step_cost']
        stochasticity = data['environment'].get('stochasticity', 1)  # Default to 1 for backward compatibility
        epsilon_decay = data['agent'].get('epsilon_decay', 1.0)  # Default to no decay for backward compatibility
        epsilon_min = data['agent'].get('epsilon_min', 0.01)  # Default value
        alpha_decay_rate = data['agent'].get('alpha_decay_rate', 0.0)  # Default to no decay
        initial_alpha = data['agent'].get('initial_alpha', alpha)  # Default value

        # Create experiment info
        exp_info = {
            "name": os.path.basename(data_path),
            "path": data_file,
            "data": data,
            "params": {
                "epsilon": epsilon,
                "alpha": alpha,
                "gamma": gamma,
                "step_cost": step_cost,
                "stochasticity": stochasticity,
                "epsilon_decay": epsilon_decay,
                "epsilon_min": epsilon_min,
                "alpha_decay_rate": alpha_decay_rate,
                "initial_alpha": initial_alpha
            }
        }

        self.experiments.append(exp_info)

    def set_current_experiment(self, index):
        """Set the current experiment data"""
        if 0 <= index < len(self.experiments):
            self.current_experiment_index = index
            exp = self.experiments[index]
            self.data = exp["data"]

            # Extract data components
            self.adj = self.data['environment']['adjacency']
            self.terminal_rewards = self.data['environment']['terminal_rewards']
            self.q_values = self.data['q_values']
            self.policy = self.data['policy']
            self.episodes = self.data['episodes']

            # Detect graph type from the data and get appropriate room coordinates
            self.room_coords = self._detect_graph_type_and_get_coords()

            # Create a directed graph for the room connections
            self.graph = nx.DiGraph()
            for room, neighbors in self.adj.items():
                for neighbor in neighbors:
                    self.graph.add_edge(room, neighbor)

            return True
        return False

    def _detect_graph_type_and_get_coords(self):
        """Detect the graph type from loaded data and return appropriate coordinates"""
        # Check the states and terminal rewards to determine graph type
        states = set(self.adj.keys())
        terminal_states = set(self.terminal_rewards.keys())

        # Check for complex_maze pattern first (most specific)
        # New complex_maze has 'GOAL' and coordinate-based states like "(16,3)"
        has_goal = 'GOAL' in terminal_states
        has_coord_states = any(s.startswith('(') and ',' in s and s.endswith(')') for s in states)

        if has_goal and has_coord_states and len(states) > 50:  # Complex maze has many states
            # Verify all states exist in complex_maze coordinates
            try:
                _, _, coords = get_graph('complex_maze')
                if all(state in coords for state in states):
                    return coords
            except Exception:
                pass

        # Check for simple_grid pattern (has numbered nodes N1, N2, etc.)
        numbered_nodes = [s for s in states if s.startswith('N') and s[1:].isdigit()]
        if len(numbered_nodes) >= 5:  # Simple grid has many numbered nodes
            try:
                _, _, coords = get_graph('simple_grid')
                if all(state in coords for state in states):
                    return coords
            except Exception:
                pass

        # Check for custom_rooms pattern
        if 'S' in states and 'J' in terminal_states and 'T' in terminal_states:
            if len(states) >= 10:  # Custom rooms has 13 states
                try:
                    _, _, coords = get_graph('custom_rooms')
                    if all(state in coords for state in states):
                        return coords
                except Exception:
                    pass

        # Final fallback: use the graph type that contains all required states
        for graph_type in AVAILABLE_GRAPHS:
            try:
                _, _, coords = get_graph(graph_type)
                # Check if all states in the data exist in this graph's coordinates
                if all(state in coords for state in states):
                    print(f"Detected graph type: {graph_type} (by state matching)")
                    return coords
            except Exception:
                continue

        # Ultimate fallback: create custom coordinates for the unknown graph
        print(f"Note: Creating custom layout for graph with {len(states)} states")

        # Generate coordinates for all states in a grid layout
        all_states = list(states)
        custom_coords = {}

        # Try to arrange states in a reasonable grid
        import math
        grid_size = math.ceil(math.sqrt(len(all_states)))

        for i, state in enumerate(sorted(all_states)):
            x = i % grid_size
            y = i // grid_size
            custom_coords[state] = (x * 2, y * 2)  # Space them out

        return custom_coords

    def get_experiment_count(self):
        """Get the number of loaded experiments"""
        return len(self.experiments)

    def get_current_experiment(self):
        """Get the current experiment info"""
        if self.experiments:
            return self.experiments[self.current_experiment_index]
        return None

    def create_static_visualization(self, episode_step=100):
        """Create static visualizations at regular episode intervals"""
        os.makedirs('visualizations', exist_ok=True)

        # Determine episode indices to visualize
        num_episodes = len(self.episodes)
        episode_indices = list(range(0, num_episodes, episode_step))
        if (num_episodes - 1) not in episode_indices:
            episode_indices.append(num_episodes - 1)

        # Create a figure for each episode
        for idx in episode_indices:
            episode = self.episodes[idx]
            steps = episode['steps']

            # Extract q-values at this point (this is a simplification - we'd need to track q-values over time)
            # For demonstration, we'll use the final q-values and scale them
            q_scale = (idx + 1) / num_episodes

            fig, ax = plt.subplots(figsize=(12, 10))
            self._draw_rooms(ax)
            self._draw_connections(ax)

            # Draw the path taken in this episode
            self._draw_episode_path(ax, steps)

            # Draw the current policy (scaled by learning progress)
            self._draw_policy_arrows(ax, q_scale)

            plt.title(f"Episode {idx+1}/{num_episodes} - Steps: {episode['step_count']} - Reward: {episode['total_reward']:.2f}")
            plt.tight_layout()
            plt.savefig(os.path.join("visualizations", f"episode_{idx+1}.png"), dpi=150)
            plt.close()

        print(f"Created static visualizations in the 'visualizations' directory")

    def _draw_rooms(self, ax):
        """Draw the rooms as rectangles on the given axes"""
        # Set the bounds of the plot
        ax.set_xlim(-1, 9)
        ax.set_ylim(-1, 7)

        # Draw each room
        for room, (x, y) in self.room_coords.items():
            color = COLORS['room']
            if room in self.terminal_rewards:
                color = COLORS['goal'] if self.terminal_rewards[room] > 0 else COLORS['pit']

            rect = patches.Rectangle(
                (x - ROOM_SIZE/2, y - ROOM_SIZE/2),
                ROOM_SIZE, ROOM_SIZE,
                linewidth=2,
                edgecolor=COLORS['wall'],
                facecolor=color,
                alpha=0.8
            )
            ax.add_patch(rect)

            # Add room label
            ax.text(x, y, room,
                    ha='center', va='center',
                    fontsize=12, fontweight='bold',
                    color=COLORS['text'])

            # Add value if available
            if room in self.q_values:
                # Find the max Q-value for this room
                values = self.q_values[room]
                if values:
                    max_q = max(values.values())
                    ax.text(x, y - 0.25, f"{max_q:.2f}",
                            ha='center', va='center',
                            fontsize=9,
                            color=COLORS['text'])

    def _draw_connections(self, ax):
        """Draw the connections between rooms"""
        for room, neighbors in self.adj.items():
            x1, y1 = self.room_coords[room]
            for neighbor in neighbors:
                x2, y2 = self.room_coords[neighbor]

                # Calculate the start and end points to avoid overlapping with rooms
                dx, dy = x2 - x1, y2 - y1
                length = np.sqrt(dx**2 + dy**2)

                if length > 0:
                    # Normalize
                    dx, dy = dx / length, dy / length

                    # Adjust start and end points
                    start_x = x1 + dx * (ROOM_SIZE/2)
                    start_y = y1 + dy * (ROOM_SIZE/2)
                    end_x = x2 - dx * (ROOM_SIZE/2)
                    end_y = y2 - dy * (ROOM_SIZE/2)

                    # Draw the connection
                    ax.plot([start_x, end_x], [start_y, end_y],
                            color=COLORS['wall'], linewidth=1, alpha=0.6)

    def _draw_episode_path(self, ax, steps):
        """Draw the path taken in an episode"""
        if not steps:
            return

        # Extract states visited
        states = [step['state'] for step in steps] + [steps[-1]['next_state']]

        # Draw the path
        x_coords = [self.room_coords[s][0] for s in states]
        y_coords = [self.room_coords[s][1] for s in states]

        ax.plot(x_coords, y_coords, 'o-',
                color=COLORS['agent'], linewidth=2,
                markersize=8, alpha=0.7)

        # Highlight start and end points
        ax.plot(x_coords[0], y_coords[0], 'o',
                color=COLORS['agent'], markersize=10)
        ax.plot(x_coords[-1], y_coords[-1], 'X',
                color=COLORS['agent'], markersize=12)

    def _draw_policy_arrows(self, ax, scale_factor=1.0):
        """Draw arrows indicating the current policy"""
        for state, action in self.policy.items():
            if state in self.terminal_rewards or action == "-":
                continue

            x1, y1 = self.room_coords[state]
            x2, y2 = self.room_coords[action]

            # Calculate direction vector
            dx, dy = x2 - x1, y2 - y1
            length = np.sqrt(dx**2 + dy**2)

            if length > 0:
                # Normalize and scale
                dx, dy = (dx / length) * scale_factor, (dy / length) * scale_factor

                # Draw arrow
                ax.arrow(x1, y1, dx*0.4, dy*0.4,
                         head_width=0.2*scale_factor,
                         head_length=0.2*scale_factor,
                         fc=COLORS['path'], ec=COLORS['path'],
                         alpha=0.8)

    def interactive_visualization(self):
        """Launch an interactive pygame visualization"""
        pygame.init()
        # Optimized resolution for smaller screens
        screen_width, screen_height = 1000, 750
        screen = pygame.display.set_mode((screen_width, screen_height))
        pygame.display.set_caption("MDP Room Explorer")

        clock = pygame.time.Clock()
        running = True

        # Visualization state
        episode_index = 0
        step_index = 0
        playing = False
        speed_levels = ["Slow", "Medium", "Fast", "Very Fast"]
        speed_values = [10, 5, 2, 1]  # frames per step (inverse relationship)
        speed_index = 1  # Start with Medium speed
        speed = speed_values[speed_index]
        frame_counter = 0
        show_policy = False
        show_values = False
        show_path = True

        # Episode skip options and current setting
        skip_options = [1, 5, 10, 25, 50, 100]
        skip_index = skip_options.index(self.episode_skip) if self.episode_skip in skip_options else 0

        # Filter episodes based on skip rate
        def get_visible_episodes():
            """Get episode indices that should be visible based on skip rate"""
            if self.episode_skip == 1:
                return list(range(len(self.episodes)))
            else:
                # Always include the first and last episode
                visible = [0]
                # Add episodes at skip intervals
                visible.extend(range(self.episode_skip, len(self.episodes), self.episode_skip))
                # Make sure the last episode is included
                if (len(self.episodes) - 1) not in visible:
                    visible.append(len(self.episodes) - 1)
                return sorted(visible)

        visible_episodes = get_visible_episodes()

        # Map from visible index to actual episode index
        def visible_to_actual(visible_idx):
            if 0 <= visible_idx < len(visible_episodes):
                return visible_episodes[visible_idx]
            return 0

        # Find closest visible episode
        def find_closest_visible(actual_idx):
            if actual_idx in visible_episodes:
                return visible_episodes.index(actual_idx)
            # Find the closest visible episode
            for i, ep_idx in enumerate(visible_episodes):
                if ep_idx > actual_idx:
                    if i > 0 and (actual_idx - visible_episodes[i-1] < ep_idx - actual_idx):
                        return i-1
                    return i
            return len(visible_episodes) - 1

        # Initialize with the first visible episode
        visible_episode_index = 0
        episode_index = visible_to_actual(visible_episode_index)

        # Button class for GUI controls
        class Button:
            def __init__(self, x, y, width, height, text, color='#4a6fa5', hover_color='#6f8dbd', text_color='#ffffff', icon=None):
                self.rect = pygame.Rect(x, y, width, height)
                self.text = text
                self.color = pygame.Color(color)
                self.hover_color = pygame.Color(hover_color)
                self.text_color = pygame.Color(text_color)
                self.hovered = False
                self.active = False
                self.icon = icon
                self.disabled = False

            def draw(self, surface, font):
                # Determine color based on state
                if self.disabled:
                    color = pygame.Color('#aaaaaa')
                elif self.hovered:
                    color = self.hover_color
                else:
                    color = self.color

                if self.active:
                    # Use a different color for active toggle buttons
                    color = pygame.Color('#28a745')

                # Draw button with shadow
                shadow_rect = pygame.Rect(self.rect.x + 2, self.rect.y + 2, self.rect.width, self.rect.height)
                try:
                    pygame.draw.rect(surface, pygame.Color('#00000033'), shadow_rect, border_radius=10)
                    pygame.draw.rect(surface, color, self.rect, border_radius=10)
                    # Add highlight for 3D effect
                    highlight_rect = pygame.Rect(self.rect.x, self.rect.y, self.rect.width, 2)
                    pygame.draw.rect(surface, pygame.Color('#ffffff55'), highlight_rect, border_radius=10)
                except:
                    # Fallback for older pygame versions
                    pygame.draw.rect(surface, pygame.Color('#00000033'), shadow_rect)
                    pygame.draw.rect(surface, color, self.rect)

                # Draw text
                text_surf = font.render(self.text, True, self.text_color)
                text_rect = text_surf.get_rect(center=self.rect.center)
                surface.blit(text_surf, text_rect)

            def update(self, mouse_pos):
                # Check if mouse is over button
                self.hovered = self.rect.collidepoint(mouse_pos) and not self.disabled

            def check_click(self, mouse_pos, mouse_click):
                # Check if button was clicked
                if self.rect.collidepoint(mouse_pos) and mouse_click and not self.disabled:
                    return True
                return False

            def set_disabled(self, disabled):
                self.disabled = disabled

        # Scale coordinates to screen
        padding = 80
        padding_top = 190  # Adjusted to give grid breathing room from top and bottom
        # Calculate bounds dynamically from room coordinates
        x_coords = [coord[0] for coord in self.room_coords.values()]
        y_coords = [coord[1] for coord in self.room_coords.values()]
        min_x, max_x = min(x_coords), max(x_coords)
        min_y, max_y = min(y_coords), max(y_coords)

        scale_x = (screen_width - 2 * padding) / (max_x - min_x)
        scale_y = (screen_height - padding - padding_top) / (max_y - min_y)
        scale = min(scale_x, scale_y)

        # Limit maximum scale for large mazes and ensure minimum scale
        max_scale = 40.0  # Maximum scale to prevent overly large rooms
        min_scale = 15.0  # Minimum scale to ensure readability
        scale = max(min_scale, min(scale, max_scale))

        # Function to convert room coordinates to screen coordinates
        def room_to_screen(x, y):
            screen_x = padding + (x - min_x) * scale
            # Flip y-axis since pygame's origin is at the top left
            # Use padding_top instead of padding for the top margin
            screen_y = screen_height - padding - (y - min_y) * scale
            return (int(screen_x), int(screen_y))

        # Pre-calculate room positions
        room_positions = {
            room: room_to_screen(x, y) for room, (x, y) in self.room_coords.items()
        }

        # Scale room size based on scale factor
        room_size = int(max(20, min(80, scale * 0.8)))  # Adaptive room size

        # Create fonts - make room labels smaller for large graphs, but keep UI fonts normal
        num_states = len(self.room_coords)
        if num_states > 30:  # Large graph like complex_maze
            room_font_size = 8  # Small font for room labels only
        else:  # Small/medium graphs
            room_font_size = 26  # Normal size for room labels

        # UI fonts always stay normal size for readability
        ui_font_size = 26
        ui_small_font_size = 20
        ui_tiny_font_size = 16
        button_font_size = 18

        try:
            room_font = pygame.font.SysFont("Arial", room_font_size)  # For room labels
            font = pygame.font.SysFont("Arial", ui_font_size)  # For main UI text
            small_font = pygame.font.SysFont("Arial", ui_small_font_size)  # For secondary UI text
            tiny_font = pygame.font.SysFont("Arial", ui_tiny_font_size)  # For Q-values
            button_font = pygame.font.SysFont("Arial", button_font_size, bold=True)
        except:
            # Fallback to default fonts
            room_font = pygame.font.SysFont(None, room_font_size)
            font = pygame.font.SysFont(None, ui_font_size)
            small_font = pygame.font.SysFont(None, ui_small_font_size)
            tiny_font = pygame.font.SysFont(None, ui_tiny_font_size)
            button_font = pygame.font.SysFont(None, button_font_size)

        # Create UI buttons
        button_width = 100
        button_height = 30
        button_margin = 8

        # Control panel at top right
        control_panel_x = screen_width - 120
        control_panel_y = 20
        button_x = control_panel_x
        button_y = control_panel_y

        # Create buttons
        play_pause_button = Button(button_x, button_y, button_width, button_height, "Play/Pause")
        button_y += button_height + button_margin

        restart_button = Button(button_x, button_y, button_width, button_height, "Restart")
        button_y += button_height + button_margin

        # Episode navigation
        prev_episode_button = Button(button_x, button_y, button_width, button_height, "Prev Episode")
        button_y += button_height + button_margin

        next_episode_button = Button(button_x, button_y, button_width, button_height, "Next Episode")
        button_y += button_height + button_margin

        # Step navigation
        prev_step_button = Button(button_x, button_y, button_width, button_height, "Prev Step")
        button_y += button_height + button_margin

        next_step_button = Button(button_x, button_y, button_width, button_height, "Next Step")
        button_y += button_height + button_margin

        # Speed control
        speed_button = Button(button_x, button_y, button_width, button_height, speed_levels[speed_index])
        button_y += button_height + button_margin

        # Episode skip control
        skip_button = Button(button_x, button_y, button_width, button_height, f"Skip {self.episode_skip}")
        button_y += button_height + button_margin

        # Toggle buttons (with active state)
        toggle_policy_button = Button(button_x, button_y, button_width, button_height, "Policy")
        toggle_policy_button.active = show_policy
        button_y += button_height + button_margin

        toggle_values_button = Button(button_x, button_y, button_width, button_height, "Q-Values")
        toggle_values_button.active = show_values
        button_y += button_height + button_margin

        toggle_path_button = Button(button_x, button_y, button_width, button_height, "Path")
        toggle_path_button.active = show_path

        # Add experiment navigation buttons (only if multiple experiments loaded)
        experiment_buttons = []
        if len(self.experiments) > 1:
            button_y += button_height + button_margin * 2  # Extra space

            prev_exp_button = Button(button_x, button_y, button_width, button_height, "Prev Exp", color='#6a5acd')
            button_y += button_height + button_margin

            next_exp_button = Button(button_x, button_y, button_width, button_height, "Next Exp", color='#6a5acd')

            experiment_buttons = [prev_exp_button, next_exp_button]

        # Group all buttons for easier updating and drawing
        buttons = [
            play_pause_button, restart_button, prev_episode_button, next_episode_button,
            prev_step_button, next_step_button, speed_button, skip_button, toggle_policy_button,
            toggle_values_button, toggle_path_button
        ] + experiment_buttons

        # Create heatmap colormap for Q-values
        def get_q_color(q_value, min_val=-10, max_val=10):
            """
            Use a standard divergent colormap from matplotlib:
            - Blue for negative values
            - White for neutral values (near zero)
            - Red for positive values
            """
            # Normalize value between 0 and 1
            normalized = (max(min(q_value, max_val), min_val) - min_val) / (max_val - min_val)

            try:
                # Use new matplotlib API
                cmap = plt.get_cmap('RdYlGn')
            except AttributeError:
                # Fallback for older matplotlib versions
                cmap = cm.get_cmap('RdYlGn')
            rgba = cmap(normalized)

            # Convert to pygame color with transparency
            return (int(rgba[0]*255), int(rgba[1]*255), int(rgba[2]*255), 210)

        # Simulate Q-value progression based on episode number
        def get_q_values_at_episode(episode_idx):
            # Better simulation of Q-value learning progression using sigmoid curve
            progress = min(1.0, (episode_idx + 1) / len(self.episodes))

            # Use sigmoidal learning curve for more realistic progression
            import math
            sigmoid_progress = 1 / (1 + math.exp(-8 * (progress - 0.5)))

            simulated_q_values = {}
            for state, actions in self.q_values.items():
                simulated_q_values[state] = {}
                for action, final_value in actions.items():
                    # Start from optimistic initialization if available
                    initial_value = 0.0
                    if hasattr(self, 'data') and self.data and 'agent' in self.data:
                        initial_value = self.data['agent'].get('optimistic_init', 0.0)

                    # Interpolate from initial to final using sigmoid curve
                    current_value = initial_value + (final_value - initial_value) * sigmoid_progress
                    simulated_q_values[state][action] = current_value

            return simulated_q_values

        # Get policy at a given episode
        def get_policy_at_episode(episode_idx, q_values):
            # Reconstruct policy based on current Q-values
            policy = {}
            for state in self.adj.keys():
                if state in self.terminal_rewards:
                    policy[state] = "-"
                    continue

                # Find best action based on current Q-values
                actions = q_values.get(state, {})
                if not actions:
                    policy[state] = "-"
                    continue

                best_action = max(actions, key=actions.get, default=None)
                if best_action is None:
                    policy[state] = "-"
                else:
                    policy[state] = self.adj[state][int(best_action)]

            return policy

        # Function to calculate edge position for Q-value display
        def get_edge_q_position(from_pos, to_pos, action_idx, total_actions):
            # Calculate the position closer to the starting node
            dx = to_pos[0] - from_pos[0]
            dy = to_pos[1] - from_pos[1]
            length = math.sqrt(dx*dx + dy*dy)

            if length > 0:
                # Position at 25% of the edge length from the start node
                ratio = 0.25
                pos_x = from_pos[0] + dx * ratio
                pos_y = from_pos[1] + dy * ratio

                # Add a perpendicular offset based on action index for multiple actions
                if total_actions > 1:
                    # Adaptive offset based on graph size
                    num_states = len(room_positions)
                    base_offset = 15 if num_states <= 30 else 8  # Smaller offset for large graphs

                    # Perpendicular vector
                    perp_dx = -dy / length * base_offset
                    perp_dy = dx / length * base_offset

                    # Offset based on action index
                    offset = (action_idx - (total_actions - 1) / 2) * 0.8  # Reduced multiplier
                    pos_x += perp_dx * offset
                    pos_y += perp_dy * offset

                return (int(pos_x), int(pos_y))

            return from_pos  # Fallback

        # Main game loop
        mouse_click = False
        while running:
            # Get mouse position
            mouse_pos = pygame.mouse.get_pos()
            mouse_click = False

            for event in pygame.event.get():
                if event.type == QUIT:
                    running = False
                elif event.type == MOUSEBUTTONDOWN:
                    if event.button == 1:  # Left mouse button
                        mouse_click = True
                elif event.type == KEYDOWN:
                    # Keep keyboard shortcuts as alternative
                    if event.key == K_SPACE:
                        playing = not playing
                    elif event.key == K_LEFT:
                        episode_index = max(0, episode_index - 1)
                        step_index = 0
                    elif event.key == K_RIGHT:
                        episode_index = min(len(self.episodes) - 1, episode_index + 1)
                        step_index = 0
                    elif event.key == K_UP:
                        speed_index = min(len(speed_levels) - 1, speed_index + 1)
                        speed = speed_values[speed_index]
                        speed_button.text = speed_levels[speed_index]
                    elif event.key == K_DOWN:
                        speed_index = max(0, speed_index - 1)
                        speed = speed_values[speed_index]
                        speed_button.text = speed_levels[speed_index]
                    elif event.key == K_p:
                        show_policy = not show_policy
                        toggle_policy_button.active = show_policy
                    elif event.key == K_v:
                        show_values = not show_values
                        toggle_values_button.active = show_values
                    elif event.key == K_t:
                        show_path = not show_path
                        toggle_path_button.active = show_path
                    elif event.key == K_r:
                        step_index = 0  # Restart episode
                    elif event.key == K_COMMA:  # Previous step
                        step_index = max(0, step_index - 1)
                    elif event.key == K_PERIOD:  # Next step
                        step_index += 1

            # Get current episode data
            episode = self.episodes[episode_index]
            steps = episode['steps']

            # Update button states
            prev_step_button.set_disabled(step_index <= 0)
            next_step_button.set_disabled(step_index >= len(steps))
            prev_episode_button.set_disabled(visible_episode_index <= 0)
            next_episode_button.set_disabled(visible_episode_index >= len(visible_episodes) - 1)

            # Update buttons
            for button in buttons:
                button.update(mouse_pos)

            # Check button clicks
            if mouse_click:
                if play_pause_button.check_click(mouse_pos, mouse_click):
                    playing = not playing

                elif restart_button.check_click(mouse_pos, mouse_click):
                    visible_episode_index = 0
                    episode_index = visible_to_actual(visible_episode_index)
                    step_index = 0

                elif prev_episode_button.check_click(mouse_pos, mouse_click):
                    if visible_episode_index > 0:
                        visible_episode_index -= 1
                        episode_index = visible_to_actual(visible_episode_index)
                        step_index = 0

                elif next_episode_button.check_click(mouse_pos, mouse_click):
                    if visible_episode_index < len(visible_episodes) - 1:
                        visible_episode_index += 1
                        episode_index = visible_to_actual(visible_episode_index)
                        step_index = 0

                elif prev_step_button.check_click(mouse_pos, mouse_click):
                    step_index = max(0, step_index - 1)

                elif next_step_button.check_click(mouse_pos, mouse_click):
                    if step_index < len(steps):
                        step_index += 1

                elif speed_button.check_click(mouse_pos, mouse_click):
                    # Cycle through speed levels
                    speed_index = (speed_index + 1) % len(speed_levels)
                    speed = speed_values[speed_index]
                    speed_button.text = speed_levels[speed_index]

                elif skip_button.check_click(mouse_pos, mouse_click):
                    # Cycle through skip options
                    skip_index = (skip_index + 1) % len(skip_options)
                    self.episode_skip = skip_options[skip_index]
                    skip_button.text = f"Skip {self.episode_skip}"

                    # Update visible episodes
                    visible_episodes = get_visible_episodes()

                    # Find closest visible episode to current one
                    visible_episode_index = find_closest_visible(episode_index)
                    episode_index = visible_to_actual(visible_episode_index)

                elif toggle_policy_button.check_click(mouse_pos, mouse_click):
                    show_policy = not show_policy
                    toggle_policy_button.active = show_policy

                elif toggle_values_button.check_click(mouse_pos, mouse_click):
                    show_values = not show_values
                    toggle_values_button.active = show_values

                elif toggle_path_button.check_click(mouse_pos, mouse_click):
                    show_path = not show_path
                    toggle_path_button.active = show_path

                # Handle experiment navigation buttons
                if experiment_buttons and prev_exp_button.check_click(mouse_pos, mouse_click):
                    new_index = (self.current_experiment_index - 1) % len(self.experiments)
                    if self.set_current_experiment(new_index):
                        visible_episodes = get_visible_episodes()
                        visible_episode_index = 0
                        episode_index = visible_to_actual(visible_episode_index)
                        step_index = 0

                if experiment_buttons and next_exp_button.check_click(mouse_pos, mouse_click):
                    new_index = (self.current_experiment_index + 1) % len(self.experiments)
                    if self.set_current_experiment(new_index):
                        visible_episodes = get_visible_episodes()
                        visible_episode_index = 0
                        episode_index = visible_to_actual(visible_episode_index)
                        step_index = 0

            # Get simulated Q-values and policy
            current_q_values = get_q_values_at_episode(episode_index)
            current_policy = get_policy_at_episode(episode_index, current_q_values)

            # Determine current state from episode data
            current_state = None
            if steps and step_index > 0:
                if step_index >= len(steps):
                    current_state = steps[-1]['next_state']
                else:
                    current_state = steps[step_index]['state']
            elif steps:
                current_state = steps[0]['state']

            # Clear screen with a nicer background
            screen.fill(pygame.Color(COLORS['background']))

            # First draw all connections (edges) - keep them black
            for room, neighbors in self.adj.items():
                pos1 = room_positions[room]
                for neighbor in neighbors:
                    pos2 = room_positions[neighbor]
                    # Use anti-aliased line if available
                    try:
                        pygame.draw.aaline(screen, pygame.Color(COLORS['wall']),
                                         pos1, pos2, 1)
                    except:
                        pygame.draw.line(screen, pygame.Color(COLORS['wall']),
                                       pos1, pos2, 1)

            # Then draw rooms with better appearance
            for room, pos in room_positions.items():
                # Choose room color based on terminal state, current position, and exploration
                if current_state and room == current_state:
                    # If current state is a terminal state, use terminal color; otherwise use yellow highlight
                    if room in self.terminal_rewards:
                        if self.terminal_rewards[room] > 0:
                            color = pygame.Color(COLORS['goal'])  # Green for positive terminal
                        else:
                            color = pygame.Color(COLORS['pit'])   # Red for negative terminal
                    else:
                        color = pygame.Color('#ffcc00')  # Yellow highlight for non-terminal current room
                elif room in self.terminal_rewards:
                    if self.terminal_rewards[room] > 0:
                        color = pygame.Color(COLORS['goal'])  # Goal room
                    else:
                        color = pygame.Color(COLORS['pit'])   # Pit room
                else:
                    color = pygame.Color(COLORS['room'])  # Regular room

                # If room is a neighbor but not explored, show it as foggy
                if current_state and room in self.adj and current_state in self.adj[room]:
                    # Use a darker, more transparent color for unexplored neighbors
                    color.a = 80  # Make it more transparent
                    border_color = pygame.Color('#aaaaaa')  # Lighter border for unexplored
                    label_color = pygame.Color('#999999')  # Lighter text for unexplored
                else:
                    border_color = pygame.Color(COLORS['wall'])
                    label_color = pygame.Color(COLORS['text'])

                # Draw room with rounded corners if available
                try:
                    pygame.draw.rect(screen, color,
                                   (pos[0] - room_size//2, pos[1] - room_size//2,
                                    room_size, room_size),
                                   border_radius=room_size//5)

                    pygame.draw.rect(screen, border_color,
                                   (pos[0] - room_size//2, pos[1] - room_size//2,
                                    room_size, room_size),
                                   width=2, border_radius=room_size//5)
                except:
                    # Fallback for older pygame versions
                    pygame.draw.rect(screen, color,
                                   (pos[0] - room_size//2, pos[1] - room_size//2,
                                    room_size, room_size))

                    pygame.draw.rect(screen, border_color,
                                   (pos[0] - room_size//2, pos[1] - room_size//2,
                                    room_size, room_size),
                                   2)

                # Room label with better positioning
                label = room
                # Add terminal value if applicable
                if room in self.terminal_rewards:
                    label += f"\n{self.terminal_rewards[room]}"

                text = room_font.render(label, True, label_color)
                screen.blit(text, (pos[0] - text.get_width()//2, pos[1] - text.get_height()//2))

            # Draw policy arrows if enabled
            if show_policy:
                for state, target in current_policy.items():
                    if target != "-":
                        # Find position of both rooms
                        pos1 = room_positions[state]
                        pos2 = room_positions[target]

                        # Calculate direction vector
                        dx, dy = pos2[0] - pos1[0], pos2[1] - pos1[1]
                        length = math.sqrt(dx*dx + dy*dy)

                        if length > 0:
                            # Normalize and scale
                            dx, dy = dx / length, dy / length

                            # Calculate start and end points
                            start_x = pos1[0]
                            start_y = pos1[1]
                            end_x = start_x + int(dx * room_size * 0.7)
                            end_y = start_y + int(dy * room_size * 0.7)

                            # Draw policy arrow
                            pygame.draw.line(screen, pygame.Color('#0066cc'),
                                           (start_x, start_y), (end_x, end_y), 3)

                            # Draw arrow head
                            head_size = 12
                            pygame.draw.polygon(screen, pygame.Color('#0066cc'), [
                                (end_x, end_y),
                                (int(end_x - head_size*dx + head_size*dy*0.5),
                                int(end_y - head_size*dy - head_size*dx*0.5)),
                                (int(end_x - head_size*dx - head_size*dy*0.5),
                                int(end_y - head_size*dy + head_size*dx*0.5))
                            ])

            # Draw Q-values if enabled
            if show_values:
                for state in self.adj.keys():
                    if state in current_q_values and state in room_positions:
                        state_pos = room_positions[state]

                        # Get available actions for this state
                        if state in self.adj:
                            action_indices = list(range(len(self.adj[state])))
                            total_actions = len(action_indices)

                            for action_idx in action_indices:
                                if action_idx < len(self.adj[state]):
                                    target_state = self.adj[state][action_idx]
                                    if target_state in room_positions:
                                        target_pos = room_positions[target_state]

                                        # Get Q-value for this state-action pair
                                        q_value = current_q_values[state].get(str(action_idx), 0.0)

                                        # Calculate position for Q-value display
                                        q_pos = get_edge_q_position(state_pos, target_pos, action_idx, total_actions)

                                        # Color-code Q-value based on its value
                                        q_color_rgba = get_q_color(q_value, min_val=-10, max_val=10)
                                        q_color = pygame.Color(q_color_rgba[0], q_color_rgba[1], q_color_rgba[2])

                                        # Adaptive Q-value display based on graph size
                                        num_states = len(room_positions)
                                        if num_states > 100:  # Large graphs like complex_maze
                                            base_radius = 8
                                            text_format = f"{q_value:.1f}"  # Shorter format
                                        elif num_states > 30:  # Medium graphs
                                            base_radius = 10
                                            text_format = f"{q_value:.1f}"
                                        else:  # Small graphs
                                            base_radius = 12
                                            text_format = f"{q_value:.2f}"

                                        # Create background for Q-value text with adaptive formatting
                                        q_text = text_format
                                        text_surface = tiny_font.render(q_text, True, pygame.Color('#000000'))
                                        text_rect = text_surface.get_rect(center=q_pos)

                                        # Much smaller, fixed-size circle
                                        bg_radius = base_radius
                                        try:
                                            # Create a surface with alpha for the background
                                            bg_surface = pygame.Surface((bg_radius * 2, bg_radius * 2), pygame.SRCALPHA)
                                            bg_surface.fill((*q_color_rgba[:3], 180))  # Semi-transparent background
                                            bg_rect = bg_surface.get_rect(center=q_pos)
                                            screen.blit(bg_surface, bg_rect)

                                            # Draw border around the background
                                            pygame.draw.circle(screen, pygame.Color('#333333'), q_pos, bg_radius, 1)
                                        except:
                                            # Fallback for older pygame versions
                                            pygame.draw.circle(screen, q_color, q_pos, bg_radius)
                                            pygame.draw.circle(screen, pygame.Color('#333333'), q_pos, bg_radius, 1)

                                        # Draw the Q-value text
                                        screen.blit(text_surface, text_rect)

            # Draw path up to current step with improved visibility
            if show_path and steps and step_index > 0:
                # Extract path data
                path_states = [steps[i]['state'] for i in range(min(step_index, len(steps)))]
                if step_index >= len(steps):
                    path_states.append(steps[-1]['next_state'])

                # Draw the full path with thicker line
                path_points = [room_positions[state] for state in path_states]
                if len(path_points) > 1:
                    for i in range(len(path_points) - 1):
                        # Draw path segments with arrows to show direction
                        start, end = path_points[i], path_points[i+1]
                        # Draw line
                        pygame.draw.line(screen, pygame.Color(COLORS['agent']),
                                        start, end, 4)

                        # Draw direction arrow at midpoint
                        mid_x = (start[0] + end[0]) // 2
                        mid_y = (start[1] + end[1]) // 2
                        dx, dy = end[0] - start[0], end[1] - start[1]
                        length = math.sqrt(dx*dx + dy*dy)

                        if length > 0:
                            # Normalize
                            dx, dy = dx/length, dy/length

                            # Calculate arrow points
                            arrow_size = 10
                            arrow_points = [
                                (mid_x, mid_y),
                                (int(mid_x - arrow_size*dx + arrow_size*dy*0.5),
                                 int(mid_y - arrow_size*dy - arrow_size*dx*0.5)),
                                (int(mid_x - arrow_size*dx - arrow_size*dy*0.5),
                                 int(mid_y - arrow_size*dy + arrow_size*dx*0.5))
                            ]
                            pygame.draw.polygon(screen, pygame.Color(COLORS['agent']), arrow_points)

                # Draw current agent position with pulsing effect
                if path_points:
                    pulse_size = 10 + int(5 * math.sin(pygame.time.get_ticks() / 200))
                    pygame.draw.circle(screen, pygame.Color(COLORS['agent']),
                                      path_points[-1], pulse_size)

            # Draw UI elements with better styling
            # Create background panel for UI elements with more height to accommodate new metadata
            ui_bg = pygame.Surface((screen_width, 160))
            ui_bg.fill(pygame.Color('#f8f9fa'))
            ui_bg.set_alpha(230)
            screen.blit(ui_bg, (0, 0))

            # Current experiment info if multiple experiments loaded
            if len(self.experiments) > 1:
                current_exp = self.experiments[self.current_experiment_index]
                exp_params = current_exp["params"]
                exp_data = current_exp["data"]
                initial_epsilon = exp_data["agent"].get("initial_epsilon", exp_params["epsilon"])

                # Get data storage info
                data_storage = exp_data.get("data_storage", {})
                total_episodes = data_storage.get("total_episodes", len(exp_data.get("total_reward_history", [])))
                detailed_episodes = data_storage.get("detailed_episodes_stored", len(exp_data.get("episodes", [])))
                store_every = data_storage.get("store_episode_details_every", 100)

                # Main experiment parameters (truncate alpha values)
                exp_text = f"Experiment {self.current_experiment_index + 1}/{len(self.experiments)}: "
                exp_label = small_font.render(exp_text, True, pygame.Color('#000000'))
                screen.blit(exp_label, (40, 30))



                y_offset = 25
            else:
                y_offset = 0

            # Episode info
            episode_text = font.render(f"Episode: {episode_index+1}/{len(self.episodes)} - Steps: {episode['step_count']} - Reward: {episode['total_reward']:.2f}",
                                      True, pygame.Color('#000000'))
            screen.blit(episode_text, (40, 30 + y_offset))

            # Step info
            if steps:
                current_step = min(step_index, len(steps)-1)
                step_text = font.render(f"Step: {current_step+1}/{len(steps)} - Speed: {speed_levels[speed_index]}",
                                      True, pygame.Color('#000000'))
                screen.blit(step_text, (40, 70 + y_offset))



            # Display current state Q-values if Q-values are shown
            if show_values and steps and step_index < len(steps):
                current_step = min(step_index, len(steps)-1)
                step_data = steps[current_step]
                current_state_in_step = step_data['state']

                if current_state_in_step in current_q_values and current_q_values[current_state_in_step]:
                    # Build Q-values text for current state
                    q_vals = current_q_values[current_state_in_step]
                    if current_state_in_step in self.adj:
                        q_text_parts = []
                        for action_idx, neighbor in enumerate(self.adj[current_state_in_step]):
                            q_val = q_vals.get(str(action_idx), 0.0)
                            q_text_parts.append(f"{neighbor}:{q_val:.2f}")

                        q_values_text = f"Q-values for {current_state_in_step}: " + ", ".join(q_text_parts)
                        q_values_label = tiny_font.render(q_values_text, True, pygame.Color('#6a4c93'))
                        screen.blit(q_values_label, (40, 130 + y_offset))

                        # Adjust y_offset for subsequent content
                        y_offset += 25

            # Additional learning progress metadata
            if len(self.experiments) > 1:
                current_exp = self.experiments[self.current_experiment_index]
                exp_data = current_exp["data"]

                # Calculate episode position in training
                actual_episode_num = episode.get('episode_num', episode_index)
                total_episodes = len(exp_data.get("total_reward_history", []))
                learning_progress = (actual_episode_num + 1) / total_episodes if total_episodes > 0 else 0

                # Get episode context
                episode_epsilon = episode.get('epsilon', exp_params.get('epsilon', 0))
                episode_alpha = episode.get('alpha', exp_params.get('alpha', 0))

                # Learning progress info
                progress_text = f"Learning Progress: ε={episode_epsilon:.3f}, α={episode_alpha:.3f}"
                progress_label = tiny_font.render(progress_text, True, pygame.Color('#0066cc'))
                screen.blit(progress_label, (40, 100 + y_offset))

                # Performance context
                if hasattr(exp_data, 'total_reward_history') or 'total_reward_history' in exp_data:
                    reward_history = exp_data.get('total_reward_history', [])
                    if reward_history and actual_episode_num < len(reward_history):
                        # Calculate recent performance around this episode
                        window_start = max(0, actual_episode_num - 50)
                        window_end = min(len(reward_history), actual_episode_num + 51)
                        recent_rewards = reward_history[window_start:window_end]
                        avg_reward = sum(recent_rewards) / len(recent_rewards) if recent_rewards else 0

                        performance_text = f"Performance Context: Avg reward (±50 episodes): {avg_reward:.2f}"
                        performance_label = tiny_font.render(performance_text, True, pygame.Color('#28a745'))
                        screen.blit(performance_label, (350, 100 + y_offset))

            # Show legend for Q-value colors with standard colormap (only when Q-values are displayed)
            if show_values:
                legend_width = 120
                legend_height = 16
                legend_x = screen_width - legend_width - 25  # Position from right edge
                legend_y = screen_height - 40

                # Draw legend background
                legend_bg = pygame.Surface((legend_width + 80, 40))
                legend_bg.fill(pygame.Color('#f8f9fa'))
                legend_bg.set_alpha(220)
                screen.blit(legend_bg, (legend_x - 10, legend_y - 10))

                # Draw legend gradient using colormap
                cmap = cm.get_cmap('RdYlGn')
                for i in range(legend_width):
                    normalized = i / legend_width
                    rgba = cmap(normalized)
                    r, g, b = int(rgba[0]*255), int(rgba[1]*255), int(rgba[2]*255)

                    # Create a surface for each line segment
                    line_surface = pygame.Surface((1, legend_height), pygame.SRCALPHA)
                    line_surface.fill((r, g, b, 220))
                    screen.blit(line_surface, (legend_x + i, legend_y))

                # Add labels
                neg_label = tiny_font.render("-10", True, pygame.Color('#000000'))
                screen.blit(neg_label, (legend_x, legend_y + legend_height + 5))

                zero_label = tiny_font.render("0", True, pygame.Color('#000000'))
                screen.blit(zero_label, (legend_x + legend_width//2, legend_y + legend_height + 5))

                pos_label = tiny_font.render("+10", True, pygame.Color('#000000'))
                screen.blit(pos_label, (legend_x + legend_width - 20, legend_y + legend_height + 5))

                legend_title = small_font.render("Q-Value Color Scale", True, pygame.Color('#000000'))
                screen.blit(legend_title, (legend_x, legend_y - 25))

            # Draw control panel background
            control_panel_bg = pygame.Surface((button_width + 16, screen_height - 120))
            control_panel_bg.fill(pygame.Color('#f8f9fa'))
            control_panel_bg.set_alpha(230)
            screen.blit(control_panel_bg, (control_panel_x - 8, control_panel_y - 8))

            # Draw all buttons
            for button in buttons:
                button.draw(screen, button_font)

            # Draw hyperparameter info at bottom if experiments loaded
            if len(self.experiments) > 1:
                current_exp = self.experiments[self.current_experiment_index]
                exp_params = current_exp["params"]
                exp_data = current_exp["data"]
                initial_epsilon = exp_data["agent"].get("initial_epsilon", exp_params["epsilon"])

                # Get data storage info
                data_storage = exp_data.get("data_storage", {})
                total_episodes = data_storage.get("total_episodes", len(exp_data.get("total_reward_history", [])))
                detailed_episodes = data_storage.get("detailed_episodes_stored", len(exp_data.get("episodes", [])))
                store_every = data_storage.get("store_episode_details_every", 100)

                # Hyperparameters at bottom
                exp_metadata_text = f"ε_start={initial_epsilon:.4f}, ε_decay={exp_params['epsilon_decay']:.4f}, ε_final={exp_params['epsilon']:.4f}, " + \
                    f"α_start={exp_params['initial_alpha']:.4f}, α_final={exp_params['alpha']:.4f}, α_decay={exp_params['alpha_decay_rate']:.4f}, " + \
                    f"γ={exp_params['gamma']}, cost={exp_params['step_cost']}, stoch={exp_params['stochasticity']}, Q_init={exp_params['optimistic_init']}"
                exp_metadata_label = tiny_font.render(exp_metadata_text, True, pygame.Color('#666666'))
                screen.blit(exp_metadata_label, (40, screen_height - 40))

                # Data storage info at very bottom
                data_info_text = f"Total training: {total_episodes:,} episodes | Every {store_every}th episode stored | {detailed_episodes} episodes stored"
                if hasattr(current_exp, "stochasticity_level") and current_exp.get("stochasticity_level"):
                    data_info_text += f", Stoch Level: {current_exp['stochasticity_level']}"

                data_info_label = tiny_font.render(data_info_text, True, pygame.Color('#666666'))
                screen.blit(data_info_label, (40, screen_height - 20))

            # Update display
            pygame.display.flip()

            # Handle animation
            if playing and steps:
                frame_counter += 1
                if frame_counter >= speed:
                    frame_counter = 0
                    step_index += 1
                    if step_index > len(steps):
                        step_index = 0
                        visible_episode_index = (visible_episode_index + 1) % len(visible_episodes)
                        episode_index = visible_to_actual(visible_episode_index)

            clock.tick(60)

        pygame.quit()

    def human_play(self, override_graph_type=None):
        """Launch an interactive mode where the human can play by selecting actions"""
        pygame.init()
        screen_width, screen_height = 1000, 750
        screen = pygame.display.set_mode((screen_width, screen_height))
        pygame.display.set_caption("MDP Room Explorer - Human Play Mode")

        # Determine which graph to use
        if override_graph_type:
            # Use specified graph type directly
            adj, terminal_rewards, room_coords = get_graph(override_graph_type)
            self.room_coords = room_coords
            step_cost = -1.0  # Default step cost for human play
            stochasticity = 0  # Default stochasticity for human play
        else:
            # Load environment from the data (existing behavior)
            adj = self.data['environment']['adjacency']
            terminal_rewards = self.data['environment']['terminal_rewards']
            step_cost = self.data['environment']['step_cost']
            stochasticity = self.data['environment'].get('stochasticity', 1)

        gamma = 0.95       # Fixed gamma as requested

        # Set up environment
        from q_learning import RoomEnvironment
        env = RoomEnvironment(adj, terminal_rewards, step_cost=step_cost, stochasticity=stochasticity)

        # Initialize game state
        current_state = env.reset()
        total_reward = 0
        episode_reward = 0
        game_over = False
        path = [current_state]

        # Q-learning variables
        q_values = defaultdict(lambda: defaultdict(float))
        action_history = []
        alpha = 0.1  # Learning rate

        # Last action info
        last_action = None
        last_intended = None
        last_actual = None
        last_reward = None

        # Episode counter
        episode_count = 1

        # Episode reward tracker
        episode_rewards = []
        episode_recorded = False  # Flag to prevent duplicate recording

        # Track explored states (fog of war)
        explored_states = set([current_state])  # Start with current state explored

        # Button class (reuse from interactive_visualization)
        class Button:
            def __init__(self, x, y, width, height, text, color='#4a6fa5', hover_color='#6f8dbd', text_color='#ffffff', icon=None):
                self.rect = pygame.Rect(x, y, width, height)
                self.text = text
                self.color = pygame.Color(color)
                self.hover_color = pygame.Color(hover_color)
                self.text_color = pygame.Color(text_color)
                self.hovered = False
                self.active = False
                self.icon = icon
                self.disabled = False

            def draw(self, surface, font):
                # Determine color based on state
                if self.disabled:
                    color = pygame.Color('#aaaaaa')
                elif self.hovered:
                    color = self.hover_color
                else:
                    color = self.color

                if self.active:
                    # Use a different color for active toggle buttons
                    color = pygame.Color('#28a745')

                # Draw button with shadow
                shadow_rect = pygame.Rect(self.rect.x + 2, self.rect.y + 2, self.rect.width, self.rect.height)
                try:
                    pygame.draw.rect(surface, pygame.Color('#00000033'), shadow_rect, border_radius=10)
                    pygame.draw.rect(surface, color, self.rect, border_radius=10)
                    # Add highlight for 3D effect
                    highlight_rect = pygame.Rect(self.rect.x, self.rect.y, self.rect.width, 2)
                    pygame.draw.rect(surface, pygame.Color('#ffffff55'), highlight_rect, border_radius=10)
                except:
                    # Fallback for older pygame versions
                    pygame.draw.rect(surface, pygame.Color('#00000033'), shadow_rect)
                    pygame.draw.rect(surface, color, self.rect)

                # Draw text
                text_surf = font.render(self.text, True, self.text_color)
                text_rect = text_surf.get_rect(center=self.rect.center)
                surface.blit(text_surf, text_rect)

            def update(self, mouse_pos):
                # Check if mouse is over button
                self.hovered = self.rect.collidepoint(mouse_pos) and not self.disabled

            def check_click(self, mouse_pos, mouse_click):
                # Check if button was clicked
                if self.rect.collidepoint(mouse_pos) and mouse_click and not self.disabled:
                    return True
                return False

            def set_disabled(self, disabled):
                self.disabled = disabled

        # UI settings
        clock = pygame.time.Clock()
        running = True
        mouse_click = False

        # Set up visualization parameters
        padding = 80
        padding_top = 190  # Adjusted to give grid breathing room from top and bottom
        # Calculate bounds dynamically from room coordinates
        x_coords = [coord[0] for coord in self.room_coords.values()]
        y_coords = [coord[1] for coord in self.room_coords.values()]
        min_x, max_x = min(x_coords), max(x_coords)
        min_y, max_y = min(y_coords), max(y_coords)

        scale_x = (screen_width - 2 * padding) / (max_x - min_x)
        scale_y = (screen_height - padding - padding_top) / (max_y - min_y)
        scale = min(scale_x, scale_y)

        # Limit maximum scale for large mazes and ensure minimum scale
        max_scale = 40.0  # Maximum scale to prevent overly large rooms
        min_scale = 15.0  # Minimum scale to ensure readability
        scale = max(min_scale, min(scale, max_scale))

        # Scale room size based on scale factor
        room_size = int(max(20, min(80, scale * 0.8)))  # Adaptive room size

        # Create heatmap colormap for Q-values
        def get_q_color(q_value, min_val=-10, max_val=10):
            """
            Use a standard divergent colormap from matplotlib:
            - Blue for negative values
            - White for neutral values (near zero)
            - Red for positive values
            """
            # Normalize value between 0 and 1
            normalized = (max(min(q_value, max_val), min_val) - min_val) / (max_val - min_val)

            try:
                # Use new matplotlib API
                cmap = plt.get_cmap('RdYlGn')
            except AttributeError:
                # Fallback for older matplotlib versions
                cmap = cm.get_cmap('RdYlGn')
            rgba = cmap(normalized)

            # Convert to pygame color with transparency
            return (int(rgba[0]*255), int(rgba[1]*255), int(rgba[2]*255), 210)

        # Function to convert room coordinates to screen coordinates
        def room_to_screen(x, y):
            screen_x = padding + (x - min_x) * scale
            # Flip y-axis since pygame origin is at top left
            screen_y = screen_height - padding - (y - min_y) * scale
            return (int(screen_x), int(screen_y))

        # Pre-calculate room positions
        room_positions = {
            room: room_to_screen(x, y) for room, (x, y) in self.room_coords.items()
        }

        # Room size for display
        room_size = int(ROOM_SIZE * scale * 1.2)

        # Create fonts - make room labels smaller for large graphs, but keep UI fonts normal
        num_states = len(self.room_coords)
        if num_states > 30:  # Large graph like complex_maze
            room_font_size = 8  # Small font for room labels only
        else:  # Small/medium graphs
            room_font_size = 26  # Normal size for room labels

        # UI fonts adjusted for smaller screen
        ui_font_size = 22
        ui_small_font_size = 16
        ui_tiny_font_size = 14
        button_font_size = 16

        try:
            room_font = pygame.font.SysFont("Arial", room_font_size)  # For room labels
            font = pygame.font.SysFont("Arial", ui_font_size)  # For main UI text
            small_font = pygame.font.SysFont("Arial", ui_small_font_size)  # For secondary UI text
            tiny_font = pygame.font.SysFont("Arial", ui_tiny_font_size)  # For Q-values
            button_font = pygame.font.SysFont("Arial", button_font_size, bold=True)
        except:
            # Fallback to default fonts
            room_font = pygame.font.SysFont(None, room_font_size)
            font = pygame.font.SysFont(None, ui_font_size)
            small_font = pygame.font.SysFont(None, ui_small_font_size)
            tiny_font = pygame.font.SysFont(None, ui_tiny_font_size)
            button_font = pygame.font.SysFont(None, button_font_size)

        # Reset button (moved to same height as movement buttons, with green color)
        reset_button = Button(40, screen_height - 60, 150, 30, "New Episode", color='#28a745', hover_color='#218838')

        # Stochasticity control button (moved to same height as movement buttons, with grey color)
        stochasticity_labels = ["Deterministic", "Moderate", "High"]
        stochasticity_button = Button(200, screen_height - 60, 180, 30, f"Stoch: {stochasticity_labels[stochasticity]}", color='#6c757d', hover_color='#5a6268')

        # Create action buttons
        action_buttons = []
        action_key_mapping = {}  # Maps keys to actions

        # Function to get available actions from current state
        def get_available_actions():
            if current_state in terminal_rewards:
                return []
            return list(range(len(adj[current_state])))

        # Function to calculate direction and assign keys
        def get_direction_key(from_room, to_room):
            """Calculate the most intuitive key for moving from one room to another"""
            from_pos = self.room_coords[from_room]
            to_pos = self.room_coords[to_room]

            dx = to_pos[0] - from_pos[0]
            dy = to_pos[1] - from_pos[1]

            # Determine primary direction
            if abs(dx) > abs(dy):
                # Horizontal movement is primary
                if dx > 0:
                    return pygame.K_RIGHT, "→"
                else:
                    return pygame.K_LEFT, "←"
            else:
                # Vertical movement is primary
                if dy > 0:
                    return pygame.K_UP, "↑"
                else:
                    return pygame.K_DOWN, "↓"

        # Function to update Q-values (Q-learning algorithm)
        def update_q_value(state, action, reward, next_state):
            # Find max Q-value for next state
            if next_state in adj:  # Check if next_state has actions
                next_actions = list(range(len(adj[next_state])))
                max_next_q = 0
                if next_actions:
                    max_next_q = max([q_values[next_state][a] for a in next_actions])
            else:
                max_next_q = 0  # Terminal state

            # Update Q-value using Q-learning formula
            q_values[state][action] += alpha * (
                reward + gamma * max_next_q - q_values[state][action]
            )

        def update_action_buttons():
            """Update action buttons based on current state"""
            action_buttons.clear()
            action_key_mapping.clear()
            actions = get_available_actions()

            if not actions:
                return

            # Calculate key assignments
            used_keys = set()
            key_assignments = {}
            fallback_keys = [pygame.K_q, pygame.K_w, pygame.K_e, pygame.K_r, pygame.K_a, pygame.K_s, pygame.K_d, pygame.K_f]
            fallback_labels = ['Q', 'W', 'E', 'R', 'A', 'S', 'D', 'F']
            fallback_index = 0

            # First pass: assign intuitive arrow keys
            for action in actions:
                target_room = adj[current_state][action]
                key, label = get_direction_key(current_state, target_room)

                if key not in used_keys:
                    key_assignments[action] = (key, label)
                    used_keys.add(key)
                    action_key_mapping[key] = action

            # Second pass: assign fallback keys for remaining actions
            for action in actions:
                if action not in key_assignments:
                    if fallback_index < len(fallback_keys):
                        key = fallback_keys[fallback_index]
                        label = fallback_labels[fallback_index]
                        key_assignments[action] = (key, label)
                        action_key_mapping[key] = action
                        fallback_index += 1

            # Create buttons with key labels - positioned at bottom right
            button_y = screen_height - 60  # Higher up to avoid parameters text
            button_width = 120
            button_height = 30
            button_margin = 8

            # Calculate starting x position to align buttons to the right
            total_width = len(actions) * (button_width + button_margin) - button_margin
            start_x = screen_width - total_width - 20  # 20px margin from right edge

            for i, action in enumerate(actions):
                button_x = start_x + i * (button_width + button_margin)
                target_room = adj[current_state][action]

                # Show Q-value in button if available
                q_val = q_values[current_state][action]

                # Get key assignment
                key, key_label = key_assignments.get(action, (None, ""))

                button_text = f"{key_label} Go to {target_room}"

                action_buttons.append((Button(button_x, button_y, button_width, button_height, button_text), action))

        # Initial action buttons
        update_action_buttons()

        # Main game loop
        while running:
            # Handle events
            mouse_pos = pygame.mouse.get_pos()
            mouse_click = False

            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    running = False
                elif event.type == pygame.MOUSEBUTTONDOWN:
                    if event.button == 1:  # Left mouse button
                        mouse_click = True
                elif event.type == pygame.KEYDOWN:
                    # Handle arrow key and other key presses for action selection
                    if event.key in action_key_mapping and not game_over:
                        # Simulate the action selection
                        action = action_key_mapping[event.key]

                        # Record selected action
                        last_action = action
                        last_intended = adj[current_state][action]

                        # Take the action
                        old_state = current_state
                        next_state, reward, done, _ = env.step(action)

                        # Record actual outcome and reward
                        last_actual = next_state
                        last_reward = reward

                        # Update explored states (fog of war)
                        explored_states.add(next_state)

                        # Update Q-values
                        update_q_value(current_state, action, reward, next_state)

                        # Update game state
                        current_state = next_state
                        episode_reward += reward
                        total_reward += reward
                        path.append(current_state)
                        game_over = done

                        # Store action history
                        action_history.append({
                            "state": old_state,
                            "action": action,
                            "intended": last_intended,
                            "actual": next_state,
                            "reward": reward
                        })

                        # If game is over (reached terminal state), record the episode reward
                        if game_over and not episode_recorded:
                            episode_rewards.append((episode_count, episode_reward))
                            episode_recorded = True

                        # Update action buttons for new state
                        update_action_buttons()
                    elif event.key == pygame.K_n or event.key == pygame.K_RETURN:  # 'N' or Enter for new episode
                        # Simulate reset button click
                        if episode_reward != 0 and not episode_recorded:
                            episode_rewards.append((episode_count, episode_reward))

                        current_state = env.reset()
                        episode_reward = 0
                        game_over = False
                        path = [current_state]
                        episode_count += 1
                        episode_recorded = False
                        last_action = None
                        last_intended = None
                        last_actual = None
                        last_reward = None
                        update_action_buttons()

            # Update button states
            reset_button.update(mouse_pos)
            stochasticity_button.update(mouse_pos)
            for button, _ in action_buttons:
                button.update(mouse_pos)

            # Process button clicks
            if mouse_click:
                # Check reset button - start new episode
                if reset_button.check_click(mouse_pos, mouse_click):
                    # Only store episode reward if it hasn't been recorded yet and is non-zero
                    if episode_reward != 0 and not episode_recorded:
                        episode_rewards.append((episode_count, episode_reward))

                    current_state = env.reset()
                    episode_reward = 0
                    game_over = False
                    path = [current_state]
                    episode_count += 1
                    episode_recorded = False  # Reset the flag for the new episode
                    last_action = None
                    last_intended = None
                    last_actual = None
                    last_reward = None
                    update_action_buttons()

                # Check stochasticity button
                if stochasticity_button.check_click(mouse_pos, mouse_click):
                    stochasticity = (stochasticity + 1) % len(stochasticity_labels)
                    stochasticity_button.text = f"Stoch: {stochasticity_labels[stochasticity]}"

                    # Recreate environment with new stochasticity
                    env = RoomEnvironment(adj, terminal_rewards, step_cost=step_cost, stochasticity=stochasticity)

                    # Reset the current episode
                    current_state = env.reset()
                    episode_reward = 0
                    game_over = False
                    path = [current_state]
                    last_action = None
                    last_intended = None
                    last_actual = None
                    last_reward = None
                    update_action_buttons()

                # Check action buttons
                for button, action in action_buttons:
                    if button.check_click(mouse_pos, mouse_click):
                        # Record selected action
                        last_action = action
                        last_intended = adj[current_state][action]

                        # Take the action
                        old_state = current_state
                        next_state, reward, done, _ = env.step(action)

                        # Record actual outcome and reward
                        last_actual = next_state
                        last_reward = reward

                        # Update explored states (fog of war)
                        explored_states.add(next_state)

                        # Update Q-values
                        update_q_value(current_state, action, reward, next_state)

                        # Update game state
                        current_state = next_state
                        episode_reward += reward
                        total_reward += reward
                        path.append(current_state)
                        game_over = done

                        # Store action history
                        action_history.append({
                            "state": old_state,
                            "action": action,
                            "intended": last_intended,
                            "actual": next_state,
                            "reward": reward
                        })

                        # If game is over (reached terminal state), record the episode reward
                        if game_over and not episode_recorded:
                            episode_rewards.append((episode_count, episode_reward))
                            episode_recorded = True

                        # Update action buttons for new state
                        update_action_buttons()
                        break

            # Draw the game
            screen.fill(pygame.Color(COLORS['background']))

            # Draw connections between rooms
            for room, neighbors in adj.items():
                # Only draw connections where both rooms are explored
                if room in explored_states:
                    pos1 = room_positions[room]
                    for neighbor in neighbors:
                        # Only draw connection if neighbor is also explored
                        if neighbor in explored_states:
                            pos2 = room_positions[neighbor]
                            pygame.draw.line(screen, pygame.Color(COLORS['wall']), pos1, pos2, 1)

            # Draw rooms
            for room, pos in room_positions.items():
                # For fog of war: only draw rooms that have been explored or are neighbors of explored rooms
                is_explored = room in explored_states
                is_neighbor = False

                # Check if room is a neighbor of any explored state
                for explored in explored_states:
                    if explored in adj and room in adj[explored]:
                        is_neighbor = True
                        break

                # Skip if room is not explored and not a neighbor
                if not is_explored and not is_neighbor:
                    continue

                # Choose room color based on terminal state, current position, and exploration
                if current_state and room == current_state:
                    # If current state is a terminal state, use terminal color; otherwise use yellow highlight
                    if room in terminal_rewards:
                        if terminal_rewards[room] > 0:
                            color = pygame.Color(COLORS['goal'])  # Green for positive terminal
                        else:
                            color = pygame.Color(COLORS['pit'])   # Red for negative terminal
                    else:
                        color = pygame.Color('#ffcc00')  # Yellow highlight for non-terminal current room
                elif room in terminal_rewards and is_explored:
                    # Only show terminal state colors for explored rooms
                    if terminal_rewards[room] > 0:
                        color = pygame.Color(COLORS['goal'])  # Goal room
                    else:
                        color = pygame.Color(COLORS['pit'])   # Pit room
                else:
                    color = pygame.Color(COLORS['room'])  # Regular room (neutral for unexplored)

                # If room is a neighbor but not explored, show it as foggy
                if current_state and room in self.adj and current_state in self.adj[room]:
                    # Use a darker, more transparent color for unexplored neighbors
                    color.a = 80  # Make it more transparent
                    border_color = pygame.Color('#aaaaaa')  # Lighter border for unexplored
                    label_color = pygame.Color('#999999')  # Lighter text for unexplored
                else:
                    border_color = pygame.Color(COLORS['wall'])
                    label_color = pygame.Color(COLORS['text'])

                # Draw room
                try:
                    pygame.draw.rect(screen, color,
                                   (pos[0] - room_size//2, pos[1] - room_size//2,
                                    room_size, room_size),
                                   border_radius=room_size//5)

                    pygame.draw.rect(screen, border_color,
                                   (pos[0] - room_size//2, pos[1] - room_size//2,
                                    room_size, room_size),
                                   width=2, border_radius=room_size//5)
                except:
                    # Fallback for older pygame versions
                    pygame.draw.rect(screen, color,
                                   (pos[0] - room_size//2, pos[1] - room_size//2,
                                    room_size, room_size))

                    pygame.draw.rect(screen, border_color,
                                   (pos[0] - room_size//2, pos[1] - room_size//2,
                                    room_size, room_size),
                                   2)

                # Room label
                label = room
                # Only show terminal reward values for explored rooms
                if room in terminal_rewards and is_explored:
                    label += f"\n{terminal_rewards[room]}"

                text = room_font.render(label, True, label_color)
                screen.blit(text, (pos[0] - text.get_width()//2, pos[1] - text.get_height()//2))

            # Draw path taken
            if len(path) > 1:
                points = [room_positions[state] for state in path]
                for i in range(len(points) - 1):
                    pygame.draw.line(screen, pygame.Color(COLORS['agent']),
                                    points[i], points[i+1], 3)

                    # Draw direction arrows at midpoints
                    mid_x = (points[i][0] + points[i+1][0]) // 2
                    mid_y = (points[i][1] + points[i+1][1]) // 2
                    dx, dy = points[i+1][0] - points[i][0], points[i+1][1] - points[i][1]
                    length = math.sqrt(dx*dx + dy*dy)

                    if length > 0:
                        # Normalize
                        dx, dy = dx/length, dy/length

                        # Calculate arrow points
                        arrow_size = 10
                        arrow_points = [
                            (mid_x, mid_y),
                            (int(mid_x - arrow_size*dx + arrow_size*dy*0.5),
                             int(mid_y - arrow_size*dy - arrow_size*dx*0.5)),
                            (int(mid_x - arrow_size*dx - arrow_size*dy*0.5),
                             int(mid_y - arrow_size*dy + arrow_size*dx*0.5))
                        ]
                        pygame.draw.polygon(screen, pygame.Color(COLORS['agent']), arrow_points)

                # Draw current agent position with pulsing effect
                if points:
                    pulse_size = 10 + int(5 * math.sin(pygame.time.get_ticks() / 200))
                    pygame.draw.circle(screen, pygame.Color(COLORS['agent']),
                                      points[-1], pulse_size)

            # Draw game information
            info_bg = pygame.Surface((screen_width, 130))
            info_bg.fill(pygame.Color('#f8f9fa'))
            info_bg.set_alpha(230)
            screen.blit(info_bg, (0, 0))

            # Draw episode reward table
            if episode_rewards:
                # Calculate table dimensions
                table_width = 160
                table_row_height = 20
                max_rows = 12  # Show at most 12 episodes in the table
                visible_episodes = episode_rewards[-max_rows:] if len(episode_rewards) > max_rows else episode_rewards
                table_height = table_row_height * (len(visible_episodes) + 1)  # +1 for header

                # Position table in top right corner
                table_x = screen_width - table_width - 20
                table_y = 20

                # Draw table background
                table_bg = pygame.Surface((table_width, table_height))
                table_bg.fill(pygame.Color('#ffffff'))
                table_bg.set_alpha(240)
                screen.blit(table_bg, (table_x, table_y))

                # Draw table border
                pygame.draw.rect(screen, pygame.Color('#cccccc'),
                               (table_x, table_y, table_width, table_height), 1)

                # Draw table header
                header_bg = pygame.Surface((table_width, table_row_height))
                header_bg.fill(pygame.Color('#f0f0f0'))
                screen.blit(header_bg, (table_x, table_y))

                # Draw header text
                header_text = small_font.render("Episode Rewards", True, pygame.Color('#333333'))
                screen.blit(header_text, (table_x + 10, table_y + 3))

                # Draw horizontal line after header
                pygame.draw.line(screen, pygame.Color('#cccccc'),
                               (table_x, table_y + table_row_height),
                               (table_x + table_width, table_y + table_row_height), 1)

                # Draw episode rows
                for i, (ep_num, ep_reward) in enumerate(visible_episodes):
                    row_y = table_y + (i + 1) * table_row_height

                    # Alternating row colors
                    if i % 2 == 0:
                        row_bg = pygame.Surface((table_width, table_row_height))
                        row_bg.fill(pygame.Color('#f9f9f9'))
                        screen.blit(row_bg, (table_x, row_y))

                    # Draw episode number
                    ep_text = small_font.render(f"#{ep_num}", True, pygame.Color('#333333'))
                    screen.blit(ep_text, (table_x + 10, row_y + 3))

                    # Draw reward (color-coded based on positive/negative)
                    if ep_reward > 0:
                        reward_color = pygame.Color('#28a745')  # Green for positive
                    else:
                        reward_color = pygame.Color('#dc3545')  # Red for negative

                    reward_text = small_font.render(f"{ep_reward:.2f}", True, reward_color)
                    # Right-align the reward value
                    reward_x = table_x + table_width - reward_text.get_width() - 10
                    screen.blit(reward_text, (reward_x, row_y + 3))

                    # Draw horizontal line after row
                    pygame.draw.line(screen, pygame.Color('#eeeeee'),
                                   (table_x, row_y + table_row_height),
                                   (table_x + table_width, row_y + table_row_height), 1)

            # Game status
            if game_over:
                if current_state in terminal_rewards and terminal_rewards[current_state] > 0:
                    status = f"Episode {episode_count} - You reached the goal!"
                    status_color = pygame.Color('#28a745')  # Green
                else:
                    status = f"Episode {episode_count} - You fell in a pit!"
                    status_color = pygame.Color('#dc3545')  # Red
            else:
                status = f"Episode {episode_count} - Select Your Action"
                status_color = pygame.Color(COLORS['text'])

            status_text = font.render(status, True, status_color)
            screen.blit(status_text, (40, 10))

            # Calculate metadata values
            steps_taken = len(path) - 1  # -1 because path includes starting position
            exploration_percent = (len(explored_states) / len(adj)) * 100
            best_reward = max([reward for _, reward in episode_rewards]) if episode_rewards else 0.0

            # Best Reward at top center in pill-shaped box
            best_color = pygame.Color('#28a745') if best_reward > 0 else pygame.Color('#dc3545') if best_reward < 0 else pygame.Color(COLORS['text'])
            best_reward_text = font.render(f"Best Reward: {best_reward:.2f}", True, best_color)

            # Create pill-shaped box
            text_width = best_reward_text.get_width()
            text_height = best_reward_text.get_height()
            box_padding = 6
            box_width = text_width + box_padding * 2
            box_height = text_height + box_padding
            center_x = screen_width // 2 - box_width // 2
            box_y = 6

            # Draw pill-shaped background with outline
            try:
                # Main background
                pygame.draw.rect(screen, pygame.Color('#f8f9fa'),
                               (center_x, box_y, box_width, box_height),
                               border_radius=box_height//2)
                # Black outline
                pygame.draw.rect(screen, pygame.Color('#000000'),
                               (center_x, box_y, box_width, box_height),
                               width=2, border_radius=box_height//2)
            except:
                # Fallback for older pygame versions
                pygame.draw.rect(screen, pygame.Color('#f8f9fa'),
                               (center_x, box_y, box_width, box_height))
                pygame.draw.rect(screen, pygame.Color('#000000'),
                               (center_x, box_y, box_width, box_height), 2)

            # Draw text centered in the box
            text_x = center_x + box_padding
            text_y = box_y + box_padding // 2
            screen.blit(best_reward_text, (text_x, text_y))

            # FIRST COLUMN: Basic game state
            state_info = small_font.render(f"Current Room: {current_state}", True, pygame.Color(COLORS['text']))
            screen.blit(state_info, (40, 40))

            steps_text = small_font.render(f"Steps This Episode: {steps_taken}", True, pygame.Color(COLORS['text']))
            screen.blit(steps_text, (40, 70))

            exploration_text = small_font.render(f"States Explored: {len(explored_states)}/{len(adj)} ({exploration_percent:.1f}%)", True, pygame.Color(COLORS['text']))
            screen.blit(exploration_text, (40, 100))

            # SECOND COLUMN: Last action details
            if last_action is not None:
                action_color = pygame.Color('#0066cc')  # Blue
                if last_intended != last_actual:
                    action_color = pygame.Color('#ff9900')  # Orange for stochastic outcome

                action_text = small_font.render(f"Last Action: {last_action}", True, action_color)
                screen.blit(action_text, (320, 40))

                intended_text = small_font.render(f"  Intended: {last_intended}", True, action_color)
                screen.blit(intended_text, (320, 70))

                actual_text = small_font.render(f"  Actual: {last_actual}", True, action_color)
                screen.blit(actual_text, (320, 100))

            # THIRD COLUMN: Reward information
            # Current reward (last action reward)
            current_reward_color = pygame.Color(COLORS['text'])
            if last_reward is not None:
                if last_reward > 0:
                    current_reward_color = pygame.Color('#28a745')  # Green for positive
                elif last_reward < 0:
                    current_reward_color = pygame.Color('#dc3545')  # Red for negative
                current_reward_text = small_font.render(f"Current Reward: {last_reward:.2f}", True, current_reward_color)
            else:
                current_reward_text = small_font.render("Current Reward: N/A", True, current_reward_color)
            screen.blit(current_reward_text, (620, 40))

            # Episode reward
            episode_reward_color = pygame.Color('#28a745') if episode_reward > 0 else pygame.Color('#dc3545') if episode_reward < 0 else pygame.Color(COLORS['text'])
            episode_reward_text = small_font.render(f"Episode Reward: {episode_reward:.2f}", True, episode_reward_color)
            screen.blit(episode_reward_text, (620, 70))

            # Total reward
            total_reward_text = small_font.render(f"Total Reward: {total_reward:.2f}", True, pygame.Color(COLORS['text']))
            screen.blit(total_reward_text, (620, 100))

            # Game parameters (combined into one line) - moved to very bottom
            stoch_probs = {0: "1.0", 1: "0.8", 2: "0.5"}[stochasticity]
            params_text = tiny_font.render(
                f"Parameters: γ={gamma}, step_cost={step_cost}, Prob(intended move): {stoch_probs} (stoch = {stochasticity})",
                True, pygame.Color('#666666'))
            screen.blit(params_text, (40, screen_height - 25))  # 15px from bottom

            # Draw action buttons if not game over (or allow reset)
            if not game_over:
                for button, _ in action_buttons:
                    button.draw(screen, button_font)

            # Draw reset button - always available
            reset_button.draw(screen, button_font)

            # Draw stochasticity control button
            stochasticity_button.draw(screen, button_font)

            # Update display
            pygame.display.flip()
            clock.tick(60)

        pygame.quit()

# Command line interface
def main():
    parser = argparse.ArgumentParser(description='Visualize MDP room exploration')
    parser.add_argument('--data-path', type=str, default='q_learning_data',
                        help='Path to the exploration data file or directory')
    parser.add_argument('--static-step', type=int,
                        help='Generate static visualizations every N episodes')
    parser.add_argument('--experiments', action='store_true',
                        help='Load experiments from q_learning_experiments directory')
    parser.add_argument('--experiments-graph', type=str, choices=AVAILABLE_GRAPHS,
                        help=f'Load experiments for specific graph type only. Choices: {AVAILABLE_GRAPHS}')
    parser.add_argument('--episode-skip', type=int, default=1,
                        help='Only show every Nth episode in the visualization (default: 1, showing all episodes)')
    parser.add_argument('--human-play', action='store_true',
                        help='Play the game manually by selecting actions')
    parser.add_argument('--graph-type', type=str, default='custom_rooms', choices=AVAILABLE_GRAPHS,
                        help=f'Graph type to use (default: custom_rooms). Choices: {AVAILABLE_GRAPHS}')
    args = parser.parse_args()

    # Handle human play mode early to avoid unnecessary data loading
    if args.human_play:
        # Create a minimal visualizer just for human play
        visualizer = MDPVisualizer.__new__(MDPVisualizer)  # Create without calling __init__
        visualizer.graph_type = args.graph_type
        visualizer.adj_template, visualizer.terminal_rewards_template, visualizer.room_coords = get_graph(args.graph_type)

        # Set required attributes for human_play to work
        visualizer.adj = visualizer.adj_template
        visualizer.terminal_rewards = visualizer.terminal_rewards_template
        visualizer.experiments = []
        visualizer.episode_skip = args.episode_skip
        visualizer.current_experiment_index = 0
        visualizer.q_values = {}
        visualizer.policy = {}
        visualizer.episodes = []
        visualizer.data = None

        visualizer.human_play(override_graph_type=args.graph_type)
        return

    # If experiments flag is set, use the experiments directory
    if args.experiments:
        data_path = 'q_learning_experiments'
    else:
        data_path = args.data_path

    # Create visualizer with graph-specific experiment filtering if specified
    experiments_graph_filter = args.experiments_graph if args.experiments else None
    visualizer = MDPVisualizer(data_path, episode_skip=args.episode_skip,
                              graph_type=args.graph_type,
                              experiments_graph_filter=experiments_graph_filter)

    # Check if any experiments were loaded
    if args.experiments and len(visualizer.experiments) == 0:
        print(f"\nError: No experiments found!")
        if args.experiments_graph:
            print(f"No experiments found for graph type '{args.experiments_graph}'.")
            print(f"To generate experiments for {args.experiments_graph}, run:")
            print(f"  python q_learning.py --run-experiments --graph-type {args.experiments_graph}")
        else:
            print("No experiments found in q_learning_experiments directory.")
            print("To generate experiments, run:")
            print("  python q_learning.py --run-experiments --graph-type custom_rooms")
            print("  python q_learning.py --run-experiments --graph-type simple_grid")
            print("  python q_learning.py --run-experiments --graph-type complex_maze")

        print(f"\nAlternatively, try:")
        print(f"  python interactive_visualizer.py --human-play --graph-type {args.graph_type}")
        print(f"  python q_learning.py --graph-type {args.graph_type} -n 100")
        return

    if args.static_step:
        if len(visualizer.experiments) == 0:
            print("Error: No experiments loaded for static visualization.")
            return
        visualizer.create_static_visualization(args.static_step)
    else:
        if len(visualizer.experiments) == 0:
            print("Error: No experiments loaded for interactive visualization.")
            return
        visualizer.interactive_visualization()

if __name__ == "__main__":
    main()
