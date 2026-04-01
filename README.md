# ALIFE — Artificial Life Simulator

A browser-based artificial life simulation engine with a visual, glow-rendered canvas and a fully extensible algorithm registry. Watch organisms live, die, flock, fight, evolve, and leave pheromone trails — all in real time.

No build tools, no dependencies. Open `index.html` in any modern browser and it runs.

---

## Files

```
alife-simulator/
├── index.html       # UI shell — layout, controls, canvas
├── simulator.js     # Engine, registry
├── ant_colony.js    # Ant trails with pheremones algorithm
├── conway_life.js   # Conway's game of life
├── preditor_prey.js # Preditor vs. Prey algorithm
├── boids.js         # Flocking boids algorithm
└── genetic.js       # Genetic Evolution algorithm 
```

---

## Controls

| Control | Action |
|---|---|
| `1` `2` `3` `4` `5` | Switch algorithm |
| `Space` | Play / Pause |
| `R` | Reset simulation |
| Click canvas | Seed organisms at cursor position |
| Speed slider | Target framerate (1–60 fps) |
| Parameter sliders | Adjust live — most take effect immediately |

---

## Algorithms

### 1 — Conway's Game of Life
Classic cellular automaton on a toroidal grid. Each cell is alive or dead; its next state is determined by how many of its 8 neighbors are alive. Births glow yellow, deaths flash pink, living cells glow cyan. The birth and survival thresholds are fully configurable, so you can run standard B3/S23 or experiment with exotic rule sets. Click the canvas to stamp a glider at the cursor.

### 2 — Boids Flocking
Craig Reynolds' 1987 flocking model. Each boid steers according to three forces: **separation** (avoid crowding neighbors), **alignment** (match neighbors' heading), and **cohesion** (move toward the group center). Force radii and weights are independently tunable, making it easy to dial between tight murmurations and chaotic scattering. Velocity trails show recent movement. Toggle perception radius rings on to visualize neighborhood zones. Click to inject a fresh cluster of boids.

### 3 — Predator-Prey Ecosystem
An energy-driven ecosystem with three roles: **food pellets** that spawn on the canvas, **prey** that seek food and flee predators, and **predators** that hunt prey. All organisms reproduce when their energy crosses a threshold, and die when it reaches zero. Population dynamics produce Lotka-Volterra-style oscillations — predator booms follow prey booms, then collapse when prey are depleted. Click to inject a burst of prey.

### 4 — Ant Colony / Slime Mold
Stigmergy-based pathfinding. Ants move forward, sensing pheromone concentration at three points ahead (left, center, right) and turning toward the strongest signal. When carrying food they deposit a stronger trail back toward the nest, reinforcing successful paths. Pheromone diffuses and evaporates over time. Emergent tubular networks form as ants collectively solve the shortest-path problem to food sources. Click to drop a new food source.

### 5 — Genetic Evolution *(genetic.js)*
Organisms carry a 7-gene genome: `speed`, `size`, `perception`, `aggression`, `fertility`, `lifespan`, and `hue_shift`. Same-species organisms that meet and have sufficient energy reproduce — offspring inherit a blended genome with random mutations applied per gene. Rival-species encounters resolve by comparing `aggression` scores; the more aggressive organism deals damage and absorbs energy. A live **Species Census** panel tracks population and extinction in real time. High mutation rates cause color drift and speciation over time.

---

## Implementing Your Own Algorithm

The simulator exposes a simple registry interface. Any algorithm you register automatically gets its parameters rendered in the control panel — no UI code required.

### Step 1 — Create a new `.js` file

```js
'use strict';

const MyAlgorithm = {
  id:   'my-algo',        // unique kebab-case string
  name: 'My Algorithm',   // display name shown in the sidebar
  key:  '6',              // keyboard shortcut (single character)

  legend: [
    { label: 'My Organism', color: '#ff00ff' },
  ],

  // Parameters are automatically rendered as sliders or dropdowns.
  // Values are available at runtime via state.params.<id>
  params: [
    { id: 'count',  label: 'Population', type: 'range',  min: 10, max: 300, step: 10, value: 80 },
    { id: 'speed',  label: 'Speed',      type: 'range',  min: 0.5, max: 5,  step: 0.5, value: 2 },
    { id: 'trails', label: 'Trails',     type: 'select', value: 'on',
      options: [{ v: 'on', l: 'On' }, { v: 'off', l: 'Off' }] },
  ],

  // Called on reset. Populate state.entities with your initial organisms.
  init(state, canvas) {
    state.entities = [];
    for (let i = 0; i < state.params.count; i++) {
      state.entities.push({
        x:  Math.random() * canvas.width,
        y:  Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2,
      });
    }
  },

  // Called every tick. Mutate state.entities in place.
  // Set state._population to an integer for the header counter.
  step(state, canvas) {
    const speed = state.params.speed;
    for (const e of state.entities) {
      e.x += e.vx * speed;
      e.y += e.vy * speed;
      if (e.x < 0 || e.x > canvas.width)  e.vx *= -1;
      if (e.y < 0 || e.y > canvas.height) e.vy *= -1;
    }
    state._population = state.entities.length;
  },

  // Called every tick after step(). Draw to ctx however you like.
  draw(state, ctx, canvas) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const e of state.entities) {
      ctx.beginPath();
      ctx.arc(e.x, e.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#ff00ff';
      ctx.fill();
    }
  },

  // Optional. Called when the user clicks the canvas.
  onCanvasClick(state, cx, cy) {
    state.entities.push({ x: cx, y: cy, vx: 1, vy: 1 });
  },
};

// Register — the UI panel and keyboard shortcut are wired automatically.
SimRegistry.register(MyAlgorithm);
```

### Step 2 — Load after `simulator.js`

```html
<script src="simulator.js"></script>
<script src="genetic.js"></script>   <!-- optional built-in -->
<script src="my-algo.js"></script>   <!-- your algorithm -->
```

That's it. The algorithm appears in the sidebar immediately on page load.

---

## The `state` Object

All three hooks (`init`, `step`, `draw`) receive the same `state` object.

| Property | Type | Description |
|---|---|---|
| `state.entities` | `any[]` | Your organisms. You own the shape entirely. |
| `state.params` | `Object` | Live parameter values keyed by `ParamDef.id`. |
| `state.gen` | `number` | Generation counter, incremented by the engine each tick. |
| `state._population` | `number` | Set this in `step()` to update the header population counter. |
| `state.rng` | `() => number` | Seeded random function returning `[0, 1)`. Use instead of `Math.random()` for reproducibility. |
| `state._canvasW` | `number` | Canvas width at init time (useful in `onCanvasClick`). |
| `state._canvasH` | `number` | Canvas height at init time. |

---

## Parameter Types

### `range`
Renders as a labeled slider.

```js
{ id: 'speed', label: 'Speed', type: 'range', min: 0.5, max: 5, step: 0.5, value: 2 }
```

### `select`
Renders as a dropdown.

```js
{
  id: 'mode', label: 'Mode', type: 'select', value: 'hunt',
  options: [
    { v: 'hunt',   l: 'Hunt' },
    { v: 'wander', l: 'Wander' },
  ]
}
```

Values arrive in `state.params` as strings for `select` and numbers for `range`.

---

## Rendering Tips

The simulator renders organisms using radial-gradient glow blobs for a bioluminescent aesthetic. You can copy the helper from any built-in algorithm or write your own draw logic — the canvas context is a standard 2D context and there are no restrictions on what you render.

```js
// Minimal glow blob helper
function drawBlob(ctx, x, y, r, color, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.5);
  g.addColorStop(0,   color + 'cc');
  g.addColorStop(0.5, color + '44');
  g.addColorStop(1,   color + '00');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r * 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
```

---

## Browser Compatibility

Requires a browser with support for Canvas 2D, `requestAnimationFrame`, `OffscreenCanvas` (optional, used for trail rendering in the Ant Colony and Genetic algorithms — degrades gracefully without it), and ES6+ (`const`, arrow functions, destructuring). Any modern version of Chrome, Firefox, Safari, or Edge works.
