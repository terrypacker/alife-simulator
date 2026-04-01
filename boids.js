/* ════════════════════════════════════════════════════════════
   ALGORITHM 2 — Boids (Flocking)
   ════════════════════════════════════════════════════════════ */
const Boids = {
    id:   'boids',
    name: 'Boids Flocking',
    key:  '2',
    legend: [
        { label: 'Boid',        color: '#00ffe7' },
        { label: 'Neighbor',    color: '#4f9fff' },
        { label: 'Velocity',    color: '#ffe44f' },
    ],

    params: [
        { id:'count',        label:'Boid Count',      type:'range', min:10, max:400, step:10,  value:120 },
        { id:'speed',        label:'Max Speed',        type:'range', min:1,  max:8,   step:0.5, value:3 },
        { id:'sep_r',        label:'Separation Radius',type:'range', min:10, max:80,  step:5,   value:25 },
        { id:'ali_r',        label:'Alignment Radius', type:'range', min:20, max:150, step:5,   value:60 },
        { id:'coh_r',        label:'Cohesion Radius',  type:'range', min:20, max:200, step:5,   value:80 },
        { id:'sep_f',        label:'Separation Force', type:'range', min:0,  max:3,   step:0.1, value:1.5 },
        { id:'ali_f',        label:'Alignment Force',  type:'range', min:0,  max:3,   step:0.1, value:1.0 },
        { id:'coh_f',        label:'Cohesion Force',   type:'range', min:0,  max:3,   step:0.1, value:1.0 },
        { id:'show_debug',   label:'Show Radius',      type:'select',value:'off', options:[{v:'on',l:'On'},{v:'off',l:'Off'}] },
    ],

    init(state, canvas) {
        const count = state.params.count;
        state.entities = Array.from({length: count}, () => ({
            x:  state.rng() * canvas.width,
            y:  state.rng() * canvas.height,
            vx: (state.rng()-0.5) * 4,
            vy: (state.rng()-0.5) * 4,
            age: 0,
        }));
    },

    step(state, canvas) {
        const { sep_r, ali_r, coh_r, sep_f, ali_f, coh_f, speed } = state.params;
        const W = canvas.width, H = canvas.height;
        const boids = state.entities;

        for (const b of boids) {
            let sx=0,sy=0, ax=0,ay=0, cx=0,cy=0;
            let ns=0, na=0, nc=0;

            for (const o of boids) {
                if (o === b) continue;
                const dx = o.x - b.x, dy = o.y - b.y;
                const d  = Math.hypot(dx,dy);
                if (d < sep_r) { sx -= dx/d; sy -= dy/d; ns++; }
                if (d < ali_r) { ax += o.vx;  ay += o.vy;  na++; }
                if (d < coh_r) { cx += o.x;   cy += o.y;   nc++; }
            }

            let fx=0, fy=0;
            if (ns) { fx += (sx/ns)*sep_f; fy += (sy/ns)*sep_f; }
            if (na) { const mag = Math.hypot(ax,ay)||1; fx += (ax/na/mag)*ali_f; fy += (ay/na/mag)*ali_f; }
            if (nc) { fx += ((cx/nc - b.x)/100)*coh_f; fy += ((cy/nc - b.y)/100)*coh_f; }

            b.vx += fx * 0.1;
            b.vy += fy * 0.1;
            const spd = Math.hypot(b.vx, b.vy);
            if (spd > speed) { b.vx = b.vx/spd*speed; b.vy = b.vy/spd*speed; }
            if (spd < 0.5)   { b.vx *= 1.1; b.vy *= 1.1; }

            b.x = ((b.x + b.vx) + W) % W;
            b.y = ((b.y + b.vy) + H) % H;
            b.age++;
        }
        state._population = boids.length;
    },

    draw(state, ctx, canvas) {
        ctx.clearRect(0,0,canvas.width,canvas.height);
        const debug = state.params.show_debug === 'on';

        for (const b of state.entities) {
            const spd  = Math.hypot(b.vx,b.vy);
            const norm = spd / (state.params.speed||3);

            // velocity trail
            ctx.save();
            ctx.strokeStyle = '#ffe44f55';
            ctx.lineWidth   = 1;
            ctx.beginPath();
            ctx.moveTo(b.x, b.y);
            ctx.lineTo(b.x - b.vx*4, b.y - b.vy*4);
            ctx.stroke();
            ctx.restore();

            // optional radius ring
            if (debug) {
                ctx.save();
                ctx.strokeStyle = '#4f9fff18';
                ctx.lineWidth   = 1;
                ctx.beginPath();
                ctx.arc(b.x, b.y, state.params.ali_r, 0, TAU);
                ctx.stroke();
                ctx.restore();
            }

            // body blob — hue shifts with speed
            const r = clamp(3 + norm*2, 3, 6);
            drawBlob(ctx, b.x, b.y, r, '#00ffe7', 0.8 + norm*0.15, 1.5);
        }
    },

    onCanvasClick(state, cx, cy) {
        for (let i = 0; i < 10; i++) {
            state.entities.push({
                x: cx + (Math.random()-0.5)*30,
                y: cy + (Math.random()-0.5)*30,
                vx: (Math.random()-0.5)*4,
                vy: (Math.random()-0.5)*4,
                age: 0,
            });
        }
    }
};

//Required that the main simulator.js is loaded
SimRegistry.register(Boids);
