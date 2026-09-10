/* ============================================================
   JUICE HELPER 2 - PARTICLES
   A fixed pool of dots drawn as short streaks along their own
   velocity. Stepped in the main loop next to everything else -
   no separate system, no assets, no allocation after boot.
   ============================================================ */

const PARTICLE_MAX = 96;

interface Particle {
  life: number; max: number;
  x: number; y: number; vx: number; vy: number;
  r: number; color: string;
}

export class ParticleSystem {
  private pool: Particle[] = [];
  private slot = 0;

  constructor(private stepMs: number) {
    for (let i = 0; i < PARTICLE_MAX; i++)
      this.pool.push({ life: 0, max: 1, x: 0, y: 0, vx: 0, vy: 0, r: 1, color: '#fff' });
  }

  /** Fan `n` particles out of (x,y), biased along the (nx,ny) direction.
      spread is the half-angle of the fan in radians; speed is px per step. */
  burst(x: number, y: number, nx: number, ny: number, color: string,
        n: number, speed: number, spread: number, lifeMs: number): void {
    const base = Math.atan2(ny, nx);
    for (let i = 0; i < n; i++) {
      const p = this.pool[this.slot];
      this.slot = (this.slot + 1) % PARTICLE_MAX;
      const a = base + (Math.random() * 2 - 1) * spread;
      const v = speed * (0.45 + Math.random() * 0.75);
      p.x = x; p.y = y;
      p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v;
      p.max = p.life = lifeMs * (0.7 + Math.random() * 0.6);
      p.r = 1 + Math.random() * 1.4;
      p.color = color;
    }
  }

  clear(): void { for (const p of this.pool) p.life = 0; }

  /** How many are currently alive - for the test hook. */
  get live(): number { return this.pool.reduce((n, p) => n + (p.life > 0 ? 1 : 0), 0); }

  update(dt: number): void {
    const f = dt / this.stepMs;              // dt expressed in physics steps
    for (const p of this.pool) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.x += p.vx * f; p.y += p.vy * f;
      p.vy += 0.22 * f;                      // the same world pulls on them
      p.vx *= 0.94; p.vy *= 0.94;            // and the same air slows them
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.lineCap = 'round';
    for (const p of this.pool) {
      if (p.life <= 0) continue;
      const k = p.life / p.max;              // 1 at birth, 0 at death
      ctx.globalAlpha = k * k * 0.85;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = p.r * k;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 1.6, p.y - p.vy * 1.6);
      ctx.stroke();
    }
    ctx.restore();
  }
}
