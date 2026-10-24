// Interactive protein-landscape canvas: d3-zoom horizontal zoom/pan, semantic zoom levels,
// hover/selection hit-testing, minimap scrubbing, animated focus.
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as d3 from 'd3';
import { Maximize2 } from 'lucide-react';
import { SCN2A_LENGTH, regionAt } from '../../data/published';
import { Segmented, cx } from '../../ui/primitives';
import { MECH_COLOR, MECH_LABEL, prefersReducedMotion } from '../../ui/tokens';
import { type AtlasIndex, EVIDENCE_LABEL, EVIDENCE_LEVELS, MECHS, lowerBound, regionOf, shortId } from './atlasData';
import { type HoverTarget, type Layout, MIN_SPAN, binResFor, computeLayout, draw, levelOf, markXY } from './atlasDraw';

export interface AtlasCanvasHandle {
  focusRange: (a: number, b: number, opts?: { duration?: number; minSpan?: number }) => void;
  focusResidue: (p: number, span?: number) => void;
  reset: () => void;
}

interface Props {
  index: AtlasIndex;
  mask: Uint8Array | null;
  hidden: Set<number>;
  selected: number;
  onSelect: (i: number) => void;
}

/** Viewport persisted across mounts (module navigation). */
let savedDomain: [number, number] | null = null;

const FULL: [number, number] = [0.5, SCN2A_LENGTH + 0.5];

export const AtlasCanvas = forwardRef<AtlasCanvasHandle, Props>(function AtlasCanvas({ index, mask, hidden, selected, onSelect }, ref) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const layoutRef = useRef<Layout>(computeLayout(800, 600));
  const x0Ref = useRef(d3.scaleLinear().domain(FULL).range([0, 1]));
  const tRef = useRef<d3.ZoomTransform>(d3.zoomIdentity);
  const zoomRef = useRef<d3.ZoomBehavior<HTMLCanvasElement, unknown> | null>(null);
  const hoverRef = useRef<HoverTarget | null>(null);
  const propsRef = useRef({ mask, hidden, selected });
  propsRef.current = { mask, hidden, selected };
  const rafRef = useRef(0);
  const panningRef = useRef(false);
  const scrubRef = useRef(false);
  const [view, setView] = useState<[number, number]>(savedDomain ?? FULL);
  const [hover, setHover] = useState<HoverTarget | null>(null);

  const xs = () => tRef.current.rescaleX(x0Ref.current);

  const render = useCallback(() => {
    rafRef.current = 0;
    const ctx = ctxRef.current;
    if (!ctx) return;
    const p = propsRef.current;
    draw(ctx, { xs: xs(), x0: x0Ref.current, index, mask: p.mask, hidden: p.hidden, selected: p.selected, hover: hoverRef.current, layout: layoutRef.current });
  }, [index]);

  const schedule = useCallback(() => {
    if (!rafRef.current) rafRef.current = requestAnimationFrame(render);
  }, [render]);

  const transformFor = useCallback((a: number, b: number) => {
    const Lo = layoutRef.current;
    const x0 = x0Ref.current;
    const k = (x0(FULL[1]) - x0(FULL[0])) / (x0(b) - x0(a));
    return d3.zoomIdentity.translate(Lo.L - k * x0(a), 0).scale(k);
  }, []);

  const applyRange = useCallback(
    (a: number, b: number, duration: number) => {
      const canvas = canvasRef.current;
      const zoom = zoomRef.current;
      if (!canvas || !zoom) return;
      const t = transformFor(a, b);
      const sel = d3.select(canvas);
      if (duration <= 0 || prefersReducedMotion()) {
        sel.interrupt();
        sel.call(zoom.transform, t);
      } else sel.transition().duration(duration).ease(d3.easeCubicInOut).call(zoom.transform, t);
    },
    [transformFor],
  );

  const clampRange = (a: number, b: number, minSpan = MIN_SPAN): [number, number] => {
    let lo = Math.min(a, b);
    let hi = Math.max(a, b);
    if (hi - lo < minSpan) {
      const c = (lo + hi) / 2;
      lo = c - minSpan / 2;
      hi = c + minSpan / 2;
    }
    const span = Math.min(SCN2A_LENGTH, hi - lo);
    if (lo < FULL[0]) lo = FULL[0];
    if (lo + span > FULL[1]) lo = FULL[1] - span;
    return [lo, lo + span];
  };

  useImperativeHandle(
    ref,
    () => ({
      focusRange: (a, b, opts = {}) => {
        const [lo, hi] = clampRange(a, b, opts.minSpan ?? MIN_SPAN);
        applyRange(lo, hi, opts.duration ?? 900);
      },
      focusResidue: (p, span = 64) => {
        const [lo, hi] = clampRange(p - span / 2, p + span / 2, span);
        applyRange(lo, hi, 1100);
      },
      reset: () => applyRange(FULL[0], FULL[1], 750),
    }),
    [applyRange],
  );

  // ── setup: canvas sizing, zoom behaviour
  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    ctxRef.current = canvas.getContext('2d');
    const zoom = d3
      .zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([1, SCN2A_LENGTH / MIN_SPAN])
      .filter((ev: Event) => {
        const e = ev as MouseEvent & WheelEvent;
        if (e.type === 'wheel') return Math.abs(e.deltaX) <= Math.abs(e.deltaY);
        if (e.type === 'mousedown') {
          const Lo = layoutRef.current;
          if (e.offsetY >= Lo.map.y0 - 2) return false;
        }
        return !e.ctrlKey && !e.button;
      })
      .on('start', (ev: d3.D3ZoomEvent<HTMLCanvasElement, unknown>) => {
        if (ev.sourceEvent && ev.sourceEvent.type === 'mousedown') panningRef.current = true;
      })
      .on('zoom', (ev: d3.D3ZoomEvent<HTMLCanvasElement, unknown>) => {
        tRef.current = ev.transform;
        const d = xs().domain() as [number, number];
        savedDomain = d;
        setView(d);
        schedule();
      })
      .on('end', () => {
        panningRef.current = false;
      });
    zoomRef.current = zoom;
    const sel = d3.select(canvas);
    sel.call(zoom).on('dblclick.zoom', null);

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const W = wrap.clientWidth;
      const H = wrap.clientHeight;
      canvas.width = Math.max(1, Math.round(W * dpr));
      canvas.height = Math.max(1, Math.round(H * dpr));
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      ctxRef.current?.setTransform(dpr, 0, 0, dpr, 0, 0);
      const Lo = computeLayout(W, H);
      layoutRef.current = Lo;
      x0Ref.current = d3.scaleLinear().domain(FULL).range([Lo.L, Lo.R]);
      zoom.extent([[Lo.L, 0], [Lo.R, H]]).translateExtent([[Lo.L, 0], [Lo.R, H]]);
      const keep = savedDomain ?? FULL;
      sel.interrupt();
      sel.call(zoom.transform, transformFor(keep[0], keep[1]));
      render();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();

    // horizontal trackpad scroll pans
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        e.preventDefault();
        sel.call(zoom.translateBy, -e.deltaX / tRef.current.k, 0);
      }
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      ro.disconnect();
      canvas.removeEventListener('wheel', onWheel);
      sel.on('.zoom', null);
      sel.interrupt();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    schedule();
  }, [mask, hidden, selected, schedule]);

  // ── hit testing
  const hitTest = (mx: number, my: number): HoverTarget | null => {
    const Lo = layoutRef.current;
    if (mx < Lo.L || mx > Lo.R) return null;
    const scale = xs();
    const [d0, d1] = scale.domain();
    const span = d1 - d0;
    const res = Math.round(scale.invert(mx));
    const s = { xs: scale, x0: x0Ref.current, index, mask, hidden, selected, hover: null, layout: Lo };
    if (my >= Lo.topo.y0 + 16 && my <= Lo.topo.y1) return { kind: 'region', region: regionAt(res) };
    if (my >= Lo.main.y0 && my <= Lo.meas.y1) {
      // patient marks first
      for (const i of index.patientIdx) {
        const [x, y] = markXY(s, i);
        if (Math.abs(x - mx) < 8 && (Math.abs(y - my) < 8 || my > Lo.meas.y0)) return { kind: 'variant', i };
      }
      const inMeas = my >= Lo.meas.y0;
      const marksOn = span < 640;
      if ((inMeas && span < 150) || (!inMeas && marksOn)) {
        const lo = lowerBound(index.pos, Math.floor(scale.invert(mx - 14)));
        const hi = lowerBound(index.pos, Math.ceil(scale.invert(mx + 14)) + 1);
        let best = -1;
        let bd = inMeas ? 8 : 7;
        for (let i = lo; i < hi; i++) {
          const [x, y] = markXY(s, i);
          const dist = inMeas ? Math.abs(x - mx) : Math.hypot(x - mx, y - my);
          if (dist < bd) {
            bd = dist;
            best = i;
          }
        }
        if (best >= 0) return { kind: 'variant', i: best };
        if (inMeas) return null;
      }
      if (!inMeas && span >= 300) {
        const binRes = binResFor(span, Lo.R - Lo.L);
        const a = Math.floor((res - 1) / binRes) * binRes + 1;
        const b = Math.min(SCN2A_LENGTH, a + binRes - 1);
        const counts = [0, 0, 0, 0];
        for (let i = lowerBound(index.pos, a); i < index.n && index.pos[i] <= b; i++) {
          if (mask && !mask[i]) continue;
          if (hidden.has(i)) continue;
          counts[index.mech[i]]++;
        }
        return { kind: 'bin', a, b, counts };
      }
    }
    return null;
  };

  const sameHover = (a: HoverTarget | null, b: HoverTarget | null) =>
    a === b ||
    (!!a && !!b && a.kind === b.kind && (a.kind === 'variant' ? a.i === (b as typeof a).i : a.kind === 'bin' ? a.a === (b as typeof a).a : a.region.id === (b as typeof a).region.id));

  const scrubTo = (mx: number) => {
    const Lo = layoutRef.current;
    const [d0, d1] = xs().domain();
    const span = d1 - d0;
    const c = x0Ref.current.invert(Math.max(Lo.L, Math.min(Lo.R, mx)));
    const [lo, hi] = clampRange(c - span / 2, c + span / 2, span);
    applyRange(lo, hi, 0);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    if (scrubRef.current) {
      scrubTo(mx);
      return;
    }
    const Lo = layoutRef.current;
    const h = panningRef.current ? null : hitTest(mx, my);
    if (!sameHover(h, hoverRef.current)) {
      hoverRef.current = h;
      setHover(h);
      schedule();
    }
    const tip = tipRef.current;
    if (tip && h) {
      const tw = tip.offsetWidth;
      const left = mx + 14 + tw > Lo.W ? mx - 14 - tw : mx + 14;
      tip.style.transform = `translate(${Math.max(4, left)}px, ${Math.max(4, my - 10)}px)`;
    }
    e.currentTarget.style.cursor = my >= Lo.map.y0 - 2 ? 'ew-resize' : h ? 'pointer' : panningRef.current ? 'grabbing' : 'grab';
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const my = e.clientY - r.top;
    if (my >= layoutRef.current.map.y0 - 2 && e.button === 0) {
      scrubRef.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      scrubTo(e.clientX - r.left);
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (scrubRef.current) {
      scrubRef.current = false;
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const h = hitTest(e.clientX - r.left, e.clientY - r.top);
    if (!h) return;
    if (h.kind === 'variant') onSelect(h.i);
    else if (h.kind === 'bin') {
      const c = (h.a + h.b) / 2;
      applyRange(...clampRange(c - 110, c + 110), 750);
    } else if (h.kind === 'region') {
      const pad = Math.max(6, (h.region.end - h.region.start) * 0.35);
      applyRange(...clampRange(h.region.start - pad, h.region.end + pad, 40), 750);
    }
  };

  const onLeave = () => {
    if (hoverRef.current) {
      hoverRef.current = null;
      setHover(null);
      schedule();
    }
  };

  const span = view[1] - view[0];
  const level = levelOf(span);
  const zoomTo = (lvl: string) => {
    const c = (view[0] + view[1]) / 2;
    const target = lvl === 'LANDSCAPE' ? SCN2A_LENGTH : lvl === 'VARIANTS' ? 320 : 64;
    const sel = selected >= 0 && lvl !== 'LANDSCAPE' && index.pos[selected] >= view[0] && index.pos[selected] <= view[1] ? index.pos[selected] : c;
    applyRange(...clampRange(sel - target / 2, sel + target / 2, target), 750);
  };

  return (
    <div data-tour="atlas.canvas" className="absolute inset-0 flex flex-col">
      <div className="h-9 shrink-0 flex items-center gap-3 px-3 border-b border-line2 bg-bg">
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-mute whitespace-nowrap">Mechanism landscape</span>
        <span className="font-mono text-2xs text-dim whitespace-nowrap hidden xl:inline">SCN2A · NaV1.2 · Q99250</span>
        <div className="flex-1" />
        <Segmented
          value={level}
          onChange={zoomTo}
          options={[
            { value: 'LANDSCAPE', label: 'Landscape', title: 'Binned density per mechanism class' },
            { value: 'VARIANTS', label: 'Variants', title: 'Individual records · position × net classifier score' },
            { value: 'MEASUREMENTS', label: 'Measurements', title: 'Per-variant synthetic measurements ± SE' },
          ]}
        />
        <span className="font-mono text-2xs text-mute tabular-nums whitespace-nowrap min-w-[150px] text-right">
          RES {Math.max(1, Math.ceil(view[0])).toLocaleString('en-US')}–{Math.min(SCN2A_LENGTH, Math.floor(view[1])).toLocaleString('en-US')} · {Math.round(span)} aa
        </span>
        <button onClick={() => applyRange(FULL[0], FULL[1], 750)} title="Reset view" className="h-6 w-6 flex items-center justify-center border border-line rounded text-mute hover:text-ink hover:border-mute/60">
          <Maximize2 size={12} strokeWidth={1.5} />
        </button>
      </div>
      <div ref={wrapRef} className="relative flex-1 min-h-0">
        <canvas
          ref={canvasRef}
          className="block select-none touch-none"
          onPointerMove={onPointerMove}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerLeave={onLeave}
          onClick={onClick}
        />
        <div ref={tipRef} className={cx('absolute left-0 top-0 z-20 pointer-events-none', !hover && 'hidden')}>
          {hover && <Tooltip h={hover} index={index} hidden={hidden} />}
        </div>
      </div>
    </div>
  );
});

function Tooltip({ h, index, hidden }: { h: HoverTarget; index: AtlasIndex; hidden: Set<number> }) {
  const box = 'bg-surface2 border border-line rounded px-2 py-1.5 font-mono text-2xs text-ink whitespace-nowrap shadow-[0_6px_18px_rgba(0,0,0,0.45)]';
  if (h.kind === 'variant') {
    const v = index.variants[h.i];
    const r = regionOf(index, h.i);
    const known = !hidden.has(h.i);
    const m = MECHS[index.mech[h.i]];
    return (
      <div className={box}>
        <div className="flex items-center gap-2">
          <span>{shortId(v.id)}</span>
          {v.patientIds.length > 0 && <span className="text-cyan">{v.patientIds.join(' ')}</span>}
        </div>
        <div className="text-mute">{v.hgvsP} · {r?.label}</div>
        {known ? (
          <div style={{ color: MECH_COLOR[m] }}>
            {MECH_LABEL[m]} · net {index.net[h.i] >= 0 ? '+' : '−'}
            {Math.abs(index.net[h.i]).toFixed(2)}
          </div>
        ) : (
          <div className="text-mute">Mechanism not yet characterized</div>
        )}
        <div className="text-dim">{EVIDENCE_LABEL[EVIDENCE_LEVELS[Math.min(2, index.ev[h.i])]]}</div>
      </div>
    );
  }
  if (h.kind === 'bin') {
    const total = h.counts.reduce((a, b) => a + b, 0);
    return (
      <div className={box}>
        <div>
          RES {h.a}–{h.b} · {total} records
        </div>
        <div className="flex gap-2 mt-0.5">
          {MECHS.map((m, k) => (
            <span key={m} style={{ color: MECH_COLOR[m] }}>
              {m === 'indeterminate' ? 'ind' : m} {h.counts[k]}
            </span>
          ))}
        </div>
        <div className="text-dim">{regionAt(Math.round((h.a + h.b) / 2)).label} · click to zoom</div>
      </div>
    );
  }
  const r = h.region;
  let n = 0;
  for (let i = lowerBound(index.pos, r.start); i < index.n && index.pos[i] <= r.end; i++) n++;
  return (
    <div className={box}>
      <div>{r.label}</div>
      <div className="text-mute">
        res {r.start}–{r.end} · {r.topology}
      </div>
      <div className="text-dim">
        {n} atlas records · UniProt Q99250 · click to frame
      </div>
    </div>
  );
}
