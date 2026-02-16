'use client';
import { useEffect, useRef } from 'react';

// Optimized Simplex noise
class SimplexNoise {
  private p: Uint8Array;
  private perm: Uint8Array;
  private permMod12: Uint8Array;

  private static readonly grad3 = new Float32Array([
    1,1,0, -1,1,0, 1,-1,0, -1,-1,0,
    1,0,1, -1,0,1, 1,0,-1, -1,0,-1,
    0,1,1, 0,-1,1, 0,1,-1, 0,-1,-1
  ]);

  private static readonly F3 = 1 / 3;
  private static readonly G3 = 1 / 6;

  constructor(seed = 42) {
    this.p = new Uint8Array(256);
    this.perm = new Uint8Array(512);
    this.permMod12 = new Uint8Array(512);

    for (let i = 0; i < 256; i++) this.p[i] = i;

    // Seeded shuffle
    let s = seed;
    for (let i = 255; i > 0; i--) {
      s = (s * 16807) % 2147483647;
      const j = s % (i + 1);
      [this.p[i], this.p[j]] = [this.p[j], this.p[i]];
    }

    for (let i = 0; i < 512; i++) {
      this.perm[i] = this.p[i & 255];
      this.permMod12[i] = this.perm[i] % 12;
    }
  }

  noise3D(x: number, y: number, z: number): number {
    const { F3, G3, grad3 } = SimplexNoise;

    const s = (x + y + z) * F3;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    const k = Math.floor(z + s);

    const t = (i + j + k) * G3;
    const x0 = x - (i - t);
    const y0 = y - (j - t);
    const z0 = z - (k - t);

    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) {
      if (y0 >= z0) { i1=1; j1=0; k1=0; i2=1; j2=1; k2=0; }
      else if (x0 >= z0) { i1=1; j1=0; k1=0; i2=1; j2=0; k2=1; }
      else { i1=0; j1=0; k1=1; i2=1; j2=0; k2=1; }
    } else {
      if (y0 < z0) { i1=0; j1=0; k1=1; i2=0; j2=1; k2=1; }
      else if (x0 < z0) { i1=0; j1=1; k1=0; i2=0; j2=1; k2=1; }
      else { i1=0; j1=1; k1=0; i2=1; j2=1; k2=0; }
    }

    const x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2*G3, y2 = y0 - j2 + 2*G3, z2 = z0 - k2 + 2*G3;
    const x3 = x0 - 1 + 3*G3, y3 = y0 - 1 + 3*G3, z3 = z0 - 1 + 3*G3;

    const ii = i & 255, jj = j & 255, kk = k & 255;

    let n = 0;

    let t0 = 0.6 - x0*x0 - y0*y0 - z0*z0;
    if (t0 > 0) {
      const gi = this.permMod12[ii + this.perm[jj + this.perm[kk]]] * 3;
      t0 *= t0;
      n += t0 * t0 * (grad3[gi]*x0 + grad3[gi+1]*y0 + grad3[gi+2]*z0);
    }

    let t1 = 0.6 - x1*x1 - y1*y1 - z1*z1;
    if (t1 > 0) {
      const gi = this.permMod12[ii+i1 + this.perm[jj+j1 + this.perm[kk+k1]]] * 3;
      t1 *= t1;
      n += t1 * t1 * (grad3[gi]*x1 + grad3[gi+1]*y1 + grad3[gi+2]*z1);
    }

    let t2 = 0.6 - x2*x2 - y2*y2 - z2*z2;
    if (t2 > 0) {
      const gi = this.permMod12[ii+i2 + this.perm[jj+j2 + this.perm[kk+k2]]] * 3;
      t2 *= t2;
      n += t2 * t2 * (grad3[gi]*x2 + grad3[gi+1]*y2 + grad3[gi+2]*z2);
    }

    let t3 = 0.6 - x3*x3 - y3*y3 - z3*z3;
    if (t3 > 0) {
      const gi = this.permMod12[ii+1 + this.perm[jj+1 + this.perm[kk+1]]] * 3;
      t3 *= t3;
      n += t3 * t3 * (grad3[gi]*x3 + grad3[gi+1]*y3 + grad3[gi+2]*z3);
    }

    return 32 * n;
  }
}

export default function AuroraBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const noise = new SimplexNoise(42);

    // Configuration
    const PIXEL_SIZE = 6;
    const TIME_SCALE = 0.00015;
    const NOISE_SCALE = 0.008;

    let width = 0;
    let height = 0;
    let cols = 0;
    let rows = 0;
    let imageData: ImageData;
    let startTime = performance.now();

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
      cols = Math.ceil(width / PIXEL_SIZE);
      rows = Math.ceil(height / PIXEL_SIZE);
      imageData = ctx.createImageData(width, height);
    };

    // FBM with fewer octaves for performance
    const fbm = (x: number, y: number, z: number): number => {
      return (
        noise.noise3D(x, y, z) * 0.5 +
        noise.noise3D(x * 2, y * 2, z * 2) * 0.25 +
        noise.noise3D(x * 4, y * 4, z * 4) * 0.125
      );
    };

    const animate = () => {
      const time = (performance.now() - startTime) * TIME_SCALE;
      const data = imageData.data;

      // Clear image data
      data.fill(0);

      // Rotation for clockwise drift
      const angle = time * 0.4;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      // Breathing effect
      const breathe = Math.sin(time * 3) * 0.08;

      for (let col = 0; col < cols; col++) {
        for (let row = 0; row < rows; row++) {
          // Normalized position (0-1)
          const nx = col / cols;
          const ny = row / rows;

          // Offset from center
          const dx = nx - 0.5;
          const dy = ny - 0.5;

          // Apply rotation
          const rx = dx * cos - dy * sin;
          const ry = dx * sin + dy * cos;

          // Noise coordinates
          const noiseX = rx * NOISE_SCALE * 150;
          const noiseY = ry * NOISE_SCALE * 150;

          // Calculate noise value
          let value = fbm(noiseX, noiseY, time * 0.8);
          value += fbm(noiseX * 0.7 + 50, noiseY * 0.7 + 50, time * 0.5) * 0.5;

          // Add breathing pulse
          const dist = Math.sqrt(dx * dx + dy * dy);
          value += breathe * (0.7 - dist);

          // Drift bias
          value += Math.sin(time * 0.6 + nx * 3) * 0.1 * (0.5 - ny);
          value += Math.cos(time * 0.5 + ny * 3) * 0.1 * (nx - 0.5);

          // Corner concentration
          const trDist = Math.sqrt((nx - 1) * (nx - 1) + ny * ny);
          const blDist = Math.sqrt(nx * nx + (ny - 1) * (ny - 1));
          value += Math.max(0, (1 - trDist * 1.5)) * 0.35;
          value += Math.max(0, (1 - blDist * 1.5)) * 0.25;

          // Smooth edge fade — clear header & footer zones, soft side edges
          const topFade = ny < 0.15 ? ny / 0.15 : 1;
          const bottomFade = ny > 0.85 ? (1 - ny) / 0.15 : 1;
          const sideFade = Math.min(
            nx < 0.08 ? nx / 0.08 : 1,
            nx > 0.92 ? (1 - nx) / 0.08 : 1,
          );
          value *= topFade * topFade * bottomFade * bottomFade * sideFade;

          // Threshold
          const threshold = 0.2;
          if (value > threshold) {
            const alpha = Math.min((value - threshold) * 2, 1) * 220;

            // Color: cyan shades matching #38BDF8
            const colorT = Math.min(1, Math.max(0, (value + 0.3)));
            const r = Math.floor(8 + colorT * 48);
            const g = Math.floor(140 + colorT * 50);
            const b = Math.floor(180 + colorT * 68);

            // Fill pixel block
            const startX = col * PIXEL_SIZE;
            const startY = row * PIXEL_SIZE;
            const endX = Math.min(startX + PIXEL_SIZE - 1, width);
            const endY = Math.min(startY + PIXEL_SIZE - 1, height);

            for (let py = startY; py < endY; py++) {
              for (let px = startX; px < endX; px++) {
                const idx = (py * width + px) * 4;
                data[idx] = r;
                data[idx + 1] = g;
                data[idx + 2] = b;
                data[idx + 3] = alpha;
              }
            }
          }
        }
      }

      ctx.putImageData(imageData, 0, 0);
      animationRef.current = requestAnimationFrame(animate);
    };

    resize();
    window.addEventListener('resize', resize);
    animate();

    return () => {
      window.removeEventListener('resize', resize);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none z-0"
      style={{ background: 'transparent' }}
    />
  );
}
