// Simple-view building blocks. In Simple view every screen leads with one plain-English headline
// and one takeaway; dense technical detail renders only in Detailed view.
import type { ReactNode } from 'react';
import { useViewMode } from './viewMode';
import { cx } from './primitives';

export const useSimple = () => useViewMode((v) => v.simple);

/** Render children only in Detailed view. */
export function DetailOnly({ children }: { children: ReactNode }) {
  return useSimple() ? null : <>{children}</>;
}

/** Render children only in Simple view. */
export function SimpleOnly({ children }: { children: ReactNode }) {
  return useSimple() ? <>{children}</> : null;
}

/**
 * The one sentence a smart non-specialist needs to read a screen.
 * step: e.g. "1 / 6"; title: plain statement; sub: one short supporting line.
 */
export function Headline({ step, title, sub, right, className }: { step?: string; title: ReactNode; sub?: ReactNode; right?: ReactNode; className?: string }) {
  if (!useSimple()) return null;
  return (
    <div className={cx('flex items-start justify-between gap-6 px-6 pt-5 pb-4', className)}>
      <div className="min-w-0">
        {step && <div className="font-mono text-[10px] tracking-[0.16em] text-cyan mb-1.5">{step}</div>}
        <div className="text-[22px] leading-[28px] text-ink font-medium tracking-[-0.005em]">{title}</div>
        {sub && <div className="mt-1.5 text-[14px] leading-[20px] text-mute max-w-[720px]">{sub}</div>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

/** A large, single-number takeaway: "26% of normal current". */
export function BigStat({ value, label, color, note }: { value: ReactNode; label: ReactNode; color?: string; note?: ReactNode }) {
  return (
    <div className="flex flex-col">
      <div className="font-mono text-[34px] leading-[38px] tabular-nums" style={{ color }}>{value}</div>
      <div className="mt-1 text-[13px] leading-[18px] text-ink">{label}</div>
      {note && <div className="text-[11px] text-dim mt-0.5">{note}</div>}
    </div>
  );
}
