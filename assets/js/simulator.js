/*
 * Copyright (c) 2026 Terry Packer.
 *
 * This file is part of Terry Packer's Work.
 * See www.terrypacker.com for further info.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/* ============================================================
   ALIFE SIMULATOR — simulator.js
   ============================================================

   HOW TO ADD A NEW ALGORITHM
   ---------------------------
   1. Create an object conforming to the AlgorithmDefinition interface (see below).
   2. Call SimRegistry.register(yourAlgorithm) before or after DOMContentLoaded.
   3. The UI will automatically expose all params you declare.

   AlgorithmDefinition interface:
   {
     id:      string          — unique kebab-case id
     name:    string          — display name
     key:     string          — keyboard shortcut (single char)
     legend:  Array<{label, color}>  — canvas legend entries

     params:  Array<ParamDef> — exposed UI parameters
     // ParamDef: { id, label, type:'range'|'select', min, max, step, value, options:[{v,l}] }

     init(state, canvas)      — called on reset; populate state.entities
     step(state, canvas)      — advance simulation by one tick; mutate state.entities
     draw(state, ctx, canvas) — render current state to canvas
   }

   state object passed to all hooks:
   {
     entities:  any[]         — your organisms / cells / agents (you own the shape)
     params:    Object        — live param values keyed by ParamDef.id
     gen:       number        — generation counter (managed by engine)
     rng:       ()=>number    — seeded random [0,1)
   }
   ============================================================ */

'use strict';

/* ── Utility ── */
const $ = id => document.getElementById(id);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const TAU = Math.PI * 2;

function seededRng(seed = Date.now()) {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13; s ^= s >> 17; s ^= s << 5;
    return ((s >>> 0) / 0xffffffff);
  };
}

/* ── Pixel-blob / glow renderer helpers ── */
function drawBlob(ctx, x, y, r, color, alpha = 1, glowSize = 2) {
  ctx.save();
  ctx.globalAlpha = alpha;
  // outer glow
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * (1 + glowSize));
  g.addColorStop(0,   color + 'cc');
  g.addColorStop(0.4, color + '66');
  g.addColorStop(1,   color + '00');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r * (1 + glowSize), 0, TAU);
  ctx.fill();
  // core
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return {r,g,b};
}
function rgbStr({r,g,b}, a=1) { return `rgba(${r},${g},${b},${a})`; }

/* ════════════════════════════════════════════════════════════
   ALGORITHM REGISTRY — Add custom algorithms here
   ════════════════════════════════════════════════════════════ */
const SimRegistry = (() => {
  const _algorithms = [];

  return {
    register(algo) {
      if (_algorithms.find(a => a.id === algo.id)) {
        console.warn(`[SimRegistry] Algorithm '${algo.id}' already registered — skipping.`);
        return;
      }
      _algorithms.push(algo);
      console.log(`[SimRegistry] Registered: ${algo.name}`);
    },
    all()        { return [..._algorithms]; },
    get(id)      { return _algorithms.find(a => a.id === id) || null; },
  };
})();


/* ════════════════════════════════════════════════════════════
   ENGINE — tick loop, state management
   ════════════════════════════════════════════════════════════ */
const Engine = (() => {
  let _algo    = null;
  let _state   = null;
  let _running = false;
  let _handle  = null;
  let _fps     = 10;
  let _lastT   = 0;
  let _fpsSmooth = 0;
  let _canvas  = null;
  let _ctx     = null;

  function buildState(algo, canvas, globalParams) {
    const params = {};
    for (const pd of algo.params) params[pd.id] = pd.value;
    return {
      entities: [],
      params,
      gen: 0,
      _population: 0,
      _canvasW: canvas.width,
      _canvasH: canvas.height,
      rng: seededRng(Date.now()),
    };
  }

  function tick(timestamp) {
    if (!_running) return;
    const elapsed = timestamp - _lastT;
    const interval = 1000 / _fps;
    if (elapsed >= interval) {
      _lastT = timestamp - (elapsed % interval);
      _fpsSmooth = lerp(_fpsSmooth, 1000/Math.max(elapsed,1), 0.15);
      _algo.step(_state, _canvas);
      _algo.draw(_state, _ctx, _canvas);
      _state.gen++;
      UI.updateStats(_state.gen, _state._population, Math.round(_fpsSmooth));
    }
    _handle = requestAnimationFrame(tick);
  }

  return {
    init(algo, canvas, ctx) {
      _algo   = algo;
      _canvas = canvas;
      _ctx    = ctx;
      _state  = buildState(algo, canvas);
      algo.init(_state, canvas);
      algo.draw(_state, ctx, canvas);
      _state.gen = 0;
      UI.updateStats(0, _state._population, 0);
    },

    start() {
      if (_running) return;
      _running = true;
      _lastT   = performance.now();
      _handle  = requestAnimationFrame(tick);
    },

    pause() {
      _running = false;
      if (_handle) { cancelAnimationFrame(_handle); _handle = null; }
    },

    isRunning() { return _running; },

    step() {
      if (_running) return;
      _algo.step(_state, _canvas);
      _algo.draw(_state, _ctx, _canvas);
      _state.gen++;
      UI.updateStats(_state.gen, _state._population, 0);
    },

    reset() {
      this.pause();
      _state = buildState(_algo, _canvas);
      _algo.init(_state, _canvas);
      _algo.draw(_state, _ctx, _canvas);
      _state.gen = 0;
      UI.updateStats(0, _state._population, 0);
    },

    setFps(fps)  { _fps = fps; },

    setParam(id, value) {
      if (_state) _state.params[id] = +value || value;
    },

    canvasClick(cx, cy) {
      if (_algo && _algo.onCanvasClick && _state) {
        _state._canvasW = _canvas.width;
        _state._canvasH = _canvas.height;
        _algo.onCanvasClick(_state, cx, cy);
        if (!_running) { _algo.draw(_state, _ctx, _canvas); }
      }
    },

    switchAlgo(algo, canvas, ctx) {
      this.pause();
      this.init(algo, canvas, ctx);
    },

    getAlgo() { return _algo; },
  };
})();


/* ════════════════════════════════════════════════════════════
   UI — DOM wiring
   ════════════════════════════════════════════════════════════ */
const UI = (() => {
  let currentAlgoId = null;

  function buildAlgoList() {
    const list = $('algo-list');
    list.innerHTML = '';
    for (const algo of SimRegistry.all()) {
      const btn = document.createElement('button');
      btn.className = 'algo-btn';
      btn.dataset.id = algo.id;
      btn.innerHTML = `
        <span class="algo-dot"></span>
        <span class="algo-label">${algo.name}</span>
        <span class="algo-key">${algo.key}</span>
      `;
      btn.addEventListener('click', () => selectAlgo(algo.id));
      list.appendChild(btn);
    }
  }

  function buildParamUI(algo) {
    const container = $('algo-params');
    container.innerHTML = '';
    if (!algo.params || algo.params.length === 0) return;

    const section = document.createElement('div');
    section.className = 'param-group';
    section.innerHTML = `<div class="section-title">PARAMETERS — ${algo.name.toUpperCase()}</div>`;

    for (const pd of algo.params) {
      const row = document.createElement('div');
      row.className = 'param-row';

      if (pd.type === 'range') {
        row.innerHTML = `
          <div class="param-label">${pd.label} <span class="val" id="pv-${pd.id}">${pd.value}</span></div>
          <input type="range" id="pi-${pd.id}" min="${pd.min}" max="${pd.max}" step="${pd.step}" value="${pd.value}" />
        `;
        section.appendChild(row);

        // wire after append
        setTimeout(() => {
          const inp = $(`pi-${pd.id}`);
          const val = $(`pv-${pd.id}`);
          if (!inp) return;
          inp.addEventListener('input', () => {
            val.textContent = inp.value;
            Engine.setParam(pd.id, parseFloat(inp.value));
          });
        }, 0);

      } else if (pd.type === 'select') {
        const opts = pd.options.map(o =>
          `<option value="${o.v}" ${o.v===pd.value?'selected':''}>${o.l}</option>`
        ).join('');
        row.innerHTML = `
          <div class="param-label">${pd.label}</div>
          <select id="pi-${pd.id}" style="
            background:var(--panel);border:1px solid var(--border);
            color:var(--text);font-family:var(--font-mono);font-size:10px;
            padding:4px 8px;border-radius:4px;width:100%;cursor:pointer;">
            ${opts}
          </select>
        `;
        section.appendChild(row);
        setTimeout(() => {
          const sel = $(`pi-${pd.id}`);
          if (!sel) return;
          sel.addEventListener('change', () => Engine.setParam(pd.id, sel.value));
        }, 0);
      }
    }
    container.appendChild(section);
  }

  function buildLegend(algo) {
    const leg = $('legend');
    leg.innerHTML = '';
    for (const item of (algo.legend || [])) {
      const div = document.createElement('div');
      div.className = 'legend-item';
      div.innerHTML = `<div class="legend-dot" style="background:${item.color};box-shadow:0 0 6px ${item.color}"></div>${item.label}`;
      leg.appendChild(div);
    }
  }

  function selectAlgo(id) {
    const algo = SimRegistry.get(id);
    if (!algo) return;
    currentAlgoId = id;

    // update button states
    document.querySelectorAll('.algo-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.id === id);
    });

    $('algo-badge').textContent = algo.name.toUpperCase();
    buildParamUI(algo);
    buildLegend(algo);

    const canvas = $('main-canvas');
    const ctx    = canvas.getContext('2d');
    Engine.switchAlgo(algo, canvas, ctx);
    updatePlayBtn();
  }

  function updatePlayBtn() {
    const btn = $('btn-play');
    if (Engine.isRunning()) {
      btn.textContent = '⏸ PAUSE';
      btn.classList.add('primary');
      $('paused-overlay').classList.remove('visible');
    } else {
      btn.textContent = '▶ PLAY';
      btn.classList.remove('primary');
      $('paused-overlay').classList.add('visible');
    }
  }

  return {
    init() {
      buildAlgoList();

      // transport
      $('btn-play').addEventListener('click', () => {
        if (Engine.isRunning()) Engine.pause();
        else Engine.start();
        updatePlayBtn();
      });

      $('btn-step').addEventListener('click', () => {
        if (!Engine.isRunning()) Engine.step();
      });

      $('btn-reset').addEventListener('click', () => {
        Engine.reset();
        updatePlayBtn();
      });

      // speed
      const speedSlider = $('speed-slider');
      speedSlider.addEventListener('input', () => {
        $('speed-val').textContent = speedSlider.value;
        Engine.setFps(parseInt(speedSlider.value));
      });

      // population (global)
      const popSlider = $('pop-slider');
      popSlider.addEventListener('input', () => {
        $('pop-val').textContent = popSlider.value;
        // note: population param gets picked up on next reset
        const algo = Engine.getAlgo();
        if (algo) {
          // try to set count/ant_count/prey_count etc.
          Engine.setParam('count',      parseInt(popSlider.value));
          Engine.setParam('ant_count',  parseInt(popSlider.value));
          Engine.setParam('prey_count', parseInt(popSlider.value));
        }
      });

      // keyboard shortcuts
      document.addEventListener('keydown', e => {
        for (const algo of SimRegistry.all()) {
          if (e.key === algo.key) { selectAlgo(algo.id); return; }
        }
        if (e.key === ' ') {
          e.preventDefault();
          if (Engine.isRunning()) Engine.pause();
          else Engine.start();
          updatePlayBtn();
        }
        if (e.key === 'r' || e.key === 'R') { Engine.reset(); updatePlayBtn(); }
      });

      // canvas click
      $('main-canvas').addEventListener('click', e => {
        const rect = e.target.getBoundingClientRect();
        Engine.canvasClick(e.clientX - rect.left, e.clientY - rect.top);
      });

      // select first algo
      selectAlgo(SimRegistry.all()[0].id);
    },

    updateStats(gen, pop, fps) {
      $('stat-gen').textContent = gen.toLocaleString();
      $('stat-pop').textContent = typeof pop === 'number' ? pop.toLocaleString() : '—';
      $('stat-fps').textContent = fps;
    },
  };
})();


/* ════════════════════════════════════════════════════════════
   BACKGROUND — subtle animated star field
   ════════════════════════════════════════════════════════════ */
function initBackground(canvas) {
  const ctx  = canvas.getContext('2d');
  const stars = Array.from({length:120}, () => ({
    x: Math.random()*canvas.width, y: Math.random()*canvas.height,
    r: Math.random()*1.2+0.2, speed: Math.random()*0.15+0.02, phase: Math.random()*TAU
  }));

  let t = 0;
  (function loop() {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    t += 0.01;
    for (const s of stars) {
      const a = 0.2 + 0.15*Math.sin(t*s.speed + s.phase);
      ctx.globalAlpha = a;
      ctx.fillStyle   = '#ffffff';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(loop);
  })();
}


/* ════════════════════════════════════════════════════════════
   BOOT
   ════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  const wrap  = document.getElementById('canvas-wrap');
  const bgC   = document.getElementById('bg-canvas');
  const mainC = document.getElementById('main-canvas');

  function resize() {
    const W = wrap.clientWidth, H = wrap.clientHeight;
    bgC.width   = mainC.width  = W;
    bgC.height  = mainC.height = H;
  }

  resize();
  window.addEventListener('resize', () => { resize(); Engine.reset(); });

  initBackground(bgC);
  UI.init();
});

/* ────────────────────────────────────────────────────────────
   EXTENSION EXAMPLE (commented out)
   To add your own algorithm, copy this template and call
   SimRegistry.register(MyAlgo) anywhere after this file loads.

const MyAlgo = {
  id:     'my-algo',
  name:   'My Custom Algorithm',
  key:    '5',
  legend: [{ label: 'My Organism', color: '#ff00ff' }],
  params: [
    { id:'speed', label:'Speed', type:'range', min:1, max:10, step:0.5, value:3 },
  ],
  init(state, canvas)      { state.entities = []; },
  step(state, canvas)      { },
  draw(state, ctx, canvas) { ctx.clearRect(0,0,canvas.width,canvas.height); },
  onCanvasClick(state, cx, cy) { },
};
SimRegistry.register(MyAlgo);
──────────────────────────────────────────────────────────── */
