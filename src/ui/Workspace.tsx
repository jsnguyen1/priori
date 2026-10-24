// Standard module layout: [context sidebar | central canvas | inspector], with resizable side panels
// and an optional bottom strip. Every module renders inside <Workspace>.
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { cx } from './primitives';
import { useViewMode } from './viewMode';

function useDragWidth(initial: number, min: number, max: number, side: 'left' | 'right') {
  const [w, setW] = useState(initial);
  const start = useRef<{ x: number; w: number } | null>(null);
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      start.current = { x: e.clientX, w };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [w],
  );
  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!start.current) return;
      const dx = e.clientX - start.current.x;
      setW(Math.min(max, Math.max(min, start.current.w + (side === 'left' ? dx : -dx))));
    },
    [min, max, side],
  );
  const onPointerUp = useCallback(() => {
    start.current = null;
  }, []);
  return { w, handle: { onPointerDown, onPointerMove, onPointerUp } };
}

function Handle(props: ReturnType<typeof useDragWidth>['handle'] & { side: 'left' | 'right' }) {
  const { side, ...h } = props;
  return (
    <div
      {...h}
      className={cx('absolute top-0 bottom-0 w-[5px] z-20 cursor-col-resize group', side === 'left' ? '-right-[3px]' : '-left-[3px]')}
      role="separator"
      aria-orientation="vertical"
    >
      <div className="mx-auto w-px h-full bg-transparent group-hover:bg-cyan/50 transition-colors" />
    </div>
  );
}

export function Workspace({
  sidebar,
  inspector,
  bottom,
  children,
  sidebarWidth = 280,
  inspectorWidth = 340,
  keepSidebar = false,
  className,
}: {
  /** keep the sidebar in Simple view (it holds a primary control) */
  keepSidebar?: boolean;
  sidebar?: ReactNode;
  inspector?: ReactNode;
  bottom?: ReactNode;
  children: ReactNode;
  sidebarWidth?: number;
  inspectorWidth?: number;
  className?: string;
}) {
  const left = useDragWidth(sidebarWidth, 220, 420, 'left');
  const right = useDragWidth(inspectorWidth, 260, 520, 'right');
  const simple = useViewMode((v) => v.simple);
  if (simple && !keepSidebar) sidebar = undefined;
  return (
    <div className={cx('flex h-full min-h-0 w-full', className)}>
      {sidebar && (
        <aside className="relative shrink-0 h-full min-h-0 border-r border-line2 bg-bg flex flex-col overflow-hidden" style={{ width: left.w }}>
          <div className="flex-1 min-h-0 overflow-y-auto scroll-thin">{sidebar}</div>
          <Handle {...left.handle} side="left" />
        </aside>
      )}
      <main className="flex-1 min-w-0 h-full min-h-0 flex flex-col bg-canvas">
        <div className="flex-1 min-h-0 relative">{children}</div>
        {bottom && <div className="shrink-0 border-t border-line2 bg-bg">{bottom}</div>}
      </main>
      {inspector && (
        <aside className="relative shrink-0 h-full min-h-0 border-l border-line2 bg-bg flex flex-col overflow-hidden" style={{ width: right.w }}>
          <div className="flex-1 min-h-0 overflow-y-auto scroll-thin">{inspector}</div>
          <Handle {...right.handle} side="right" />
        </aside>
      )}
    </div>
  );
}
