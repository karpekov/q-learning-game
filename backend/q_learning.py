#!/usr/bin/env python3
"""
q_learning.py
Q-Learning implementation for MDP room exploration

usage:  python q_learning.py                   # uses defaults
        python q_learning.py -e 0.1 -a 0.1 -g 0.9 -n 1000  # custom parameters
        python q_learning.py --run-experiments  # run multiple parameter configurations
"""

import sys
import argparse
import random
import math
import json
import os
import datetime
import matplotlib.pyplot as plt
import matplotlib.patches as patches
import numpy as np
from collections import defaultdict
from tqdm import tqdm
from graph_definitions import get_graph, list_available_graphs, AVAILABLE_GRAPHS

# Helper functions
# create_room_graph() and ROOM_COORDS moved to graph_definitions.py

def build_transition_model(adj, terminal_rewards, stochasticity=1):
    """Build transition model with configurable stochasticity levels

    Args:
        stochasticity:
            0 = deterministic (1.0 intended)
            1 = moderate stochastic (4/6 intended, 1/6 left, 1/6 right)
            2 = high stochastic (2/6 intended, 2/6 left, 2/6 right)
    """
    model = defaultdict(dict)

    # Define stochasticity levels
    if stochasticity == 0:
        # Deterministic: always go intended direction
        probs = (1.0, 0.0, 0.0)
    elif stochasticity == 1:
        # Moderate: 0.8 intended, 0.1 left, 0.1 right
        probs = (0.8, 0.1, 0.1)
    elif stochasticity == 2:
        # High: 0.5 intended, 0.25 left, 0.25 right
        probs = (0.5, 0.25, 0.25)
    else:
        raise ValueError(f"Invalid stochasticity level: {stochasticity}. Must be 0, 1, or 2.")

    for s, nbrs in adj.items():
        if s in terminal_rewards:
            continue
        n = len(nbrs)
        for i, nxt in enumerate(nbrs):
            left = nbrs[(i - 1) % n]
            right = nbrs[(i + 1) % n]
            model[s][i] = [(probs[0], nxt), (probs[1], left), (probs[2], right)]
    return model

class RoomEnvironment:
    def __init__(self, adj, terminal_rewards, step_cost=-0.05, stochasticity=1):
        self.adj = adj
        self.terminal_rewards = terminal_rewards
        self.stochasticity = stochasticity
        self.transition_model = build_transition_model(adj, terminal_rewards, stochasticity)
        self.step_cost = step_cost
        self.reset()

    def reset(self):
        # Start at state S
        self.current_state = "S"
        return self.current_state

    def get_available_actions(self, state):
        if state in self.terminal_rewards:
            return []
        return list(range(len(self.adj[state])))

    def step(self, action):
        if self.current_state in self.terminal_rewards:
            return self.current_state, 0, True, {}

        # Sample from transition distribution
        transitions = self.transition_model[self.current_state][action]
        probs = [p for p, _ in transitions]
        next_states = [s for _, s in transitions]
        next_state = random.choices(next_states, weights=probs)[0]

        # Calculate reward
        reward = self.step_cost + self.terminal_rewards.get(next_state, 0.0)

        # Update current state
        self.current_state = next_state

        # Check if terminal
        done = next_state in self.terminal_rewards

        return next_state, reward, done, {}

class QLearningAgent:
    def __init__(self, env, adj, epsilon=0.1, alpha=0.1, gamma=0.9, epsilon_decay=0.995, epsilon_min=0.01, alpha_decay_rate=0.0, optimistic_init=0.0, store_episode_details_every=100):
        self.env = env
        self.adj = adj
        self.epsilon = epsilon      # exploration rate
        self.initial_epsilon = epsilon  # store initial value for reference
        self.epsilon_decay = epsilon_decay  # decay rate per episode
        self.epsilon_min = epsilon_min      # minimum epsilon value
        self.alpha = alpha          # learning rate
        self.initial_alpha = alpha  # store initial alpha for reference
        self.alpha_decay_rate = alpha_decay_rate  # alpha decay rate
        self.gamma = gamma          # discount factor
        self.optimistic_init = optimistic_init  # optimistic initial Q-value
        self.q_values = defaultdict(lambda: defaultdict(lambda: optimistic_init))
        self.episode_history = []
        self.current_episode = []
        self.total_reward_history = []
        self.episode_length_history = []
        self.epsilon_history = []   # track epsilon values over episodes
        self.alpha_history = []     # track alpha values over episodes
        self.intermediate_rewards = []  # track 500-episode rolling average
        self.store_episode_details_every = store_episode_details_every  # control detailed storage frequency

    def get_action(self, state):
        available_actions = self.env.get_available_actions(state)
        if not available_actions:
            return None

        # Epsilon-greedy policy
        if random.random() < self.epsilon:
            # Explore: random action
            return random.choice(available_actions)
        else:
            # Exploit: best action based on Q-values
            return self.get_best_action(state, available_actions)

    def get_best_action(self, state, available_actions=None):
        if available_actions is None:
            available_actions = self.env.get_available_actions(state)

        if not available_actions:
            return None

        # Find action with highest Q-value
        best_value = float('-inf')
        best_actions = []

        for action in available_actions:
            q_value = self.q_values[state][action]
            if q_value > best_value:
                best_value = q_value
                best_actions = [action]
            elif q_value == best_value:
                best_actions.append(action)

        # Break ties randomly
        return random.choice(best_actions)

    def update(self, state, action, reward, next_state):
        # Q-learning update
        best_next_value = 0
        next_actions = self.env.get_available_actions(next_state)
        if next_actions:
            best_next_action = self.get_best_action(next_state, next_actions)
            best_next_value = self.q_values[next_state][best_next_action]

        # Q(s,a) ← Q(s,a) + α[r + γ·max_a'Q(s',a') - Q(s,a)]
        self.q_values[state][action] += self.alpha * (
            reward + self.gamma * best_next_value - self.q_values[state][action]
        )

    def train_episode(self, max_steps=1000, episode_num=0, total_episodes=0):
        state = self.env.reset()
        self.current_episode = []
        total_reward = 0
        step_count = 0

        # Record epsilon and alpha at the start of this episode
        episode_start_epsilon = self.epsilon
        episode_start_alpha = self.alpha

        # Determine if we should store detailed steps for this episode
        store_details = (
            episode_num < 10 or  # First 10 episodes
            episode_num % self.store_episode_details_every == 0 or  # Every Nth episode
            episode_num >= (total_episodes - 10)  # Last 10 episodes
        )

        while step_count < max_steps:
            # Select action
            action = self.get_action(state)
            if action is None:
                break

            # Take action
            next_state, reward, done, _ = self.env.step(action)
            total_reward += reward

            # Store transition for visualization only if we're storing details
            if store_details:
                intended_direction = self.adj[state][action]
                transition_data = {
                    "step": step_count,
                    "state": state,
                    "action": action,
                    "intended": intended_direction,
                    "next_state": next_state,
                    "reward": reward,
                    "q_value": self.q_values[state][action]
                }
                self.current_episode.append(transition_data)

            # Update Q-values
            self.update(state, action, reward, next_state)

            # Move to next state
            state = next_state
            step_count += 1

            if done:
                break

        # Only store detailed episode data selectively
        if store_details:
            self.episode_history.append({
                "episode_num": episode_num,
                "steps": self.current_episode,
                "total_reward": total_reward,
                "step_count": step_count,
                "epsilon": episode_start_epsilon,  # record epsilon used for this episode
                "alpha": episode_start_alpha       # record alpha used for this episode
            })

        self.total_reward_history.append(total_reward)
        self.episode_length_history.append(step_count)

        # Update epsilon for the next episode
        self.epsilon = max(self.epsilon_min, self.epsilon * self.epsilon_decay)
        self.epsilon_history.append(self.epsilon)

        # Update alpha for the next episode using decay formula
        if self.alpha_decay_rate > 0:
            # Use formula: alpha = initial_alpha / (1 + decay_rate * episode_num)
            self.alpha = self.initial_alpha / (1 + self.alpha_decay_rate * episode_num)
        self.alpha_history.append(self.alpha)

        return total_reward, step_count

    def train(self, num_episodes=5000):
        rewards = []
        rolling_averages = []  # Store the 500-episode rolling averages

        # Use tqdm for progress bar
        pbar = tqdm(range(num_episodes), desc="Training Q-Learning Agent")
        for i in pbar:
            episode_reward, steps = self.train_episode(episode_num=i, total_episodes=num_episodes)
            rewards.append(episode_reward)

            # Calculate mean reward for past 500 episodes
            if len(rewards) >= 500:
                recent_mean_reward = sum(rewards[-500:]) / 500
            else:
                recent_mean_reward = sum(rewards) / len(rewards)

            # Calculate mean episode length for past 500 episodes
            if len(self.episode_length_history) >= 500:
                recent_mean_length = sum(self.episode_length_history[-500:]) / 500
            else:
                recent_mean_length = sum(self.episode_length_history) / len(self.episode_length_history) if self.episode_length_history else 0

            rolling_averages.append(recent_mean_reward)

            # Update progress bar description with recent performance
            pbar.set_description(f"Training | Avg Reward: {recent_mean_reward:4.0f} | Avg Episode Length: {recent_mean_length:4.0f} | ε: {self.epsilon:.4f} | α: {self.alpha:.5f}")

        # Store the rolling averages for visualization
        self.intermediate_rewards = rolling_averages
        return rewards

    def get_policy(self):
        policy = {}
        for state in self.adj.keys():
            if state in self.env.terminal_rewards:
                policy[state] = "-"
                continue

            best_action = self.get_best_action(state)
            if best_action is None:
                policy[state] = "-"
            else:
                policy[state] = self.adj[state][best_action]  # Show intended direction

        return policy

    def get_visualization_data(self):
        # Prepare data for visualization
        vis_data = {
            "environment": {
                "adjacency": self.adj,
                "terminal_rewards": self.env.terminal_rewards,
                "step_cost": self.env.step_cost,
                "stochasticity": self.env.stochasticity
            },
            "agent": {
                "epsilon": self.epsilon,
                "alpha": self.alpha,
                "gamma": self.gamma,
                "initial_epsilon": self.initial_epsilon,
                "epsilon_decay": self.epsilon_decay,
                "epsilon_min": self.epsilon_min,
                "initial_alpha": self.initial_alpha,
                "alpha_decay_rate": self.alpha_decay_rate,
                "optimistic_init": self.optimistic_init
            },
            "data_storage": {
                "store_episode_details_every": self.store_episode_details_every,
                "total_episodes": len(self.total_reward_history),
                "detailed_episodes_stored": len(self.episode_history),
                "compression_ratio": f"{len(self.episode_history)}/{len(self.total_reward_history)} ({100 * len(self.episode_history) / max(1, len(self.total_reward_history)):.1f}%)"
            },
            "q_values": {s: dict(actions) for s, actions in self.q_values.items()},
            "policy": self.get_policy(),
            "episodes": self.episode_history,
            "total_reward_history": self.total_reward_history,
            "episode_length_history": self.episode_length_history,
            "epsilon_history": self.epsilon_history,
            "alpha_history": self.alpha_history,
            "intermediate_rewards": self.intermediate_rewards
        }
        return vis_data

    def save_visualization_data(self, filename="q_learning_data.json"):
        """Save data for visualization"""
        data = self.get_visualization_data()

        # If filename doesn't include directory, put it in the data directory
        if os.path.dirname(filename) == '':
            os.makedirs('q_learning_data', exist_ok=True)
            filename = os.path.join('q_learning_data', filename)
        else:
            # Create the directory for the specified path
            os.makedirs(os.path.dirname(filename), exist_ok=True)

        with open(filename, 'w') as f:
            json.dump(data, f, indent=2)

        return filename

def create_static_visualization(data_file, output_dir, room_coords=None, graph_type="custom_rooms", skip_graph_subfolder=False):
    """Create static visualization of Q-learning progress and policy"""

    # Get room coordinates if not provided
    if room_coords is None:
        _, _, room_coords = get_graph()

    # Create output directory organized by graph type (unless skip_graph_subfolder is True for experiments)
    if skip_graph_subfolder:
        graph_output_dir = output_dir
    else:
        graph_output_dir = os.path.join(output_dir, graph_type)
    os.makedirs(graph_output_dir, exist_ok=True)

    # Load data
    with open(data_file, 'r') as f:
        data = json.load(f)

    # Extract parameters for the title
    epsilon = data['agent']['epsilon']
    alpha = data['agent']['alpha']
    gamma = data['agent']['gamma']
    step_cost = data['environment']['step_cost']
    stochasticity = data['environment'].get('stochasticity', 1)  # Default to 1 for backward compatibility
    # Get epsilon decay parameters for filename
    epsilon_decay = data['agent'].get('epsilon_decay', 1.0)  # Default to no decay for backward compatibility
    epsilon_min = data['agent'].get('epsilon_min', 0.01)  # Default value
    initial_epsilon = data['agent'].get('initial_epsilon', epsilon)  # Get initial epsilon
    # Get alpha decay parameters
    alpha_decay_rate = data['agent'].get('alpha_decay_rate', 0.0)  # Default to no decay
    initial_alpha = data['agent'].get('initial_alpha', alpha)  # Get initial alpha

    # Extract policy and Q-values
    policy = data['policy']
    q_values = data['q_values']
    adj = data['environment']['adjacency']
    terminal_rewards = data['environment']['terminal_rewards']

    # Calculate dynamic bounds from room coordinates
    x_coords = [coord[0] for coord in room_coords.values()]
    y_coords = [coord[1] for coord in room_coords.values()]
    min_x, max_x = min(x_coords), max(x_coords)
    min_y, max_y = min(y_coords), max(y_coords)

    # Add padding
    padding = max(1, (max_x - min_x) * 0.1)
    x_range = max_x - min_x + 2 * padding
    y_range = max_y - min_y + 2 * padding

    # Calculate appropriate figure size based on the maze dimensions
    base_size = 10
    aspect_ratio = x_range / y_range if y_range > 0 else 1
    if aspect_ratio > 1:
        fig_width = base_size * min(2.0, aspect_ratio)
        fig_height = base_size
    else:
        fig_width = base_size
        fig_height = base_size * min(2.0, 1/aspect_ratio)

    # Scale room size and fonts based on maze size
    num_states = len(room_coords)
    if num_states > 100:  # Large maze
        room_size = 0.4
        font_size = 6
        arrow_scale = 0.25
        q_font_size = 5
    elif num_states > 50:  # Medium maze
        room_size = 0.6
        font_size = 8
        arrow_scale = 0.35
        q_font_size = 6
    else:  # Small maze
        room_size = 0.8
        font_size = 10
        arrow_scale = 0.45
        q_font_size = 8

    # Color definitions - using more attractive colors
    colors = {
        'background': '#f8f9fa',
        'room': '#f0f0f080',
        'terminal_positive': '#a8e6cf',  # Light green
        'terminal_negative': '#ffaaa7',  # Light red
        'arrow': '#000000',              # Black for better visibility
        'text': '#293241',               # Dark blue-gray
        'grid': '#e0e0e0',               # Light gray
        'best_q': '#2a9d8f',             # Teal for best Q-value
        'other_q': '#8a8a8a',            # Gray for other Q-values
        'unvisited': '#dc3545',          # Red for unvisited states
        'optimal_path': '#28a745'        # Green for optimal path
    }

    # Create a new figure with dynamic size and high DPI for clarity
    fig, ax = plt.subplots(figsize=(fig_width, fig_height), dpi=150)

    # Set a nice background color
    fig.patch.set_facecolor(colors['background'])
    ax.set_facecolor(colors['background'])

    # Remove spines
    for spine in ax.spines.values():
        spine.set_visible(False)

    # Set up axes with dynamic bounds
    ax.set_xlim(min_x - padding, max_x + padding)
    ax.set_ylim(min_y - padding, max_y + padding)
    ax.set_aspect('equal')

    # Remove ticks
    ax.set_xticks([])
    ax.set_yticks([])

    # Add a subtle grid for small/medium mazes only
    if num_states <= 50:
        ax.grid(True, linestyle='--', alpha=0.3, color=colors['grid'])

    # Draw edges between rooms (only for small mazes to avoid clutter)
    if num_states <= 30:
        for room, neighbors in adj.items():
            x1, y1 = room_coords[room]
            for neighbor in neighbors:
                x2, y2 = room_coords[neighbor]
                ax.plot([x1, x2], [y1, y2], color=colors['grid'], linewidth=1, alpha=0.6, zorder=1)

    # Track visited states (states that have Q-values)
    visited_states = set(q_values.keys())

    # Draw rooms
    for room, (x, y) in room_coords.items():
        # Choose color based on terminal state
        if room in terminal_rewards:
            if terminal_rewards[room] > 0:
                color = colors['terminal_positive']
                if num_states > 50:  # For large mazes, use shorter labels
                    label = f"{room}\n+{int(terminal_rewards[room])}"
                else:
                    label = f"{room}\n+{terminal_rewards[room]}"
            else:
                color = colors['terminal_negative']
                if num_states > 50:
                    label = f"{room}\n{int(terminal_rewards[room])}"
                else:
                    label = f"{room}\n{terminal_rewards[room]}"
        else:
            color = colors['room']
            label = room

        # Draw room
        rect = patches.Rectangle(
            (x - room_size/2, y - room_size/2),
            room_size, room_size,
            linewidth=1.5,
            edgecolor=colors['text'],
            facecolor=color,
            alpha=0.7,
            zorder=2
        )
        ax.add_patch(rect)

        # Add room label
        ax.text(
            x, y, label,
            ha='center', va='center',
            fontsize=font_size, fontweight='medium',
            color=colors['text'],
            zorder=3
        )

        # For non-terminal states, show Q-values only for small mazes
        if room in q_values and room not in terminal_rewards and num_states <= 20:
            values = q_values[room]
            if values:
                # Find max Q-value and action
                max_q_action = max(values.items(), key=lambda x: x[1])[0]

                # Calculate vertical offset for text
                y_offset = -room_size * 0.3
                line_height = room_size * 0.2

                # Show all Q-values
                for action_str, q_val in sorted(values.items(), key=lambda x: int(x[0])):
                    # Get target room for this action
                    action_idx = int(action_str)
                    if action_idx < len(adj[room]):
                        target = adj[room][action_idx]

                        # Format text with action→target: value
                        q_text = f"{action_idx}→{target}: {q_val:.2f}"

                        # Choose color based on whether this is max Q-value
                        if action_str == max_q_action:
                            text_color = colors['best_q']
                            text_weight = 'bold'
                            text_alpha = 1.0
                        else:
                            text_color = colors['other_q']
                            text_weight = 'normal'
                            text_alpha = 0.7

                        # Add the Q-value text
                        ax.text(
                            x, y + y_offset,
                            q_text,
                            ha='center', va='center',
                            fontsize=q_font_size,
                            color=text_color,
                            alpha=text_alpha,
                            fontweight=text_weight,
                            zorder=3
                        )

                        # Update offset for next line
                        y_offset -= line_height

    # Draw policy arrows and mark unvisited states
    for state in adj.keys():
        if state in terminal_rewards:
            continue  # Skip terminal states

        x1, y1 = room_coords[state]

        # Check if this state was never visited (no Q-values)
        if state not in visited_states or state not in policy or policy[state] == "-":
            # Draw red cross for unvisited state
            cross_size = room_size * 0.3
            ax.plot([x1 - cross_size, x1 + cross_size], [y1 - cross_size, y1 + cross_size],
                   color=colors['unvisited'], linewidth=3, zorder=5)
            ax.plot([x1 - cross_size, x1 + cross_size], [y1 + cross_size, y1 - cross_size],
                   color=colors['unvisited'], linewidth=3, zorder=5)
            continue

        # Draw policy arrow for visited states
        target = policy[state]
        if target != "-" and target in room_coords:
            x2, y2 = room_coords[target]

            # Calculate the direction vector
            dx, dy = x2 - x1, y2 - y1
            length = np.sqrt(dx**2 + dy**2)

            if length > 0:
                # Normalize
                dx, dy = dx / length, dy / length

                # Draw arrow (not all the way to the target)
                arrow_length = room_size * 0.8
                arrow_head_width = room_size * arrow_scale
                arrow_head_length = room_size * arrow_scale

                ax.arrow(
                    x1, y1,
                    dx * arrow_length, dy * arrow_length,
                    head_width=arrow_head_width, head_length=arrow_head_length,
                    fc=colors['arrow'], ec=colors['arrow'],
                    length_includes_head=True,
                    zorder=4,
                    alpha=1.0,
                    linewidth=3
                )

    # Extract and draw optimal path from start to goal
    def extract_optimal_path(start_state, policy, terminal_rewards, max_path_length=1000):
        """Extract the optimal path by following the policy from start to goal"""
        path = []
        current_state = start_state
        visited_in_path = set()

        for _ in range(max_path_length):
            path.append(current_state)

            # Check if we reached a terminal state
            if current_state in terminal_rewards:
                break

            # Check for cycles (policy leads back to already visited state)
            if current_state in visited_in_path:
                break

            visited_in_path.add(current_state)

            # Follow the policy
            next_state = policy.get(current_state, "-")
            if next_state == "-" or next_state not in room_coords:
                break

            current_state = next_state

        return path

    # Find start state (usually "S" but could be different)
    start_state = "S"
    if start_state not in room_coords:
        # Find any non-terminal state as start (fallback)
        for state in adj.keys():
            if state not in terminal_rewards:
                start_state = state
                break

    # Extract optimal path
    optimal_path = extract_optimal_path(start_state, policy, terminal_rewards)

    # Draw optimal path as green line if path reaches a positive terminal state
    if len(optimal_path) > 1:
        final_state = optimal_path[-1]
        if final_state in terminal_rewards and terminal_rewards[final_state] > 0:
            # Path reaches a positive reward terminal - draw it
            path_coords = [room_coords[state] for state in optimal_path if state in room_coords]

            if len(path_coords) > 1:
                # Draw path as thick green line
                x_coords = [coord[0] for coord in path_coords]
                y_coords = [coord[1] for coord in path_coords]

                ax.plot(x_coords, y_coords,
                       color=colors['optimal_path'],
                       linewidth=max(4, room_size * 0.2),  # Adaptive thickness
                       alpha=0.8,
                       zorder=6,  # Above policy arrows
                       label='Optimal Path')

                # Add directional arrows along the path for longer paths
                if len(path_coords) > 2:
                    # Add arrows at every few segments to show direction
                    arrow_interval = max(1, len(path_coords) // 5)  # ~5 arrows max
                    for i in range(0, len(path_coords) - 1, arrow_interval):
                        x1, y1 = path_coords[i]
                        x2, y2 = path_coords[i + 1]

                        dx, dy = x2 - x1, y2 - y1
                        length = np.sqrt(dx**2 + dy**2)

                        if length > 0:
                            # Normalize and create small directional arrow
                            dx, dy = dx / length, dy / length
                            arrow_size = room_size * 0.15

                            ax.arrow(x1 + dx * length * 0.7, y1 + dy * length * 0.7,
                                   dx * arrow_size, dy * arrow_size,
                                   head_width=arrow_size * 0.6,
                                   head_length=arrow_size * 0.6,
                                   fc=colors['optimal_path'],
                                   ec=colors['optimal_path'],
                                   alpha=0.9,
                                   zorder=7)

    # Add title and metadata
    title_font_size = max(10, min(16, 16 - num_states // 30))
    title = f"Optimal Policy: ε_start={initial_epsilon:.3f}, ε_decay={epsilon_decay:.5f}, ε_final={epsilon:.3f}, α_start={initial_alpha:.3f}, α_decay={alpha_decay_rate:.3f}, α_final={alpha:.3f}, γ={gamma}, step_cost={step_cost}, stochasticity={stochasticity}"
    ax.set_title(title, fontsize=title_font_size, fontweight='bold', color=colors['text'], pad=20)

    # Add metadata as text
    steps_taken = len(data['episodes'])
    last_rewards = data['total_reward_history'][-10:]
    avg_reward = sum(last_rewards) / len(last_rewards)

    # Add legend for unvisited states
    legend_text = f"Episodes: {steps_taken}  |  Avg Final Reward: {avg_reward:.2f}\n"
    legend_text += f"Red ✗ = Unvisited states  |  Black → = Policy arrows  |  Green — = Optimal path to goal"

    fig.text(0.5, 0.02, legend_text, ha='center', fontsize=10, color=colors['text'])

    # Add a subtle border
    fig.patch.set_linewidth(2)
    fig.patch.set_edgecolor(colors['grid'])

    # Save the visualization with transparent background
    output_file = os.path.join(graph_output_dir, f"policy.png")
    fig.tight_layout()
    plt.savefig(output_file, dpi=150, bbox_inches='tight', facecolor=fig.get_facecolor(), edgecolor='none')
    plt.close()

    # Also create a reward/steps history plot
    fig, ((ax1, ax3), (ax2, ax4)) = plt.subplots(2, 2, figsize=(16, 10), dpi=150)
    fig.patch.set_facecolor(colors['background'])

    # Plot reward history (top left)
    episodes = range(1, len(data['total_reward_history'])+1)

    # Calculate moving average
    window = min(50, len(data['total_reward_history']))
    if window > 0:
        reward_moving_avg = [sum(data['total_reward_history'][max(0,i-window):i])/min(i,window)
                            for i in range(1, len(data['total_reward_history'])+1)]
    else:
        reward_moving_avg = data['total_reward_history']

    ax1.plot(episodes, data['total_reward_history'], alpha=0.3, color=colors['arrow'], label='Reward')
    ax1.plot(episodes, reward_moving_avg, color=colors['arrow'], linewidth=2, label='Moving Avg')
    ax1.set_ylabel('Reward', color=colors['text'])
    ax1.set_xlabel('Episode', color=colors['text'])
    ax1.grid(True, linestyle='--', alpha=0.3)
    ax1.legend()

    # Plot episode length history (bottom left)
    if window > 0:
        steps_moving_avg = [sum(data['episode_length_history'][max(0,i-window):i])/min(i,window)
                           for i in range(1, len(data['episode_length_history'])+1)]
    else:
        steps_moving_avg = data['episode_length_history']

    ax2.plot(episodes, data['episode_length_history'], alpha=0.3, color='#ff7b00', label='Steps')
    ax2.plot(episodes, steps_moving_avg, color='#ff7b00', linewidth=2, label='Moving Avg')
    ax2.set_ylabel('Episode Length', color=colors['text'])
    ax2.set_xlabel('Episode', color=colors['text'])
    ax2.grid(True, linestyle='--', alpha=0.3)
    ax2.legend()

    # Plot epsilon decay history (top right)
    if 'epsilon_history' in data and data['epsilon_history']:
        epsilon_history = data['epsilon_history']
        ax3.plot(episodes[:len(epsilon_history)], epsilon_history, color='#28a745', linewidth=2, label='Epsilon')
        ax3.set_ylabel('Epsilon', color=colors['text'])
        ax3.set_xlabel('Episode', color=colors['text'])
        ax3.grid(True, linestyle='--', alpha=0.3)
        ax3.legend()

        # Add initial and final epsilon annotations
        if len(epsilon_history) > 0:
            initial_eps = data['agent'].get('initial_epsilon', epsilon_history[0])
            final_eps = epsilon_history[-1]
            ax3.annotate(f'Initial: {initial_eps:.3f}',
                        xy=(1, initial_eps), xytext=(len(epsilon_history)*0.1, initial_eps),
                        arrowprops=dict(arrowstyle='->', color=colors['text'], alpha=0.7),
                        fontsize=10, color=colors['text'])
            ax3.annotate(f'Final: {final_eps:.3f}',
                        xy=(len(epsilon_history), final_eps), xytext=(len(epsilon_history)*0.9, final_eps),
                        arrowprops=dict(arrowstyle='->', color=colors['text'], alpha=0.7),
                        fontsize=10, color=colors['text'])
    else:
        # If no epsilon history, show constant epsilon
        ax3.axhline(y=epsilon, color='#28a745', linewidth=2, label=f'Constant Epsilon ({epsilon})')
        ax3.set_ylabel('Epsilon', color=colors['text'])
        ax3.set_xlabel('Episode', color=colors['text'])
        ax3.grid(True, linestyle='--', alpha=0.3)
        ax3.legend()

    # Plot alpha decay history (bottom right)
    if 'alpha_history' in data and data['alpha_history']:
        alpha_history = data['alpha_history']
        ax4.plot(episodes[:len(alpha_history)], alpha_history, color='#ff6b6b', linewidth=2, label='Alpha')
        ax4.set_ylabel('Alpha', color=colors['text'])
        ax4.set_xlabel('Episode', color=colors['text'])
        ax4.grid(True, linestyle='--', alpha=0.3)
        ax4.legend()

        # Add initial and final alpha annotations
        if len(alpha_history) > 0:
            initial_alpha = data['agent'].get('initial_alpha', alpha_history[0])
            final_alpha = alpha_history[-1]
            ax4.annotate(f'Initial: {initial_alpha:.3f}',
                        xy=(1, initial_alpha), xytext=(len(alpha_history)*0.1, initial_alpha),
                        arrowprops=dict(arrowstyle='->', color=colors['text'], alpha=0.7),
                        fontsize=10, color=colors['text'])
            ax4.annotate(f'Final: {final_alpha:.3f}',
                        xy=(len(alpha_history), final_alpha), xytext=(len(alpha_history)*0.9, final_alpha),
                        arrowprops=dict(arrowstyle='->', color=colors['text'], alpha=0.7),
                        fontsize=10, color=colors['text'])
    else:
        # If no alpha history, show constant alpha
        ax4.axhline(y=alpha, color='#ff6b6b', linewidth=2, label=f'Constant Alpha ({alpha})')
        ax4.set_ylabel('Alpha', color=colors['text'])
        ax4.set_xlabel('Episode', color=colors['text'])
        ax4.grid(True, linestyle='--', alpha=0.3)
        ax4.legend()

    # Set common style
    for ax in [ax1, ax2, ax3, ax4]:
        ax.spines['top'].set_visible(False)
        ax.spines['right'].set_visible(False)
        ax.spines['bottom'].set_alpha(0.3)
        ax.spines['left'].set_alpha(0.3)
        ax.tick_params(colors=colors['text'])

    # Add figure-level title (centered over all subplots)
    fig.suptitle(f'Training Progress: ε_start={initial_epsilon:.3f}, ε_decay={epsilon_decay:.5f}, ε_final={epsilon:.3f}, α_start={initial_alpha:.3f}, α_decay={alpha_decay_rate:.3f}, α_final={alpha:.3f}, γ={gamma}, step_cost={step_cost}, stochasticity={stochasticity}',
                fontsize=12, color=colors['text'], y=0.98)

    plt.tight_layout(rect=[0, 0, 1, 0.96])  # Leave space for the suptitle
    history_file = os.path.join(graph_output_dir, f"history.png")
    plt.savefig(history_file, dpi=150, bbox_inches='tight', facecolor=fig.get_facecolor(), edgecolor='none')
    plt.close()

    return output_file, history_file

def run_experiments(graph_type="custom_rooms"):
    """Run multiple experiments with different parameter settings for a specific graph type

    Command line to run all experiments:
    >>> python q_learning.py --run-experiments --graph-type complex_maze
    """
    # Create directory structure organized by graph type
    base_dir = "q_learning_experiments"
    graph_dir = os.path.join(base_dir, graph_type)
    os.makedirs(graph_dir, exist_ok=True)

    # Base parameter combinations to try
    base_configs = [
        # No step cost, no exploration.
        {"step_cost": 0, "gamma": 0.999, "epsilon": 0.0, "epsilon_decay": 1.0, "epsilon_min": 0.0, "alpha": 0.1, "alpha_decay_rate": 0.002, "optimistic_init": 10.0},

        # Negative step cost, decaying exporation.
        {"step_cost": -1, "gamma": 0.999, "epsilon": 0.8, "epsilon_decay": 0.99995, "epsilon_min": 0.0, "alpha": 0.1, "alpha_decay_rate": 0.002, "optimistic_init": 100.0},
    ]

    # Group experiments by stochasticity level
    stochasticity_levels = [0, 1]  # deterministic and moderate stochastic
    all_results = []

    print(f"\n{'='*60}")
    print(f"RUNNING EXPERIMENTS FOR GRAPH TYPE: {graph_type.upper()}")
    print(f"{'='*60}")

    for stochasticity in stochasticity_levels:
        # Create stochasticity-specific directory
        stoch_dir = os.path.join(graph_dir, f"s_{stochasticity}")
        os.makedirs(stoch_dir, exist_ok=True)

        print(f"\n{'='*40}")
        print(f"STOCHASTICITY LEVEL: {stochasticity}")
        print(f"{'='*40}")

        results = []

        for i, base_config in enumerate(base_configs):
            print(f"\nRunning experiment {i+1}/{len(base_configs)} for {graph_type}")

            # Create config with current stochasticity level
            config = base_config.copy()
            config["stochasticity"] = stochasticity
            config["graph_type"] = graph_type

            print(f"Parameters: step_cost={config['step_cost']}, stoch={config['stochasticity']}, γ={config['gamma']}, ε={config['epsilon']}, ε_decay={config['epsilon_decay']}, ε_min={config['epsilon_min']}, α={config['alpha']}, α_decay={config['alpha_decay_rate']}, Q_init={config['optimistic_init']}")

            # Create experiment directory (without stochasticity in name since it's in parent folder)
            exp_dir = os.path.join(stoch_dir, f"exp_{i+1}_c{config['step_cost']}_s{config['stochasticity']}_g{config['gamma']}_e{config['epsilon']}_ed{config['epsilon_decay']}_em{config['epsilon_min']}_a{config['alpha']}_ad{config['alpha_decay_rate']}_qi{config['optimistic_init']}")
            os.makedirs(exp_dir, exist_ok=True)

            adj, terminal_rewards, room_coords = get_graph(graph_type)
            env = RoomEnvironment(adj, terminal_rewards, step_cost=config['step_cost'],
                                 stochasticity=config['stochasticity'])
            agent = QLearningAgent(
                env, adj,
                epsilon=config['epsilon'],
                alpha=config['alpha'],
                gamma=config['gamma'],
                epsilon_decay=config['epsilon_decay'],
                epsilon_min=config['epsilon_min'],
                alpha_decay_rate=config['alpha_decay_rate'],
                optimistic_init=config['optimistic_init'],
                store_episode_details_every=1000  # Store detailed data less frequently for experiments
            )

            # Train agent
            rewards = agent.train(num_episodes=100_000)

            # Save data
            data_file = os.path.join(exp_dir, "exploration_data.json")
            data_file = agent.save_visualization_data(data_file)

            # Create static visualization
            viz_file, history_file = create_static_visualization(data_file, exp_dir, room_coords, graph_type, skip_graph_subfolder=True)

            # Record results
            result = {
                "config": config,
                "data_file": data_file,
                "viz_file": viz_file,
                "history_file": history_file,
                "final_avg_reward": sum(rewards[-10:]) / 10,
                "stochasticity": stochasticity
            }
            results.append(result)
            all_results.append(result)

        # Print summary for this stochasticity level
        print(f"\n{'='*50}")
        print(f"SUMMARY FOR STOCHASTICITY LEVEL {stochasticity}")
        print(f"{'='*50}")
        for i, result in enumerate(results):
            config = result["config"]
            print(f"Exp {i+1:02d}: Final Avg Reward: {result['final_avg_reward']:4.1f} |" +
                  f" ε={config['epsilon']}, α={config['alpha']}, γ={config['gamma']}, step_c={config['step_cost']}, ε_decay={config['epsilon_decay']}, ε_min={config['epsilon_min']}, α_decay={config['alpha_decay_rate']}, Q_init={config['optimistic_init']}")

        print(f"\nStochasticity {stochasticity} experiments saved to: {stoch_dir}")

    # Print overall summary
    print("\n" + "="*80)
    print(f"OVERALL EXPERIMENT SUMMARY FOR {graph_type.upper()}")
    print("="*80)

    # Group results by stochasticity for comparison
    for stochasticity in stochasticity_levels:
        stoch_results = [r for r in all_results if r['stochasticity'] == stochasticity]
        print(f"\n--- STOCHASTICITY {stochasticity} ---")
        for i, result in enumerate(stoch_results):
            config = result["config"]
            print(f"Exp {i+1:02d}: Final Avg Reward: {result['final_avg_reward']:.2f} |" +
                  f" ε={config['epsilon']}, α={config['alpha']}, γ={config['gamma']}, step_c={config['step_cost']}, ε_decay={config['epsilon_decay']}, ε_min={config['epsilon_min']}, α_decay={config['alpha_decay_rate']}, Q_init={config['optimistic_init']}")

    print(f"\nAll {graph_type} experiments saved to: {graph_dir}")
    return all_results

def display_policy(agent, adj, terminal_rewards):
    """Display the policy and Q-values in a readable format"""
    policy = agent.get_policy()
    q_values = agent.q_values

    print("\nLearned policy:\n")
    print("{:<5} {:<15}   {}\n{}".format(
        "State", "Q-values", "Best action",
        "-" * 50))

    for s in sorted(adj.keys()):
        if s in terminal_rewards:
            q_str = "Terminal"
        else:
            available_actions = agent.env.get_available_actions(s)
            q_str = " ".join([f"{q_values[s][a]:.2f}" for a in available_actions])
        print(f"{s:<5} {q_str:<15}   {policy[s]}")


def main():
    parser = argparse.ArgumentParser(description='Room Exploration using Q-learning')
    parser.add_argument('-e', '--epsilon', type=float, default=0.1,
                        help='Exploration rate (default: 0.1)')
    parser.add_argument('--epsilon-decay', type=float, default=0.995,
                        help='Epsilon decay rate per episode (default: 0.995)')
    parser.add_argument('--epsilon-min', type=float, default=0.01,
                        help='Minimum epsilon value (default: 0.01)')
    parser.add_argument('-a', '--alpha', type=float, default=0.1,
                        help='Learning rate (default: 0.1)')
    parser.add_argument('--alpha-decay-rate', type=float, default=0.0,
                        help='Alpha decay rate (default: 0.0 for no decay)')
    parser.add_argument('--optimistic-init', type=float, default=0.0,
                        help='Optimistic Q-value initialization (default: 0.0)')
    parser.add_argument('-g', '--gamma', type=float, default=0.9,
                        help='Discount factor (default: 0.9)')
    parser.add_argument('-c', '--cost', type=float, default=-0.05,
                        help='Step cost (default: -0.05)')
    parser.add_argument('-s', '--stochasticity', type=int, default=1, choices=[0, 1, 2],
                        help='Stochasticity level: 0=deterministic, 1=moderate (4/6,1/6,1/6), 2=high (2/6,2/6,2/6) (default: 1)')
    parser.add_argument('-n', '--episodes', type=int, default=1000,
                        help='Number of episodes (default: 1000)')
    parser.add_argument('--graph-type', type=str, default='custom_rooms', choices=AVAILABLE_GRAPHS,
                        help=f'Graph type to use (default: custom_rooms). Choices: {AVAILABLE_GRAPHS}')
    parser.add_argument('--run-experiments', action='store_true',
                        help='Run multiple Q-learning experiments with different parameters')
    args = parser.parse_args()

    if args.run_experiments:
        print("Running multiple Q-learning experiments with different parameters...")
        run_experiments(args.graph_type)
        return

    # Create environment and agent
    adj, terminal_rewards, room_coords = get_graph(args.graph_type)
    env = RoomEnvironment(adj, terminal_rewards, step_cost=args.cost, stochasticity=args.stochasticity)
    agent = QLearningAgent(env, adj, epsilon=args.epsilon, alpha=args.alpha, gamma=args.gamma,
                          epsilon_decay=args.epsilon_decay, epsilon_min=args.epsilon_min,
                          alpha_decay_rate=args.alpha_decay_rate, optimistic_init=args.optimistic_init)

    # Train the agent
    print(f"\nTraining Q-learning agent for {args.episodes} episodes...")
    print(f"Parameters: ε={args.epsilon}, α={args.alpha}, γ={args.gamma}, step cost={args.cost}, stochasticity={args.stochasticity}, ε_decay={args.epsilon_decay}, ε_min={args.epsilon_min}, α_decay={args.alpha_decay_rate}, Q_init={args.optimistic_init}")
    rewards = agent.train(num_episodes=args.episodes)

    # Display the learned policy
    display_policy(agent, adj, terminal_rewards)

    # Create experiment directory structure matching run_experiments format
    base_dir = "q_learning_experiments"
    graph_dir = os.path.join(base_dir, args.graph_type)
    stoch_dir = os.path.join(graph_dir, f"s_{args.stochasticity}")

    # Generate experiment name using same format as run_experiments
    exp_name = f"single_c{args.cost}_s{args.stochasticity}_g{args.gamma}_e{args.epsilon}_ed{args.epsilon_decay}_em{args.epsilon_min}_a{args.alpha}_ad{args.alpha_decay_rate}_qi{args.optimistic_init}"
    exp_dir = os.path.join(stoch_dir, exp_name)
    os.makedirs(exp_dir, exist_ok=True)

    # Save data for visualization in experiments directory
    data_file = os.path.join(exp_dir, "exploration_data.json")
    data_file = agent.save_visualization_data(data_file)

    # Create static visualization
    create_static_visualization(data_file, exp_dir, room_coords, args.graph_type, skip_graph_subfolder=True)

def run_q_learning_experiment_in_debug_mode(graph_type="custom_rooms"):
    """Run a single Q-learning experiment in debug mode"""
    adj, terminal_rewards, room_coords = get_graph(graph_type)
    env = RoomEnvironment(adj, terminal_rewards, step_cost=0, stochasticity=0)
    agent = QLearningAgent(env, adj, epsilon=0.3, alpha=0.1, gamma=0.9)
    agent.train(num_episodes=10)
    display_policy(agent, adj, terminal_rewards)

if __name__ == "__main__":
    run_q_learning_experiment_in_debug_mode("complex_maze")
    main()