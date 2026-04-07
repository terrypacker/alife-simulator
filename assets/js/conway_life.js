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

/* ════════════════════════════════════════════════════════════
   ALGORITHM 1 — Conway's Game of Life
   ════════════════════════════════════════════════════════════ */
const ConwayLife = {
    id:   'conway',
    name: "Conway's Game of Life",
    key:  '1',
    legend: [
        { label: 'Alive',      color: '#00ffe7' },
        { label: 'Born',       color: '#ffe44f' },
        { label: 'Dying',      color: '#ff4fcb' },
    ],

    params: [
        { id:'cell_size',  label:'Cell Size',    type:'range', min:3,   max:20, step:1,   value:8 },
        { id:'birth_lo',   label:'Birth Min',    type:'range', min:1,   max:4,  step:1,   value:3 },
        { id:'birth_hi',   label:'Birth Max',    type:'range', min:1,   max:4,  step:1,   value:3 },
        { id:'survive_lo', label:'Survive Min',  type:'range', min:0,   max:8,  step:1,   value:2 },
        { id:'survive_hi', label:'Survive Max',  type:'range', min:0,   max:8,  step:1,   value:3 },
        { id:'init_fill',  label:'Init Density', type:'range', min:0.05,max:0.8,step:0.05,value:0.3 },
    ],

    _grid: null,
    _next: null,
    _cols: 0,
    _rows: 0,
    _born: null,
    _dying: null,

    init(state, canvas) {
        const cs = state.params.cell_size;
        this._cols = Math.floor(canvas.width  / cs);
        this._rows = Math.floor(canvas.height / cs);
        const n = this._cols * this._rows;
        this._grid  = new Uint8Array(n);
        this._next  = new Uint8Array(n);
        this._born  = new Uint8Array(n);
        this._dying = new Uint8Array(n);
        const fill = state.params.init_fill;
        for (let i = 0; i < n; i++) this._grid[i] = state.rng() < fill ? 1 : 0;
        state.entities = []; // not used for grid-based, but required by engine
    },

    step(state) {
        const { _cols: W, _rows: H } = this;
        const blo = state.params.birth_lo,   bhi = state.params.birth_hi;
        const slo = state.params.survive_lo, shi = state.params.survive_hi;
        this._born.fill(0); this._dying.fill(0);

        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                let n = 0;
                for (let dy = -1; dy <= 1; dy++)
                    for (let dx = -1; dx <= 1; dx++) {
                        if (!dx && !dy) continue;
                        const nx = (x+dx+W)%W, ny = (y+dy+H)%H;
                        n += this._grid[ny*W+nx];
                    }
                const alive = this._grid[y*W+x];
                const idx   = y*W+x;
                if (alive) {
                    if (n >= slo && n <= shi) { this._next[idx] = 1; }
                    else                      { this._next[idx] = 0; this._dying[idx] = 1; }
                } else {
                    if (n >= blo && n <= bhi) { this._next[idx] = 1; this._born[idx] = 1; }
                    else                      { this._next[idx] = 0; }
                }
            }
        }
        [this._grid, this._next] = [this._next, this._grid];
        state.entities = []; // population counted below
        let pop = 0;
        for (let i = 0; i < this._grid.length; i++) pop += this._grid[i];
        state._population = pop;
    },

    draw(state, ctx, canvas) {
        const cs = state.params.cell_size;
        const { _cols: W, _rows: H } = this;
        ctx.clearRect(0,0,canvas.width,canvas.height);

        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                const idx = y*W+x;
                const px  = x*cs + cs/2, py = y*cs + cs/2;
                const r   = cs * 0.4;
                if (this._born[idx])       { drawBlob(ctx, px, py, r, '#ffe44f', 0.95, 1.5); }
                else if (this._dying[idx]) { drawBlob(ctx, px, py, r, '#ff4fcb', 0.7,  1.2); }
                else if (this._grid[idx])  { drawBlob(ctx, px, py, r, '#00ffe7', 0.85, 1.3); }
            }
        }
    },

    // Called when canvas is clicked
    onCanvasClick(state, cx, cy) {
        const cs = state.params.cell_size;
        const x  = Math.floor(cx / cs);
        const y  = Math.floor(cy / cs);
        if (x < 0 || x >= this._cols || y < 0 || y >= this._rows) return;
        // paint a small glider
        const glider = [[0,1],[1,2],[2,0],[2,1],[2,2]];
        for (const [dx,dy] of glider) {
            const nx = (x+dx) % this._cols;
            const ny = (y+dy) % this._rows;
            this._grid[ny * this._cols + nx] = 1;
        }
    }
};

//Required that the main simulator.js is loaded
SimRegistry.register(ConwayLife);
