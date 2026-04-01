/* ============================================================
   GENETIC EVOLUTION — genetic.js
   A self-contained algorithm for the ALIFE Simulator.

   Load AFTER simulator.js:
     <script src="simulator.js"></script>
     <script src="genetic.js"></script>

   Organisms carry a genome that encodes:
     - species    : which of N species they belong to
     - speed      : movement velocity
     - size       : body radius (also affects reproduction cost)
     - perception : how far they can sense mates / rivals
     - aggression : tendency to fight vs. flee rival species
     - fertility  : how quickly their reproduction timer refills
     - lifespan   : maximum age before natural death
     - hue_shift  : small per-organism color variation within species

   Interaction rules:
     SAME SPECIES  → reproduce if both ready; child inherits blended genome + mutation
     RIVAL SPECIES → the MORE aggressive organism wins; loser loses energy
                     if aggression is very close, both take damage (war)
     FOOD          → scattered pellets restore energy

   Extinction & takeover emerge naturally from:
     - aggressive species killing weaker ones
     - overcrowding starving a species
     - lucky mutations producing fitter organisms
   ============================================================ */

'use strict';

/* ── Palette — one vivid hue per species slot (up to 8) ─────── */
const SPECIES_PALETTE = [
  { name: 'Crimson',  base: '#ff3a5c' },
  { name: 'Cobalt',   base: '#3a8fff' },
  { name: 'Verdant',  base: '#3aff7a' },
  { name: 'Amber',    base: '#ffb43a' },
  { name: 'Violet',   base: '#c03aff' },
  { name: 'Teal',     base: '#3affea' },
  { name: 'Rose',     base: '#ff3ae0' },
  { name: 'Lime',     base: '#c8ff3a' },
];

/* ── Helpers ─────────────────────────────────────────────── */
const _TAU   = Math.PI * 2;
const _clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const _lerp  = (a, b, t) => a + (b - a) * t;
const _rnd   = () => Math.random();

function _hexToRgb(hex) {
  return {
    r: parseInt(hex.slice(1,3),16),
    g: parseInt(hex.slice(3,5),16),
    b: parseInt(hex.slice(5,7),16),
  };
}

function _rgbToHex({r,g,b}) {
  return '#' + [r,g,b].map(v => _clamp(Math.round(v),0,255).toString(16).padStart(2,'0')).join('');
}

function _blendHex(a, b, t = 0.5) {
  const ca = _hexToRgb(a), cb = _hexToRgb(b);
  return _rgbToHex({
    r: _lerp(ca.r, cb.r, t),
    g: _lerp(ca.g, cb.g, t),
    b: _lerp(ca.b, cb.b, t),
  });
}

function _shiftHex(hex, amount) {
  const {r,g,b} = _hexToRgb(hex);
  return _rgbToHex({
    r: _clamp(r + amount, 0, 255),
    g: _clamp(g + amount * 0.7, 0, 255),
    b: _clamp(b - amount * 0.3, 0, 255),
  });
}

/** Draw glowing pixel blob */
function _blob(ctx, x, y, r, color, alpha = 1, glowMult = 2) {
  ctx.save();
  ctx.globalAlpha = _clamp(alpha, 0, 1);
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * glowMult);
  g.addColorStop(0,   color + 'ee');
  g.addColorStop(0.4, color + '66');
  g.addColorStop(1,   color + '00');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r * glowMult, 0, _TAU); ctx.fill();
  ctx.globalAlpha = _clamp(alpha * 1.1, 0, 1);
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(x, y, r, 0, _TAU); ctx.fill();
  ctx.restore();
}

/* ══════════════════════════════════════════════════════════
   GENOME
   ══════════════════════════════════════════════════════════ */

const GENOME_TEMPLATE = [
  //  key           min    max   mutScale
  ['speed',         0.4,   4.0,  0.25],
  ['size',          2.0,   9.0,  0.4 ],
  ['perception',   20,   160,    8   ],
  ['aggression',    0,     1,    0.08],
  ['fertility',     0.3,   2.0,  0.12],
  ['lifespan',    200,  1400,   60   ],
  ['hue_shift',   -30,    30,    4   ],
];

function _randomGene(key, min, max) {
  return min + _rnd() * (max - min);
}

function _newGenome(speciesIdx) {
  const g = { species: speciesIdx };
  for (const [key, min, max] of GENOME_TEMPLATE)
    g[key] = _randomGene(key, min, max);
  return g;
}

function _crossGenome(gA, gB, mutationRate, mutationStrength) {
  // offspring inherits species from dominant parent (higher fitness)
  const child = { species: _rnd() < 0.5 ? gA.species : gB.species };

  for (const [key, min, max, mutScale] of GENOME_TEMPLATE) {
    // blend
    let val = _lerp(gA[key], gB[key], _rnd());
    // mutate
    if (_rnd() < mutationRate) {
      val += ((_rnd() - 0.5) * 2) * mutScale * mutationStrength;
    }
    child[key] = _clamp(val, min, max);
  }

  // rare species mutation — offspring jumps to a random species
  if (_rnd() < mutationRate * 0.1) {
    child.species = Math.floor(_rnd() * _GeneticEvolution._numSpecies());
  }

  return child;
}

/* ══════════════════════════════════════════════════════════
   ORGANISM
   ══════════════════════════════════════════════════════════ */
let _oidSeq = 0;

function _createOrganism(x, y, genome) {
  return {
    id:        ++_oidSeq,
    x, y,
    vx:        (_rnd() - 0.5) * 2,
    vy:        (_rnd() - 0.5) * 2,
    genome,
    energy:    80 + _rnd() * 60,
    age:       0,
    repTimer:  0,
    dead:      false,
    // transient visuals
    _flashColor: null,
    _flashTimer: 0,
    _birthGlow:  8,
  };
}

/* ══════════════════════════════════════════════════════════
   FOOD PELLETS
   ══════════════════════════════════════════════════════════ */
function _spawnFood(W, H) {
  return { x: _rnd()*W, y: _rnd()*H, value: 20 + _rnd()*30, age: 0 };
}

/* ══════════════════════════════════════════════════════════
   THE ALGORITHM OBJECT
   ══════════════════════════════════════════════════════════ */
const _GeneticEvolution = {
  id:   'genetic',
  name: 'Genetic Evolution',
  key:  '5',

  legend: [], // built dynamically

  params: [
    { id:'num_species',     label:'# Species',         type:'range', min:1, max:8,    step:1,   value:4 },
    { id:'pop_per_species', label:'Pop / Species',      type:'range', min:5, max:80,   step:5,   value:25 },
    { id:'mutation_rate',   label:'Mutation Rate',      type:'range', min:0, max:1,    step:0.01,value:0.12 },
    { id:'mutation_str',    label:'Mutation Strength',  type:'range', min:0, max:3,    step:0.1, value:1.0 },
    { id:'food_density',    label:'Food Density',       type:'range', min:10,max:300,  step:10,  value:80 },
    { id:'food_regen',      label:'Food Regen Rate',    type:'range', min:1, max:30,   step:1,   value:8 },
    { id:'energy_drain',    label:'Energy Drain',       type:'range', min:0.1,max:2,   step:0.1, value:0.4 },
    { id:'repro_cost',      label:'Repro Energy Cost',  type:'range', min:20, max:200, step:5,   value:60 },
    { id:'fight_damage',    label:'Fight Damage',       type:'range', min:5,  max:80,  step:5,   value:25 },
    { id:'show_lineage',    label:'Show Trails',        type:'select',value:'on',  options:[{v:'on',l:'On'},{v:'off',l:'Off'}] },
    { id:'show_perception', label:'Show Perception',    type:'select',value:'off', options:[{v:'on',l:'On'},{v:'off',l:'Off'}] },
  ],

  /* internal */
  _food:    [],
  _trail:   null,   // OffscreenCanvas or null
  _trailCtx: null,
  _W: 0, _H: 0,
  _speciesColors: [], // computed hex per species
  _statsDiv: null,
  _statsHistory: [], // [{gen, counts:[]}]

  _numSpecies() { return this._speciesColors.length; },

  /* ── legend ──────────────────────────────────────────── */
  _buildLegend(n) {
    this.legend = SPECIES_PALETTE.slice(0,n).map((s,i) => ({
      label: s.name,
      color: this._speciesColors[i] || s.base,
    }));
    this.legend.push({ label: 'Food', color: '#ffffff' });
  },

  /* ── init ────────────────────────────────────────────── */
  init(state, canvas) {
    this._W = canvas.width;
    this._H = canvas.height;
    this._food = [];
    this._statsHistory = [];

    const ns = Math.round(state.params.num_species);
    this._speciesColors = SPECIES_PALETTE.slice(0, ns).map(s => s.base);
    this._buildLegend(ns);

    // seed food
    for (let i = 0; i < state.params.food_density; i++)
      this._food.push(_spawnFood(this._W, this._H));

    // seed organisms
    state.entities = [];
    const pps = Math.round(state.params.pop_per_species);
    for (let s = 0; s < ns; s++) {
      // each species starts clustered in a rough region
      const cx = 0.15*this._W + (s % 4) * (this._W * 0.22);
      const cy = 0.2*this._H  + Math.floor(s/4) * (this._H * 0.55);
      for (let i = 0; i < pps; i++) {
        const genome = _newGenome(s);
        const x = cx + (_rnd()-.5) * 120;
        const y = cy + (_rnd()-.5) * 120;
        state.entities.push(_createOrganism(x, y, genome));
      }
    }

    // trail canvas
    try {
      this._trail    = new OffscreenCanvas(this._W, this._H);
      this._trailCtx = this._trail.getContext('2d');
    } catch(e) {
      this._trail = null;
    }

    // inject live species stats bar
    this._injectStatsBar();
  },

  /* ── step ────────────────────────────────────────────── */
  step(state, canvas) {
    const W = this._W, H = this._H;
    const {
      mutation_rate, mutation_str, food_regen,
      energy_drain, repro_cost, fight_damage,
    } = state.params;

    // regen food
    if (_rnd() < food_regen / 60)
      this._food.push(_spawnFood(W, H));
    // age food out after a while
    this._food = this._food.filter(f => f.age++ < 900);

    const alive    = state.entities.filter(o => !o.dead);
    const newborns = [];

    for (const o of alive) {
      const g = o.genome;
      const speed      = g.speed;
      const perception = g.perception;

      // ── find nearest objects ──────────────────────────
      let nearestFood  = null, foodDist = Infinity;
      let nearestMate  = null, mateDist = Infinity;
      let nearestRival = null, rivalDist= Infinity;

      for (const f of this._food) {
        const d = Math.hypot(f.x-o.x, f.y-o.y);
        if (d < perception && d < foodDist) { foodDist=d; nearestFood=f; }
      }

      for (const other of alive) {
        if (other === o) continue;
        const d = Math.hypot(other.x-o.x, other.y-o.y);
        if (d > perception) continue;
        if (other.genome.species === g.species) {
          if (d < mateDist) { mateDist=d; nearestMate=other; }
        } else {
          if (d < rivalDist) { rivalDist=d; nearestRival=other; }
        }
      }

      // ── steering ──────────────────────────────────────
      let tx = o.x + o.vx, ty = o.y + o.vy; // default: keep going

      // flee from rivals if low aggression
      if (nearestRival && g.aggression < 0.5) {
        const dx = o.x - nearestRival.x, dy = o.y - nearestRival.y;
        const mag = Math.hypot(dx,dy)||1;
        tx = o.x + (dx/mag)*speed*2;
        ty = o.y + (dy/mag)*speed*2;
      } else if (nearestRival && g.aggression >= 0.5) {
        // chase rival
        tx = nearestRival.x; ty = nearestRival.y;
      } else if (nearestMate && o.repTimer <= 0 && o.energy > repro_cost*0.8) {
        tx = nearestMate.x; ty = nearestMate.y;
      } else if (nearestFood) {
        tx = nearestFood.x; ty = nearestFood.y;
      } else {
        // wander with slight curve
        o.vx += (_rnd()-.5)*0.4;
        o.vy += (_rnd()-.5)*0.4;
      }

      // steer toward target
      const ddx = tx - o.x, ddy = ty - o.y;
      const dmag = Math.hypot(ddx,ddy)||1;
      o.vx = _lerp(o.vx, (ddx/dmag)*speed, 0.18);
      o.vy = _lerp(o.vy, (ddy/dmag)*speed, 0.18);

      // clamp speed
      const spd = Math.hypot(o.vx,o.vy);
      if (spd > speed) { o.vx = o.vx/spd*speed; o.vy = o.vy/spd*speed; }

      // move
      o.x += o.vx; o.y += o.vy;

      // wrap
      if (o.x < 0) o.x += W; if (o.x > W) o.x -= W;
      if (o.y < 0) o.y += H; if (o.y > H) o.y -= H;

      // ── eat food ──────────────────────────────────────
      this._food = this._food.filter(f => {
        if (Math.hypot(f.x-o.x,f.y-o.y) < g.size + 4) {
          o.energy += f.value; return false;
        }
        return true;
      });

      // ── fight rivals ──────────────────────────────────
      if (nearestRival && rivalDist < g.size + nearestRival.genome.size + 2) {
        const myAgg  = g.aggression + _rnd()*0.2;
        const rvAgg  = nearestRival.genome.aggression + _rnd()*0.2;
        const dmg    = fight_damage * (1 + g.size * 0.1);
        if (myAgg > rvAgg) {
          nearestRival.energy -= dmg;
          o.energy += dmg * 0.3; // energy transfer
          nearestRival._flashColor = '#ff3a3a';
          nearestRival._flashTimer = 6;
        } else if (rvAgg > myAgg) {
          o.energy -= dmg;
          o._flashColor = '#ff3a3a';
          o._flashTimer = 6;
        } else {
          // mutual damage (war)
          o.energy -= dmg * 0.5;
          nearestRival.energy -= dmg * 0.5;
        }
      }

      // ── reproduce ─────────────────────────────────────
      if (
        nearestMate && mateDist < g.size + nearestMate.genome.size + 3
        && o.repTimer <= 0 && nearestMate.repTimer <= 0
        && o.energy > repro_cost && nearestMate.energy > repro_cost * 0.6
      ) {
        o.energy          -= repro_cost;
        nearestMate.energy -= repro_cost * 0.4;
        o.repTimer          = Math.round(80 / g.fertility);
        nearestMate.repTimer = Math.round(80 / nearestMate.genome.fertility);

        const childGenome = _crossGenome(g, nearestMate.genome, mutation_rate, mutation_str);
        const cx = (o.x + nearestMate.x)/2 + (_rnd()-.5)*10;
        const cy = (o.y + nearestMate.y)/2 + (_rnd()-.5)*10;
        const child = _createOrganism(cx, cy, childGenome);
        child.energy = 40 + _rnd()*20;
        newborns.push(child);

        o._flashColor = '#ffe44f'; o._flashTimer = 8;
      }

      // ── timers & aging ────────────────────────────────
      if (o.repTimer > 0) o.repTimer--;
      if (o._flashTimer > 0) o._flashTimer--;
      if (o._birthGlow > 0) o._birthGlow--;

      // drain
      const sizeCost = g.size * 0.04;
      const speedCost = g.speed * 0.03;
      o.energy -= (energy_drain + sizeCost + speedCost);
      o.age++;

      // death conditions
      if (o.energy <= 0 || o.age > g.lifespan) o.dead = true;
    }

    // hard cap to avoid lag
    const allLive = alive.filter(o => !o.dead);
    const combined = [...allLive, ...newborns];
    if (combined.length > 1200) {
      combined.sort((a,b) => b.energy - a.energy);
      combined.length = 1000;
    }

    state.entities = combined;
    state._population = combined.length;

    // record per-species counts for stats bar
    this._recordStats(state);
  },

  /* ── draw ────────────────────────────────────────────── */
  draw(state, ctx, canvas) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const showTrails     = state.params.show_lineage    === 'on';
    const showPerception = state.params.show_perception === 'on';

    // fade trail layer
    if (showTrails && this._trailCtx) {
      this._trailCtx.globalAlpha = 0.04;
      this._trailCtx.fillStyle   = '#000000';
      this._trailCtx.fillRect(0, 0, this._W, this._H);
      this._trailCtx.globalAlpha = 1;
    }

    // draw food pellets
    for (const f of this._food) {
      _blob(ctx, f.x, f.y, 2.5, '#ffffff', 0.45, 1.3);
    }

    // draw organisms
    for (const o of state.entities) {
      const g      = o.genome;
      const base   = this._speciesColors[g.species] || '#ffffff';
      const health = _clamp(o.energy / 150, 0.15, 1);
      const r      = _clamp(g.size * (0.7 + health*0.3), 2, 11);

      // shift color by individual hue_shift gene
      const col = _shiftHex(base, Math.round(g.hue_shift));

      // flash color override (fight = red, reproduce = gold)
      const drawCol = (o._flashTimer > 0) ? o._flashColor : col;

      // perception ring
      if (showPerception) {
        ctx.save();
        ctx.strokeStyle = col + '22';
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.arc(o.x, o.y, g.perception, 0, _TAU);
        ctx.stroke();
        ctx.restore();
      }

      // velocity trail
      if (showTrails && this._trailCtx) {
        this._trailCtx.strokeStyle = col + '99';
        this._trailCtx.lineWidth   = 1;
        this._trailCtx.beginPath();
        this._trailCtx.moveTo(o.x, o.y);
        this._trailCtx.lineTo(o.x - o.vx*3, o.y - o.vy*3);
        this._trailCtx.stroke();
      }

      // birth glow burst
      if (o._birthGlow > 0) {
        const br = r * (1 + o._birthGlow * 0.5);
        _blob(ctx, o.x, o.y, br, col, 0.15, 1.2);
      }

      // main body
      const glowMult = 1.5 + (1 - health) * 0.8;
      _blob(ctx, o.x, o.y, r, drawCol, health * 0.9 + 0.1, glowMult);

      // aggression spikes: tiny triangles for high-aggression organisms
      if (g.aggression > 0.65) {
        ctx.save();
        ctx.translate(o.x, o.y);
        ctx.rotate(Math.atan2(o.vy, o.vx));
        ctx.fillStyle = col;
        ctx.globalAlpha = (g.aggression - 0.65) * 2;
        ctx.beginPath();
        ctx.moveTo(r+2, 0);
        ctx.lineTo(r+6, -2.5);
        ctx.lineTo(r+6,  2.5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }

    // blit trail onto main
    if (showTrails && this._trail) {
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.drawImage(this._trail, 0, 0);
      ctx.restore();
    }

    // update stats bar
    this._updateStatsBar(state);
  },

  /* ── canvas click — spawn random organism of random species ── */
  onCanvasClick(state, cx, cy) {
    const ns = Math.round(state.params.num_species);
    for (let i = 0; i < 6; i++) {
      const s = Math.floor(_rnd() * ns);
      const g = _newGenome(s);
      state.entities.push(
        _createOrganism(cx + (_rnd()-.5)*40, cy + (_rnd()-.5)*40, g)
      );
    }
  },

  /* ── species stats tracking ───────────────────────────── */
  _recordStats(state) {
    const ns = this._speciesColors.length;
    const counts = new Array(ns).fill(0);
    for (const o of state.entities) {
      const s = o.genome.species;
      if (s >= 0 && s < ns) counts[s]++;
    }
    this._statsHistory.push({ gen: state.gen, counts });
    if (this._statsHistory.length > 200) this._statsHistory.shift();
  },

  /* ── stats bar DOM injection ─────────────────────────── */
  _injectStatsBar() {
    let bar = document.getElementById('genetic-stats-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'genetic-stats-bar';
      bar.style.cssText = `
        position:absolute; top:16px; right:16px;
        z-index:15; background:#090d1acc;
        border:1px solid #1a2240; border-radius:6px;
        padding:10px 14px; min-width:170px;
        font-family:'Share Tech Mono',monospace;
        font-size:10px; color:#c8d8f8;
        backdrop-filter:blur(4px);
        display:none;
      `;
      const wrap = document.getElementById('canvas-wrap');
      if (wrap) wrap.appendChild(bar);
    }
    this._statsDiv = bar;
  },

  _updateStatsBar(state) {
    const bar = this._statsDiv || document.getElementById('genetic-stats-bar');
    if (!bar) return;
    const ns   = this._speciesColors.length;
    const counts = new Array(ns).fill(0);
    for (const o of state.entities) {
      const s = o.genome.species;
      if (s >= 0 && s < ns) counts[s]++;
    }

    bar.style.display = 'block';
    bar.innerHTML = `
      <div style="font-family:'Orbitron',sans-serif;font-size:8px;letter-spacing:3px;color:#3a4a6a;margin-bottom:8px">
        SPECIES CENSUS
      </div>
      ${SPECIES_PALETTE.slice(0,ns).map((sp,i) => {
        const c   = counts[i];
        const col = this._speciesColors[i];
        const pct = state.entities.length > 0 ? Math.round(c/state.entities.length*100) : 0;
        const extinct = c === 0;
        return `
          <div style="margin-bottom:6px">
            <div style="display:flex;justify-content:space-between;margin-bottom:3px">
              <span style="color:${col};text-shadow:0 0 8px ${col}">${sp.name}</span>
              <span style="color:${extinct ? '#ff4f4f' : '#ffe44f'}">${extinct ? 'EXTINCT' : c}</span>
            </div>
            <div style="background:#1a2240;border-radius:2px;height:3px;overflow:hidden">
              <div style="width:${pct}%;height:100%;background:${col};
                          box-shadow:0 0 6px ${col};
                          transition:width 0.3s ease;
                          border-radius:2px"></div>
            </div>
          </div>`;
      }).join('')}
      <div style="margin-top:8px;color:#3a4a6a;border-top:1px solid #1a2240;padding-top:6px">
        TOTAL <span style="color:#ffe44f">${state.entities.length}</span>
      </div>
    `;
  },
};

/* ── Hide stats bar when switching away ─────────────────── */
const _origInit = _GeneticEvolution.init.bind(_GeneticEvolution);
_GeneticEvolution.init = function(state, canvas) {
  _origInit(state, canvas);
};

/* ── Clean up stats bar on algo switch (hook into registry) ─ */
if (typeof SimRegistry !== 'undefined') {
  SimRegistry.register(_GeneticEvolution);
  console.log('[ALIFE] Genetic Evolution algorithm loaded.');

  // hide stats bar when a non-genetic algo is selected
  const algoButtons = document.querySelectorAll('.algo-btn');
  algoButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.id !== 'genetic') {
        const bar = document.getElementById('genetic-stats-bar');
        if (bar) bar.style.display = 'none';
      }
    });
  });
} else {
  console.error('[ALIFE] SimRegistry not found. Load simulator.js before genetic.js.');
}
