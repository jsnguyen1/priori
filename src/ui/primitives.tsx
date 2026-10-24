// Shared UI primitives. Dense, hairline, technical. Keep visual vocabulary consistent.
import { useState, type ReactNode, type ButtonHTMLAttributes } from 'react';
import type { DataCategory, MechanismClass, ReuseClass } from '../domain/types';
import { C, CATEGORY_LABEL, MECH_COLOR, MECH_LABEL, REUSE_STYLE } from './tokens';
import { GLOSSARY } from './glossary';

const cx = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' ');
export { cx };

/** Epistemic label. Every simulated / hypothetical / illustrative datum should carry one nearby. */
export function EvidenceBadge({ category, className }: { category: DataCategory; className?: string }) {
  const style: Record<DataCategory, string> = {
    published: 'border-ink/40 text-ink',
    hypothetical: 'border-mute/50 text-mute border-dotted',
    simulated: 'border-cyan/45 text-cyan/90 border-dashed',
    illustrative: 'border-mixed/45 text-mixed/90 border-dashed',
    assumption: 'border-gof/45 text-gof/90 border-dashed',
  };
  return (
    <span className={cx('inline-flex items-center h-[16px] px-1.5 border rounded-sm font-mono text-[9px] tracking-[0.08em] leading-none whitespace-nowrap', style[category], className)}>
      {CATEGORY_LABEL[category]}
    </span>
  );
}

export function MechanismTag({ mechanism, size = 'sm' }: { mechanism: MechanismClass; size?: 'sm' | 'md' }) {
  const color = MECH_COLOR[mechanism];
  return (
    <span className={cx('inline-flex items-center gap-1.5 font-mono uppercase tracking-[0.06em] whitespace-nowrap', size === 'md' ? 'text-sm' : 'text-2xs')} style={{ color }}>
      <span className="inline-block w-[7px] h-[7px] rounded-[1px]" style={{ background: color }} />
      {MECH_LABEL[mechanism]}
    </span>
  );
}

export function ReuseTag({ reuseClass }: { reuseClass: ReuseClass }) {
  const s = REUSE_STYLE[reuseClass];
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-2xs tracking-[0.06em] whitespace-nowrap" style={{ color: s.color }}>
      <svg width="16" height="6"><line x1="0" y1="3" x2="16" y2="3" stroke={s.color} strokeWidth="1.5" strokeDasharray={s.dash} /></svg>
      {s.short}
    </span>
  );
}

/** Small uppercase section label. */
export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('font-mono text-[10px] uppercase tracking-[0.12em] text-mute', className)}>{children}</div>;
}

export function SectionHeader({ title, right, className }: { title: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={cx('flex items-center justify-between h-8 px-3 border-b border-line2 shrink-0', className)}>
      <Label>{title}</Label>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </div>
  );
}

export function Panel({ title, right, children, className, bodyClassName }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <section className={cx('flex flex-col min-h-0 border border-line2 bg-surface rounded', className)}>
      {title !== undefined && <SectionHeader title={title} right={right} />}
      <div className={cx('min-h-0', bodyClassName)}>{children}</div>
    </section>
  );
}

type BtnVariant = 'primary' | 'default' | 'ghost' | 'danger';
export function Button({ variant = 'default', size = 'md', className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'md' | 'lg' }) {
  const v: Record<BtnVariant, string> = {
    primary: 'border-cyan/70 text-cyan bg-cyan/[0.07] hover:bg-cyan/[0.14] hover:border-cyan',
    default: 'border-line text-ink bg-surface2 hover:border-mute/60 hover:bg-[#1b2833]',
    ghost: 'border-transparent text-mute hover:text-ink hover:bg-surface2',
    danger: 'border-warn/50 text-warn bg-warn/[0.05] hover:bg-warn/[0.12]',
  };
  const s = { sm: 'h-6 px-2 text-xs', md: 'h-7 px-3 text-sm', lg: 'h-10 px-5 text-sm tracking-[0.08em]' }[size];
  return (
    <button
      {...rest}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 border rounded font-mono uppercase tracking-[0.06em] transition-colors duration-150 disabled:opacity-35 disabled:pointer-events-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-cyan',
        v[variant],
        s,
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Segmented<T extends string>({ value, options, onChange, className }: { value: T; options: { value: T; label: ReactNode; title?: string }[]; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={cx('inline-flex border border-line rounded overflow-hidden bg-canvas', className)} role="radiogroup">
      {options.map((o, i) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cx(
            'h-6 px-2.5 font-mono text-2xs uppercase tracking-[0.06em] transition-colors',
            i > 0 && 'border-l border-line',
            value === o.value ? 'bg-surface2 text-cyan' : 'text-mute hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <button onClick={() => onChange(!checked)} className="flex items-center gap-2 h-6 text-xs text-mute hover:text-ink" role="switch" aria-checked={checked}>
      <span className={cx('relative w-6 h-3 rounded-full border transition-colors', checked ? 'border-cyan/70 bg-cyan/20' : 'border-line bg-canvas')}>
        <span className={cx('absolute top-[1px] w-[8px] h-[8px] rounded-full transition-all', checked ? 'left-[13px] bg-cyan' : 'left-[1px] bg-mute')} />
      </span>
      {label}
    </button>
  );
}

/** Key–value row with monospace value and unit. */
export function KV({ k, v, unit, color, sub, className }: { k: ReactNode; v: ReactNode; unit?: string; color?: string; sub?: ReactNode; className?: string }) {
  return (
    <div className={cx('flex items-baseline justify-between gap-3 py-[3px]', className)}>
      <span className="text-xs text-mute">{k}</span>
      <span className="font-mono text-xs text-ink text-right tabular-nums" style={color ? { color } : undefined}>
        {v}
        {unit && <span className="text-dim ml-1">{unit}</span>}
        {sub && <span className="block text-2xs text-dim">{sub}</span>}
      </span>
    </div>
  );
}

/** Hover tooltip for scientific terms defined in ui/glossary.ts. */
export function Term({ k, children }: { k: keyof typeof GLOSSARY; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const g = GLOSSARY[k];
  return (
    <span className="relative inline" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} tabIndex={0}>
      <span className="border-b border-dotted border-mute/60 cursor-help">{children ?? g.term}</span>
      {open && (
        <span className="absolute z-50 left-0 top-full mt-1 w-64 p-2.5 bg-surface2 border border-line rounded shadow-[0_8px_24px_rgba(0,0,0,0.5)] text-xs text-ink normal-case tracking-normal font-sans pointer-events-none">
          <span className="block font-mono text-2xs text-cyan mb-1 uppercase tracking-[0.08em]">{g.term}</span>
          {g.definition}
        </span>
      )}
    </span>
  );
}

/** Plain hover tooltip. */
export function Tip({ content, children, side = 'top' }: { content: ReactNode; children: ReactNode; side?: 'top' | 'bottom' | 'right' }) {
  const [open, setOpen] = useState(false);
  const pos = { top: 'bottom-full mb-1.5 left-1/2 -translate-x-1/2', bottom: 'top-full mt-1.5 left-1/2 -translate-x-1/2', right: 'left-full ml-2 top-1/2 -translate-y-1/2' }[side];
  return (
    <span className="relative inline-flex" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      {children}
      {open && <span className={cx('absolute z-50 whitespace-nowrap px-2 py-1 bg-surface2 border border-line rounded text-2xs font-mono text-ink pointer-events-none', pos)}>{content}</span>}
    </span>
  );
}

/** Empty / waiting state with a concise technical message. */
export function EmptyState({ title, detail, action }: { title: string; detail?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-2 p-6 text-center">
      <div className="font-mono text-2xs uppercase tracking-[0.14em] text-mute">{title}</div>
      {detail && <div className="text-xs text-dim max-w-xs">{detail}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function UncertaintyBar({ low, mid, high, min, max, color = C.cyan, width = 120 }: { low: number; mid: number; high: number; min: number; max: number; color?: string; width?: number }) {
  const x = (v: number) => ((Math.min(max, Math.max(min, v)) - min) / (max - min || 1)) * width;
  return (
    <svg width={width} height={10} className="block">
      <line x1={0} x2={width} y1={5} y2={5} stroke={C.line} />
      <line x1={x(low)} x2={x(high)} y1={5} y2={5} stroke={color} strokeWidth={3} strokeOpacity={0.35} />
      <line x1={x(mid)} x2={x(mid)} y1={1} y2={9} stroke={color} strokeWidth={1.5} />
    </svg>
  );
}

export const fmt = {
  num: (v: number, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : 'n/a'),
  signed: (v: number, d = 1) => (Number.isFinite(v) ? `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(d)}` : 'n/a'),
  pct: (v: number, d = 0) => `${(v * 100).toFixed(d)}%`,
  usd: (v: number) => (Math.abs(v) >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : `$${Math.round(v / 1e3)}k`),
  time: (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `T+${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  },
};
