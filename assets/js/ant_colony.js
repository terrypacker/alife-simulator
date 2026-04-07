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
   ALGORITHM 4 — Ant Colony / Slime Mold
   ════════════════════════════════════════════════════════════ */
AntColony = {
    id:   'ants',
    name: 'Ant Colony / Slime Mold',
    key:  '4',
    legend: [
        { label: 'Ant',           color: '#ff9f4f' },
        { label: 'Pheromone',     color: '#00ffe7' },
        { label: 'Food Source',   color: '#ffe44f' },
    ],

    params: [
        { id:'ant_count',   label:'Ant Count',        type:'range', min:20, max:500, step:10,  value:150 },
        { id:'ant_speed',   label:'Ant Speed',         type:'range', min:0.5,max:4,   step:0.5, value:1.8 },
        { id:'sense_angle', label:'Sensor Angle (°)',  type:'range', min:5,  max:90,  step:5,   value:45 },
        { id:'sense_dist',  label:'Sensor Distance',   type:'range', min:5,  max:40,  step:1,   value:12 },
        { id:'turn_speed',  label:'Turn Speed',         type:'range', min:1,  max:45,  step:1,   value:25 },
        { id:'phero_dep',   label:'Pheromone Deposit', type:'range', min:1,  max:30,  step:1,   value:10 },
        { id:'phero_decay', label:'Pheromone Decay',   type:'range', min:0.97,max:0.9999,step:0.001,value:0.992 },
        { id:'diffuse',     label:'Diffusion',          type:'range', min:0,  max:1,   step:0.05,value:0.3 },
        { id:'food_count',  label:'Food Sources',      type:'range', min:1,  max:10,  step:1,   value:4 },
    ],

    _phero:  null,
    _phero2: null,
    _food:   [],
    _W: 0, _H: 0,

    init(state, canvas) {
        this._W = Math.floor(canvas.width  / 2);
        this._H = Math.floor(canvas.height / 2);
        const n = this._W * this._H;
        this._phero  = new Float32Array(n);
        this._phero2 = new Float32Array(n);

        // place food
        this._food = [];
        const fc = state.params.food_count;
        for (let i = 0; i < fc; i++) {
            this._food.push({
                x: state.rng() * this._W,
                y: state.rng() * this._H,
                amount: 5000
            });
        }

        const cx = this._W/2, cy = this._H/2;
        state.entities = Array.from({length: state.params.ant_count}, (_, i) => ({
            x:  cx + (state.rng()-.5)*30,
            y:  cy + (state.rng()-.5)*30,
            angle: state.rng() * TAU,
            hasFood: false,
            age: 0,
        }));
    },

    _sense(x, y, angle, dist) {
        const sx = Math.round(x + Math.cos(angle)*dist);
        const sy = Math.round(y + Math.sin(angle)*dist);
        if (sx<0||sy<0||sx>=this._W||sy>=this._H) return 0;
        return this._phero[sy*this._W+sx];
    },

    _deposit(x, y, amount) {
        const xi = Math.round(x), yi = Math.round(y);
        if (xi<0||yi<0||xi>=this._W||yi>=this._H) return;
        this._phero[yi*this._W+xi] = Math.min(255, this._phero[yi*this._W+xi] + amount);
    },

    step(state, canvas) {
        const W = this._W, H = this._H;
        const { ant_speed, sense_angle, sense_dist, turn_speed, phero_dep, phero_decay, diffuse } = state.params;
        const sa = (sense_angle / 180) * Math.PI;
        const ts = (turn_speed  / 180) * Math.PI;

        // diffuse + decay pheromone
        const p = this._phero, p2 = this._phero2;
        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                let sum = 0, cnt = 0;
                for (let dy=-1;dy<=1;dy++) for (let dx=-1;dx<=1;dx++) {
                    const nx=x+dx,ny=y+dy;
                    if (nx>=0&&ny>=0&&nx<W&&ny<H) { sum+=p[ny*W+nx]; cnt++; }
                }
                p2[y*W+x] = (p[y*W+x]*(1-diffuse) + (sum/cnt)*diffuse) * phero_decay;
            }
        }
        this._phero.set(p2);

        for (const a of state.entities) {
            // sense
            const fl = this._sense(a.x, a.y, a.angle - sa, sense_dist);
            const fc = this._sense(a.x, a.y, a.angle,       sense_dist);
            const fr = this._sense(a.x, a.y, a.angle + sa,  sense_dist);

            if (fc > fl && fc > fr) { /* continue */ }
            else if (fl > fr) { a.angle -= ts; }
            else if (fr > fl) { a.angle += ts; }
            else { a.angle += (Math.random()-.5)*ts*2; }

            // move
            a.x += Math.cos(a.angle) * ant_speed;
            a.y += Math.sin(a.angle) * ant_speed;

            // bounce
            if (a.x < 0) { a.x=0; a.angle = Math.PI - a.angle; }
            if (a.y < 0) { a.y=0; a.angle = -a.angle; }
            if (a.x >= W) { a.x=W-1; a.angle = Math.PI - a.angle; }
            if (a.y >= H) { a.y=H-1; a.angle = -a.angle; }

            // food interaction
            let atFood = false;
            for (const f of this._food) {
                if (f.amount > 0 && Math.hypot(a.x-f.x, a.y-f.y) < 8) {
                    a.hasFood = true; atFood = true;
                    f.amount = Math.max(0, f.amount - 1);
                    a.angle += Math.PI + (Math.random()-.5)*0.4;
                    break;
                }
            }

            // deposit pheromone
            this._deposit(a.x, a.y, a.hasFood ? phero_dep * 2 : phero_dep * 0.5);
            a.age++;

            // if carrying food, head back (weakly toward center)
            if (a.hasFood && !atFood) {
                const homeX = W/2, homeY = H/2;
                const toHome = Math.atan2(homeY-a.y, homeX-a.x);
                const diff   = toHome - a.angle;
                a.angle += Math.sin(diff) * 0.05;
                if (Math.hypot(a.x-homeX, a.y-homeY) < 15) a.hasFood = false;
            }
        }
        state._population = state.entities.length;
    },

    draw(state, ctx, canvas) {
        const W = this._W, H = this._H;
        ctx.clearRect(0,0,canvas.width,canvas.height);

        // draw pheromone layer via offscreen logic
        const imgData = ctx.createImageData(canvas.width, canvas.height);
        const scaleX  = canvas.width  / W;
        const scaleY  = canvas.height / H;

        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                const v = Math.min(255, this._phero[y*W+x] * 2);
                if (v < 2) continue;
                const px = Math.floor(x*scaleX), py = Math.floor(y*scaleY);
                const pw = Math.ceil(scaleX),    ph = Math.ceil(scaleY);
                for (let dy=0;dy<ph;dy++) for (let dx=0;dx<pw;dx++) {
                    const idx = ((py+dy)*canvas.width + (px+dx))*4;
                    imgData.data[idx]   = Math.min(255, imgData.data[idx]   + Math.floor(v*0.0));
                    imgData.data[idx+1] = Math.min(255, imgData.data[idx+1] + Math.floor(v*1.0));
                    imgData.data[idx+2] = Math.min(255, imgData.data[idx+2] + Math.floor(v*0.9));
                    imgData.data[idx+3] = Math.min(255, imgData.data[idx+3] + Math.floor(v*0.8));
                }
            }
        }
        ctx.putImageData(imgData, 0, 0);

        // draw food
        for (const f of this._food) {
            if (f.amount > 0) {
                const alpha = clamp(f.amount/5000, 0.2, 1);
                drawBlob(ctx, f.x*scaleX, f.y*scaleY, 10*alpha+5, '#ffe44f', alpha, 1.5);
            }
        }

        // draw ants
        for (const a of state.entities) {
            const col = a.hasFood ? '#ffe44f' : '#ff9f4f';
            drawBlob(ctx, a.x*scaleX, a.y*scaleY, 2.5, col, 0.9, 1.2);
        }
    },

    onCanvasClick(state, cx, cy) {
        const scaleX = this._W / (cx > 0 ? state._canvasW : 1);
        // add food source at click
        this._food.push({ x: cx / (state._canvasW  / this._W),
            y: cy / (state._canvasH / this._H),
            amount: 3000 });
    }
};

//Required that the main simulator.js is loaded
SimRegistry.register(AntColony);
