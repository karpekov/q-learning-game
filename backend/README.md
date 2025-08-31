# Q-Learning Room Explorer for CS3600

This repository provides an interactive Q-learning implementation for exploring room environments as part of the CS3600 (Introduction to Artificial Intelligence) course at Georgia Tech. It contains implementations of Q-learning algorithms with step-by-step visualization capabilities and human play modes for different graph structures and stochasticity levels.

Below is a demo of the Q-learning algorithm in action, where the agent learns to navigate a complex maze environment. The agent explores the maze, updates its Q-values, and gradually learns the optimal policy to reach the goal state while avoiding negative rewards:

![Q-learning Maze Demo](assets/q-learning-experiments.gif)

## Overview

### Q-Learning Algorithm

This repository includes a comprehensive implementation of the Q-learning reinforcement learning algorithm:

**Q-Learning**: Model-free temporal difference learning that learns the optimal action-value function Q*(s,a) using the Bellman equation update:
```
Q(s,a) ← Q(s,a) + α[r + γ·max_a'Q(s',a') - Q(s,a)]
```

### Key Features

- **Multiple Environment Types**: Classic 3x4 simple grid from the "Artificial Intelligence: A Modern Approach" book, and complex mazes with multiple positive and negativerewards and configurable stochasticity levels.
- **Human Play Mode**: Allow humans to navigate and explore custom environments using pygame as if they were the agent.
- **Comprehensive Hyperparameter Exploration**: Run multiple experiments with varying hyperparameters including epsilon (exploration), alpha (learning rate), step cost, decay rates, optimistic initialization, and more
- **Interactive Learning Visualization**: Using pygame, visualize individual episode replays to see how agents explore environments and learn optimal policies in real-time

## Quick Start

### **1. Install dependencies:**

   **Option A: Using conda (recommended):**
   ```bash
   conda env create -f environment.yml
   conda activate cs3600-q-learning
   ```

   **Option B: Using pip:**
   ```bash
   pip install numpy matplotlib networkx ipywidgets jupyter notebook ipython pygame tqdm
   ```



### **2. Human Play Mode:**

In human play mode, the player cannot see the surrounding environment, but can navigate the maze using arrow keys. The player can explore the maze and see how the agent would behave in that state.

To run the interactive visualizer in human play mode, use the following command:

   ```bash
   python interactive_visualizer.py --human-play --graph-type complex_maze
   ```

The demo video below shows what the human play mode looks like in action:
![Human Play Mode Demo](assets/q-learning-human-play.gif)

### **3. Run single Q-learning experiment:**

To train a Q-learning agent, use the following command:

   ```bash
   python q_learning.py \
       --graph-type complex_maze \
       --episodes 1000000 \
       --gamma 0.9 \
       --epsilon 0.8 \
       --epsilon-decay 0.999 \
       --alpha 0.2 \
       --alpha-decay-rate 0.01 \
       --optimistic-init 100.0 \
       --stochasticity 0
   ```

Hyperparameters:
- `--graph-type` - Graph type
- `--episodes` - Number of episodes
- `--epsilon` - Exploration rate
- `--epsilon-decay` - Exploration rate decay rate
- `--epsilon-min` - Minimum exploration rate
- `--alpha` - Learning rate
- `--alpha-decay-rate` - Learning rate decay rate
- `--optimistic-init` - Optimistic Q-value initialization
- `--gamma` - Discount factor
- `--cost` - Step cost
- `--stochasticity` - Stochasticity level: 0 for deterministic, 1 for stochastic with 20% chance of moving to a random state, 2 for stochastic with 50% chance of moving to a random state

The experiment results are saved in the `q_learning_experiments/` folder.

### **4. Run Multiple Q-learning experiments:**

To run multiple experiments, use the `--run-experiments` flag. The experiment config is defined in the `q_learning.py` file.

   ```bash
   python q_learning.py --run-experiments --graph-type complex_maze
   ```

The experiment results are saved in the `q_learning_experiments/` folder.

### **5. Visualize Q-learning Experiments:**

To visualize the Q-learning experiments, use the following command:

   ```bash
   python interactive_visualizer.py --experiments --graph-type complex_maze
   ```

## Files

- `q_learning.py` - Main Q-learning implementation and experiment runner.
- `interactive_visualizer.py` - Interactive visualization and human play mode using pygame.
- `graph_definitions.py` - Graph structures (simple_grid, custom_rooms, complex_maze)
- `environment.yml` - Conda environment specification

## Graph Types

- `simple_grid` - Grid-based navigation environment
- `custom_rooms` - 13-state room environment with goal and pit
- `complex_maze` - Large maze environment (400+ states)

To create a `.png` visual of all available graphs, run:
```bash
python graph_definitions.py
```

The charts are saved in the `graphs/` folder.


## Debug Mode

To debug the Q-learning algorithm, uncomment the following line in `q_learning.py`:
```python
# run_q_learning_experiment_in_debug_mode("complex_maze")
```
And run in debug mode within your IDE.

## Author

[Alexander Karpekov](https://alexkarpekov.com) is the author of this repository. He is a PhD student at Georgia Tech and created this repository to support his teaching of Q-learning algorithms in the CS3600 course.

*Parts of this repository were co-developed with the assistance of AI tools, including Claude 4.0 Sonnet and Cursor. All content was reviewed and edited by the author.*

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.