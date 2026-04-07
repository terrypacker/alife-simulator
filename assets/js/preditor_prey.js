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
   ALGORITHM 3 — Predator-Prey Ecosystem
   ════════════════════════════════════════════════════════════ */
const PredatorPrey = {
    id:   'predprey',
    name: 'Predator-Prey',
    key:  '3',
    legend: [
        { label: 'Prey',     color: '#4fff9f' },
        { label: 'Predator', color: '#ff4f4f' },
        { label: 'Food',     color: '#ffe44f' },
    ],

    params: [
        { id:'prey_count',   label:'Initial Prey',     type:'range', min:10, max:300, step:5,   value:100 },
        { id:'pred_count',   label:'Initial Predators',type:'range', min:1,  max:50,  step:1,   value:10 },
        { id:'food_rate',    label:'Food Spawn Rate',   type:'range', min:1,  max:30,  step:1,   value:8 },
        { id:'prey_speed',   label:'Prey Speed',        type:'range', min:0.5,max:4,   step:0.5, value:1.5 },
        { id:'pred_speed',   label:'Predator Speed',    type:'range', min:0.5,max:5,   step:0.5, value:2.2 },
        { id:'eat_radius',   label:'Eat Radius',        type:'range', min:5,  max:40,  step:1,   value:14 },
        { id:'prey_repro',   label:'Prey Reproduction', type:'range', min:50, max:500, step:10,  value:200 },
        { id:'pred_repro',   label:'Pred Reproduction', type:'range', min:100,max:1000,step:20,  value:400 },
        { id:'pred_starve',  label:'Pred Starve Timer',  type:'range', min:50, max:500, step:10,  value:200 },
    ],

    _food: [],

    init(state, canvas) {
        this._food = [];
        const W = canvas.width, H = canvas.height;
        state.entities = [
            ...Array.from({length: state.params.prey_count}, () => ({
                type:'prey', x:state.rng()*W, y:state.rng()*H,
                vx:(state.rng()-.5)*3, vy:(state.rng()-.5)*3,
                energy:100, age:0, id: Math.random()
            })),
            ...Array.from({length: state.params.pred_count}, () => ({
                type:'pred', x:state.rng()*W, y:state.rng()*H,
                vx:(state.rng()-.5)*3, vy:(state.rng()-.5)*3,
                energy:150, age:0, id: Math.random()
            })),
        ];
        // seed some food
        for (let i = 0; i < 50; i++)
            this._food.push({ x: state.rng()*W, y: state.rng()*H, age: 0 });
    },

    step(state, canvas) {
        const W = canvas.width, H = canvas.height;
        const { eat_radius, prey_speed, pred_speed, food_rate, prey_repro, pred_repro, pred_starve } = state.params;

        // spawn food
        if (Math.random() < food_rate / 60)
            this._food.push({ x: Math.random()*W, y: Math.random()*H, age: 0 });
        this._food = this._food.filter(f => f.age++ < 600);

        const newEntities = [];

        for (const e of state.entities) {
            if (e.type === 'prey') {
                // find nearest food
                let tf = null, tfd = Infinity;
                for (const f of this._food) {
                    const d = Math.hypot(f.x-e.x, f.y-e.y);
                    if (d < tfd) { tfd=d; tf=f; }
                }
                // flee from nearest predator
                let tp = null, tpd = Infinity;
                for (const p of state.entities) {
                    if (p.type !== 'pred') continue;
                    const d = Math.hypot(p.x-e.x, p.y-e.y);
                    if (d < tpd) { tpd=d; tp=p; }
                }

                let dx=0, dy=0;
                if (tp && tpd < 100) {
                    dx = e.x - tp.x; dy = e.y - tp.y; // flee
                } else if (tf) {
                    dx = tf.x - e.x; dy = tf.y - e.y; // seek food
                } else {
                    dx = Math.random()-.5; dy = Math.random()-.5;
                }
                const mag = Math.hypot(dx,dy)||1;
                e.vx = lerp(e.vx, (dx/mag)*prey_speed, 0.15);
                e.vy = lerp(e.vy, (dy/mag)*prey_speed, 0.15);

                // eat food
                this._food = this._food.filter(f => {
                    if (Math.hypot(f.x-e.x,f.y-e.y) < eat_radius) { e.energy += 40; return false; }
                    return true;
                });

                e.energy -= 0.3;
                e.age++;

                // reproduce
                if (e.energy > prey_repro && state.rng() < 0.02) {
                    e.energy *= 0.5;
                    newEntities.push({ type:'prey', x:e.x+(state.rng()-.5)*20, y:e.y+(state.rng()-.5)*20,
                        vx:(state.rng()-.5)*3, vy:(state.rng()-.5)*3, energy:80, age:0, id:Math.random() });
                }

            } else { // predator
                // find nearest prey
                let target = null, td = Infinity;
                for (const p of state.entities) {
                    if (p.type !== 'prey') continue;
                    const d = Math.hypot(p.x-e.x, p.y-e.y);
                    if (d < td) { td=d; target=p; }
                }
                if (target) {
                    const dx = target.x-e.x, dy = target.y-e.y;
                    const mag = Math.hypot(dx,dy)||1;
                    e.vx = lerp(e.vx, (dx/mag)*pred_speed, 0.12);
                    e.vy = lerp(e.vy, (dy/mag)*pred_speed, 0.12);
                    // eat prey
                    if (td < eat_radius) { target._eaten = true; e.energy += 120; }
                }
                e.energy -= 0.6;
                e.age++;
                // reproduce
                if (e.energy > pred_repro && state.rng() < 0.01) {
                    e.energy *= 0.5;
                    newEntities.push({ type:'pred', x:e.x+(state.rng()-.5)*20, y:e.y+(state.rng()-.5)*20,
                        vx:(state.rng()-.5)*3, vy:(state.rng()-.5)*3, energy:150, age:0, id:Math.random() });
                }
            }

            // move
            e.x = ((e.x + e.vx) + W) % W;
            e.y = ((e.y + e.vy) + H) % H;
        }

        // cull dead
        state.entities = state.entities.filter(e => e.energy > 0 && !e._eaten && e.age < pred_starve * 3);
        state.entities.push(...newEntities);
        // hard cap
        if (state.entities.filter(e=>e.type==='prey').length > 600) {
            const preyList = state.entities.filter(e=>e.type==='prey');
            preyList.sort((a,b)=>a.energy-b.energy);
            const cut = preyList.slice(0, preyList.length - 400);
            state.entities = state.entities.filter(e => !cut.includes(e));
        }
        state._population = state.entities.length;
    },

    draw(state, ctx, canvas) {
        ctx.clearRect(0,0,canvas.width,canvas.height);

        // draw food
        for (const f of this._food) {
            drawBlob(ctx, f.x, f.y, 3, '#ffe44f', 0.6, 1.2);
        }

        // draw organisms
        for (const e of state.entities) {
            if (e.type === 'prey') {
                const health = clamp(e.energy / 200, 0.2, 1);
                drawBlob(ctx, e.x, e.y, 4 + health*2, '#4fff9f', health * 0.85, 1.4);
            } else {
                const hunger = clamp(1 - e.energy / 300, 0, 1);
                const color  = hunger > 0.5 ? '#ff8f4f' : '#ff4f4f';
                drawBlob(ctx, e.x, e.y, 6, color, 0.9, 1.6 + hunger);
            }
        }
    },

    onCanvasClick(state, cx, cy) {
        for (let i = 0; i < 8; i++) {
            state.entities.push({
                type:'prey', x:cx+(Math.random()-.5)*40, y:cy+(Math.random()-.5)*40,
                vx:(Math.random()-.5)*3, vy:(Math.random()-.5)*3, energy:100, age:0, id:Math.random()
            });
        }
    }
};

//Required that the main simulator.js is loaded
SimRegistry.register(PredatorPrey);
