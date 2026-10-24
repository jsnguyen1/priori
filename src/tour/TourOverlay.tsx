// Guided demo overlay: dims the workspace except the spotlighted control, explains it in plain
// English, and advances only when the app state shows the step was really done.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Check, ChevronLeft, MousePointerClick, Wand2, X } from 'lucide-react';
import { useStore } from '../state/store';
import { useTour } from './tourStore';
import { CHAPTERS, STEPS } from './steps';
import type { TourStep } from './types';
import { MODULES } from '../shell/NavRail';
import { cx } from '../ui/primitives';
import { MOTION, prefersReducedMotion } from '../ui/tokens';

const CARD_W = 372;
const PAD = 6;
const GAP = 14;

interface Rect { x: number; y: number; w: number; h: number }

/** Track the on-screen rectangle of a [data-tour] element (null when not rendered). */
function useTargetRect(id: string | undefined): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);
  useEffect(() => {
    if (!id) {
      setRect(null);
      return;
    }
    let raf = 0;
    let last = '';
    let scrolled = false;
    const tick = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${id}"]`);
      let next: Rect | null = null;
      if (el) {
        const r0 = el.getBoundingClientRect();
        if (!scrolled && r0.height > 0 && (r0.bottom > window.innerHeight - 30 || r0.top < 50)) {
          scrolled = true;
          el.scrollIntoView({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
        }
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) next = { x: r.left, y: r.top, w: r.width, h: r.height };
      }
      const key = next ? `${Math.round(next.x)},${Math.round(next.y)},${Math.round(next.w)},${Math.round(next.h)}` : 'none';
      if (key !== last) {
        last = key;
        setRect(next);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [id]);
  return rect;
}

function placeCard(rect: Rect | null, placement: TourStep['placement'], cardH: number) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const clampX = (x: number) => Math.max(12, Math.min(vw - CARD_W - 12, x));
  const clampY = (y: number) => Math.max(56, Math.min(vh - cardH - 36, y));
  if (!rect || placement === 'center') return { left: (vw - CARD_W) / 2, top: Math.max(80, (vh - cardH) / 2 - 20) };
  const cx0 = rect.x + rect.w / 2 - CARD_W / 2;
  const cy0 = rect.y + rect.h / 2 - cardH / 2;
  // try the preferred side, fall back to the side with most room
  const fits = {
    right: rect.x + rect.w + GAP + CARD_W < vw - 8,
    left: rect.x - GAP - CARD_W > 8,
    bottom: rect.y + rect.h + GAP + cardH < vh - 30,
    top: rect.y - GAP - cardH > 50,
  };
  const order: ('right' | 'left' | 'top' | 'bottom')[] = [placement ?? 'right', 'right', 'left', 'bottom', 'top'].filter(
    (p): p is 'right' | 'left' | 'top' | 'bottom' => p !== 'center',
  );
  const side = order.find((p) => fits[p]);
  switch (side) {
    case 'right': return { left: rect.x + rect.w + GAP, top: clampY(cy0) };
    case 'left': return { left: rect.x - GAP - CARD_W, top: clampY(cy0) };
    case 'bottom': return { left: clampX(cx0), top: rect.y + rect.h + GAP };
    case 'top': return { left: clampX(cx0), top: rect.y - GAP - cardH };
    default:
      // Target fills the screen: pin the card to the lower-right inside the target.
      return { left: clampX(rect.x + rect.w - CARD_W - 16), top: clampY(rect.y + rect.h - cardH - 16) };
  }
}

function fmtElapsed(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function ProgressRail() {
  const index = useTour((t) => t.index);
  const done = useTour((t) => t.done);
  const startedAt = useTour((t) => t.startedAt);
  const exit = useTour((t) => t.exit);
  const goTo = useTour((t) => t.goTo);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const cur = STEPS[index];
  return (
    <div data-tour-ui className="fixed top-[50px] left-1/2 -translate-x-1/2 z-[61] flex items-center gap-4 h-9 pl-4 pr-2 bg-surface border border-line rounded shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
      <span className="font-mono text-[10px] tracking-[0.14em] text-cyan">GUIDED DEMO</span>
      <div className="flex items-center gap-3">
        {CHAPTERS.map((c, ci) => {
          const steps = STEPS.map((s, i) => ({ s, i })).filter((x) => x.s.chapter === c.id);
          const active = cur.chapter === c.id;
          const complete = steps.every((x) => x.i < index || done[x.s.id]);
          return (
            <div key={c.id} className="flex flex-col gap-1">
              <span className={cx('font-mono text-[9px] tracking-[0.08em] uppercase leading-none whitespace-nowrap', active ? 'text-ink' : complete ? 'text-cyan/80' : 'text-dim')}>
                {complete && !active ? '✓ ' : `${ci + 1} `}
                {c.label}
              </span>
              <div className="flex gap-[2px]">
                {steps.map(({ s, i }) => (
                  <button
                    key={s.id}
                    title={s.title}
                    onClick={() => i <= index && goTo(i)}
                    className={cx('h-[3px] w-[10px] rounded-[1px]', i === index ? 'bg-cyan' : i < index || done[s.id] ? 'bg-cyan/45' : 'bg-line', i <= index ? 'cursor-pointer' : 'cursor-default')}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <span className="font-mono text-[10px] text-dim tabular-nums">{startedAt ? fmtElapsed(now - startedAt) : '0:00'}</span>
      <button onClick={exit} title="Exit guided demo" className="h-6 px-2 rounded text-mute hover:text-ink hover:bg-surface2 flex items-center gap-1 font-mono text-[10px] tracking-[0.08em]">
        <X size={12} /> EXIT
      </button>
    </div>
  );
}

export function TourOverlay() {
  const active = useTour((t) => t.active);
  const index = useTour((t) => t.index);
  const done = useTour((t) => t.done);
  const misclicks = useTour((t) => t.misclicks);
  const { next, back, markDone, misclick, goTo } = useTour.getState();
  const module = useStore((s) => s.module);
  const step = STEPS[index];
  const rect = useTargetRect(active ? step.target : undefined);
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardH, setCardH] = useState(260);
  const [nudge, setNudge] = useState<string | null>(null);
  const [justDone, setJustDone] = useState(false);
  const autoRef = useRef(false);
  const reduced = prefersReducedMotion();

  const isAction = !!step.action;
  const stepDone = !!done[step.id];
  const offModule = active && module !== step.module && !stepDone;

  // Measure the card for placement.
  useLayoutEffect(() => {
    if (cardRef.current) setCardH(cardRef.current.offsetHeight);
  });

  // Reset per-step UI.
  useEffect(() => {
    setNudge(null);
    setJustDone(false);
    autoRef.current = false;
  }, [index]);

  // Watch the app for completion of action steps.
  useEffect(() => {
    if (!active || !step.action) return;
    const check = () => {
      const s = useStore.getState();
      if (!useTour.getState().done[step.id] && step.action!.done(s)) {
        markDone(step.id, autoRef.current ? 'auto' : 'user');
        setJustDone(true);
        setNudge(null);
      }
    };
    check();
    return useStore.subscribe(check);
  }, [active, index, step, markDone]);

  // After a completed action, pause briefly on the ✓, then advance.
  useEffect(() => {
    if (!justDone) return;
    const t = setTimeout(() => next(), reduced ? 300 : 1100);
    return () => clearTimeout(t);
  }, [justDone, next, reduced]);

  // Misclick tracking: clicks outside the spotlight during an action step.
  useEffect(() => {
    if (!active || !isAction || stepDone || !step.target) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('[data-tour-ui]')) return;
      const el = document.querySelector(`[data-tour="${step.target}"]`);
      if (!el || el.contains(t)) return;
      misclick();
      setNudge(step.action!.instruction);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [active, isAction, stepDone, step, misclick]);

  // Keyboard: Enter / → advance informational steps.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      if ((e.key === 'Enter' || e.key === 'ArrowRight') && (!isAction || stepDone)) {
        e.preventDefault();
        e.stopPropagation();
        next();
      }
      if (e.key === 'ArrowLeft' && index > 0) {
        e.preventDefault();
        e.stopPropagation();
        back();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [active, isAction, stepDone, index, next, back]);

  if (!active) return null;

  const pos = placeCard(offModule ? null : rect, offModule ? 'center' : step.placement, cardH);
  const stepModule = MODULES.find((m) => m.id === step.module)!;
  const curModule = MODULES.find((m) => m.id === module)!;
  const isLast = index === STEPS.length - 1;
  const spot = !offModule && rect && step.placement !== 'center' ? rect : null;

  return (
    <>
      {/* Dimming layer with a cut-out around the target. Never blocks clicks. */}
      <div className="fixed inset-0 z-[58] pointer-events-none">
        {spot ? (
          <motion.div
            className="absolute rounded-[4px]"
            initial={false}
            animate={{ left: spot.x - PAD, top: spot.y - PAD, width: spot.w + PAD * 2, height: spot.h + PAD * 2 }}
            transition={{ duration: reduced ? 0 : 0.45, ease: MOTION.ease }}
            style={{ boxShadow: '0 0 0 9999px rgba(3,6,9,0.8)' }}
          >
            <div className={cx('absolute inset-0 rounded-[4px] border', isAction && !stepDone ? 'border-cyan' : 'border-cyan/50')} />
            {isAction && !stepDone && !reduced && (
              <motion.div
                className="absolute -inset-[3px] rounded-[6px] border border-cyan/60"
                animate={{ opacity: [0.9, 0], scale: [1, 1.03] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
              />
            )}
          </motion.div>
        ) : (
          <div className="absolute inset-0" style={{ background: step.placement === 'center' || offModule ? 'rgba(3,6,9,0.8)' : 'transparent' }} />
        )}
      </div>

      <ProgressRail />

      {/* Coaching card */}
      <motion.div
        ref={cardRef}
        data-tour-ui
        key={step.id}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0, left: pos.left, top: pos.top }}
        transition={{ duration: reduced ? 0 : MOTION.base, ease: MOTION.ease }}
        style={{ width: CARD_W, position: 'fixed', left: pos.left, top: pos.top }}
        className="z-[62] bg-surface border border-line rounded shadow-[0_18px_50px_rgba(0,0,0,0.6)]"
      >
        <div className="flex items-center justify-between px-4 pt-3">
          <span className="font-mono text-[9.5px] tracking-[0.14em] text-dim uppercase">
            Step {index + 1} of {STEPS.length} · {CHAPTERS.find((c) => c.id === step.chapter)?.label}
          </span>
          {isAction && (
            <span className={cx('font-mono text-[9.5px] tracking-[0.12em]', stepDone ? 'text-cyan' : 'text-gof')}>{stepDone ? '✓ DONE' : 'YOUR MOVE'}</span>
          )}
        </div>
        <div className="px-4 pt-1.5 pb-3">
          <div className="text-[15px] leading-[21px] text-ink font-medium">{step.title}</div>
          <p className="mt-1.5 text-[13px] leading-[19px] text-ink/85">{step.body}</p>
          {step.why && !step.controls && <p className="mt-2 text-[12.5px] leading-[18px] text-mute">{step.why}</p>}

          {step.controls && step.controls.length > 0 && (
            <div className="mt-3 border-t border-line2 pt-2.5 space-y-1.5">
              <div className="font-mono text-[9px] tracking-[0.14em] text-dim uppercase">On screen</div>
              {step.controls.slice(0, 4).map((c) => (
                <div key={c.label} className="flex gap-3 text-[12px] leading-[17px]">
                  <span className="font-mono text-[11px] text-cyan/90 w-[118px] shrink-0">{c.label}</span>
                  <span className="text-mute">{c.meaning}</span>
                </div>
              ))}
            </div>
          )}

          {offModule && (
            <div className="mt-3 p-2.5 border border-gof/40 rounded bg-gof/[0.06] text-[12px] text-ink/90">
              You’re in <span className="font-mono">{curModule.label}</span>. This step happens in <span className="font-mono">{stepModule.label}</span>.
              <button onClick={() => goTo(index)} className="ml-2 underline decoration-dotted text-gof hover:text-ink">
                Take me there
              </button>
            </div>
          )}

          {isAction && !offModule && (
            <AnimatePresence mode="wait">
              <motion.div
                key={stepDone ? 'done' : nudge ? `n${misclicks}` : 'todo'}
                initial={{ opacity: 0, x: nudge && !stepDone ? -4 : 0 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2 }}
                className={cx(
                  'mt-3 flex items-center gap-2 px-2.5 py-2 rounded border text-[12.5px]',
                  stepDone ? 'border-cyan/50 bg-cyan/[0.08] text-cyan' : nudge ? 'border-warn/50 bg-warn/[0.07] text-ink' : 'border-cyan/35 bg-cyan/[0.05] text-ink',
                )}
              >
                {stepDone ? <Check size={14} /> : <MousePointerClick size={14} className={nudge ? 'text-warn' : 'text-cyan'} />}
                <span>{stepDone ? (done[step.id] === 'user' ? 'Nice — that’s right.' : 'Done for you.') : nudge ? <>Not quite — {lowerFirst(step.action!.instruction)} It’s outlined.</> : step.action!.instruction}</span>
              </motion.div>
            </AnimatePresence>
          )}
          {isAction && !offModule && step.target && !rect && !stepDone && (
            <div className="mt-2 text-[11px] text-dim">Scroll the panel if you can’t see the outlined control.</div>
          )}
        </div>

        <div className="flex items-center gap-2 px-3 py-2 border-t border-line2">
          <button onClick={back} disabled={index === 0} className="h-7 px-2 rounded text-mute hover:text-ink disabled:opacity-30 flex items-center gap-1 font-mono text-[10px] tracking-[0.08em]">
            <ChevronLeft size={13} /> BACK
          </button>
          <div className="flex-1" />
          {isAction && !stepDone && step.autoDo && (
            <button
              onClick={() => {
                autoRef.current = true;
                if (useStore.getState().module !== step.module) useStore.getState().setModule(step.module);
                step.autoDo!(useStore.getState());
              }}
              className="h-7 px-2.5 rounded text-mute hover:text-ink hover:bg-surface2 flex items-center gap-1.5 font-mono text-[10px] tracking-[0.08em]"
              title="Perform this step automatically"
            >
              <Wand2 size={12} /> DO IT FOR ME
            </button>
          )}
          {(!isAction || stepDone) && (
            <button
              onClick={next}
              className="h-7 px-3 rounded border border-cyan/70 text-cyan bg-cyan/[0.08] hover:bg-cyan/[0.16] flex items-center gap-1.5 font-mono text-[10px] tracking-[0.1em]"
            >
              {isLast ? 'FINISH' : 'NEXT'} <ArrowRight size={12} />
            </button>
          )}
        </div>
      </motion.div>
      {isLast && <TourSummary />}
    </>
  );
}

function lowerFirst(s: string) {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/** Small scorecard under the finale card: what the visitor did themselves. */
function TourSummary() {
  const done = useTour((t) => t.done);
  const misclicks = useTour((t) => t.misclicks);
  const startedAt = useTour((t) => t.startedAt);
  const finishedAt = useTour((t) => t.finishedAt);
  const actions = STEPS.filter((s) => s.action);
  const byUser = actions.filter((s) => done[s.id] === 'user').length;
  return (
    <div data-tour-ui className="fixed z-[62] bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-6 px-5 h-10 bg-surface border border-line rounded font-mono text-[10.5px] tracking-[0.06em] text-mute">
      <span>
        <span className="text-cyan">{byUser}</span> / {actions.length} STEPS DONE YOURSELF
      </span>
      <span>{misclicks} MISCLICK{misclicks === 1 ? '' : 'S'}</span>
      {startedAt && <span>TIME {fmtElapsed((finishedAt ?? Date.now()) - startedAt)}</span>}
      <span className="text-dim">SHIELD ICON → WHAT’S REAL VS SIMULATED</span>
    </div>
  );
}
