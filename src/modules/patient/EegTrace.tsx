// Background multi-channel EEG-style monitoring trace (illustrative, deterministic).
// Sweep-mode display like a bedside monitor. Rhythmic sharp-wave bursts suggest seizure activity,
// rendered restrained and low-contrast. Freezes when `frozen` becomes true.
import { useEffect, useRef } from 'react';
import { rngFor, gaussian } from '../../sim/rng';
import { prefersReducedMotion } from '../../ui/tokens';
import { useSimple } from '../../ui/simple';

const CHANNELS = ['Fp1–F7', 'F7–T3', 'T3–T5', 'T5–O1', 'Fp1–F3', 'F3–C3', 'C3–P3', 'Fz–Cz', 'Fp2–F8', 'F8–T4', 'T4–T6', 'T6–O2'];
const FS = 128; // samples / s
const WINDOW_S = 10; // seconds per sweep
const GAP_S = 0.22; // blank region ahead of the sweep cursor
const NOISE_LEN = 4096;
const BURST_PERIOD = 15; // s
const BURST_START = 2.5;
const BURST_LEN = 7;

interface Channel {
  noise: Float32Array;
  phi1: number;
  phi2: number;
  burstGain: number;
  lag: number; // s; focal channels lead
}

const channels: Channel[] = CHANNELS.map((_, i) => {
  const rand = rngFor('eeg-channel', i);
  const noise = new Float32Array(NOISE_LEN);
  let y = 0;
  let y2 = 0;
  for (let k = 0; k < NOISE_LEN * 2; k++) {
    // two-stage low-pass of white noise → smooth, EEG-like background
    y = 0.82 * y + 0.18 * gaussian(rand);
    y2 = 0.7 * y2 + 0.3 * y;
    if (k >= NOISE_LEN) noise[k - NOISE_LEN] = y2;
  }
  // Left temporal chain (1–3) is the illustrative focus; spread to neighbours with lag.
  const focal = i >= 1 && i <= 3;
  const near = i === 0 || i === 4 || i === 5;
  return {
    noise,
    phi1: rand() * Math.PI * 2,
    phi2: rand() * Math.PI * 2,
    burstGain: focal ? 1 : near ? 0.55 + rand() * 0.15 : 0.18 + rand() * 0.2,
    lag: focal ? rand() * 0.2 : near ? 0.5 + rand() * 0.4 : 1.1 + rand() * 0.8,
  };
});

const mod = (a: number, n: number) => ((a % n) + n) % n;

function sample(ch: Channel, t: number): number {
  const n = Math.floor(t * FS);
  const base =
    ch.noise[mod(n, NOISE_LEN)] * 1.6 +
    0.35 * Math.sin(2 * Math.PI * 1.4 * t + ch.phi1) +
    0.22 * Math.sin(2 * Math.PI * 0.45 * t + ch.phi2);
  const ep = mod(t - ch.lag, BURST_PERIOD) - BURST_START;
  if (ep <= 0 || ep >= BURST_LEN) return base;
  const u = ep / BURST_LEN;
  const env = Math.pow(Math.sin(Math.PI * u), 1.4);
  // frequency evolves downward through the burst (≈3.2 → 2.0 Hz)
  const phase = ep * (3.2 - 0.6 * u);
  const f = phase - Math.floor(phase);
  let w: number;
  if (f < 0.06) w = f / 0.06;
  else if (f < 0.14) w = 1 - ((f - 0.06) / 0.08) * 1.5;
  else w = -0.5 * Math.sin((Math.PI * (f - 0.14)) / 0.86);
  return base * (1 - 0.4 * env) + env * ch.burstGain * 3.0 * w;
}

/** Simulated clock shared across mounts so the trace stays continuous and stays frozen. */
let simT = 7.4;

export function EegTrace({ frozen, dimmed = false }: { frozen: boolean; dimmed?: boolean }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frozenRef = useRef(frozen);
  frozenRef.current = frozen;
  const dimRef = useRef(dimmed);
  dimRef.current = dimmed;
  const drawRef = useRef<() => void>(() => {});
  const simple = useSimple();
  const simpleRef = useRef(simple);
  simpleRef.current = simple;

  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const ctx = canvas.getContext('2d')!;
    let W = 0;
    let H = 0;
    let raf = 0;
    let last = performance.now();
    const reduced = prefersReducedMotion();

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      W = wrap.clientWidth;
      H = wrap.clientHeight;
      canvas.width = Math.max(1, Math.round(W * dpr));
      canvas.height = Math.max(1, Math.round(H * dpr));
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    };

    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      const isFrozen = frozenRef.current;
      const x0 = 78;
      const x1 = W - 18;
      const top = 96;
      const bottom = H - 24;
      const wp = x1 - x0;
      if (wp < 50 || bottom - top < 50) return;
      const rowH = (bottom - top) / CHANNELS.length;
      const amp = rowH * 0.17;

      // time grid (1 s)
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(37,53,66,0.35)';
      ctx.beginPath();
      for (let s = 0; s <= WINDOW_S; s++) {
        const x = Math.round(x0 + (s / WINDOW_S) * wp) + 0.5;
        ctx.moveTo(x, top);
        ctx.lineTo(x, bottom);
      }
      ctx.stroke();

      const cursorFrac = mod(simT, WINDOW_S) / WINDOW_S;
      ctx.font = '9px "IBM Plex Mono", monospace';
      ctx.textBaseline = 'middle';
      const traceAlpha = dimRef.current ? 0.11 : isFrozen ? 0.18 : 0.26;
      for (let c = 0; c < CHANNELS.length; c++) {
        const ch = channels[c];
        const yMid = top + rowH * (c + 0.5);
        if (!simpleRef.current) {
          ctx.fillStyle = 'rgba(93,111,124,0.55)';
          ctx.fillText(CHANNELS[c], 18, yMid);
        }
        ctx.strokeStyle = `rgba(138,156,169,${traceAlpha})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        let pen = false;
        let prevAge = -1;
        for (let x = x0; x <= x1; x += 1.5) {
          const f = (x - x0) / wp;
          const age = mod(cursorFrac - f, 1) * WINDOW_S;
          if (age > WINDOW_S - GAP_S || (prevAge >= 0 && age > prevAge + 1)) {
            pen = false;
            prevAge = age;
            if (age > WINDOW_S - GAP_S) continue;
          }
          prevAge = age;
          const y = yMid - sample(ch, simT - age) * amp;
          if (!pen) {
            ctx.moveTo(x, y);
            pen = true;
          } else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      // sweep cursor
      const cx = x0 + cursorFrac * wp;
      ctx.strokeStyle = isFrozen ? `rgba(215,111,114,${dimRef.current ? 0.14 : 0.3})` : 'rgba(231,238,244,0.16)';
      ctx.beginPath();
      ctx.moveTo(Math.round(cx) + 0.5, top);
      ctx.lineTo(Math.round(cx) + 0.5, bottom);
      ctx.stroke();

      // scale + status annotations
      if (simpleRef.current) {
        ctx.fillStyle = 'rgba(93,111,124,0.6)';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText('BRAIN ACTIVITY (ILLUSTRATIVE) · BIG BURSTS = SEIZURE', x0, bottom + 15);
        return;
      }
      ctx.fillStyle = 'rgba(93,111,124,0.6)';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText('EEG · BIPOLAR · 1 s/div · ILLUSTRATIVE TRACE', x0, bottom + 15);
      ctx.textAlign = 'right';
      ctx.fillStyle = isFrozen ? 'rgba(215,111,114,0.7)' : 'rgba(93,111,124,0.6)';
      ctx.fillText(isFrozen ? 'TRACE HELD · DECISION RECORDED' : `LIVE · ${simT.toFixed(1)} s`, x1, bottom + 15);
      ctx.textAlign = 'left';
    };

    drawRef.current = draw;
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!frozenRef.current) {
        simT += dt;
        draw();
      }
      raf = requestAnimationFrame(tick);
    };

    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();
    if (!reduced) raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  // redraw once on freeze so the held state is rendered
  useEffect(() => {
    drawRef.current();
  }, [frozen, dimmed, simple]);

  return (
    <div ref={wrapRef} className="absolute inset-0 pointer-events-none" aria-hidden>
      <canvas ref={canvasRef} className="block" />
    </div>
  );
}
