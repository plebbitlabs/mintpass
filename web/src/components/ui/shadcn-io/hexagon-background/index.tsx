'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';

type HexagonBackgroundProps = React.ComponentProps<'div'> & {
  children?: React.ReactNode;
  hexagonProps?: React.ComponentProps<'div'>;
  hexagonSize?: number; // value greater than 50
  hexagonMargin?: number;
};

function HexagonBackground({
  className,
  children,
  hexagonProps,
  hexagonSize = 75,
  hexagonMargin = 3,
  ...props
}: HexagonBackgroundProps) {
  // Validate/coerce size early (do not early-return before hooks)
  const size = Number(hexagonSize);
  const isValidSize = Number.isFinite(size) && size > 50;

  const hexagonWidth = size;
  const hexagonHeight = size * 1.1;
  const rowSpacing = size * 0.8;
  const baseMarginTop = -36 - 0.275 * (size - 100);
  const computedMarginTop = baseMarginTop + hexagonMargin;
  const oddRowMarginLeft = -(size / 2);
  const evenRowMarginLeft = hexagonMargin / 2;

  const [gridDimensions, setGridDimensions] = React.useState({
    rows: 0,
    columns: 0,
  });
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const trailDurationMs = 700;
  const activeTimersRef = React.useRef<Map<string, number>>(new Map());
  const [activeKeys, setActiveKeys] = React.useState<Set<string>>(new Set());
  const debounceTimerRef = React.useRef<number | null>(null);
  const expiryMapRef = React.useRef<Map<string, number>>(new Map());

  const updateGridDimensions = React.useCallback(() => {
    if (typeof window === 'undefined' || !isValidSize) return;
    // Use the full document height instead of just viewport height
    const documentHeight = Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight,
      window.innerHeight
    );
    const rows = Math.ceil(documentHeight / rowSpacing);
    const columns = Math.ceil(window.innerWidth / hexagonWidth) + 1;
    setGridDimensions({ rows, columns });
  }, [rowSpacing, hexagonWidth, isValidSize]);

  React.useEffect(() => {
    if (!isValidSize) return;
    updateGridDimensions();
    window.addEventListener('resize', updateGridDimensions);

    // Prefer a scoped ResizeObserver on the component container
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      ro = new ResizeObserver(() => {
        if (debounceTimerRef.current !== null) {
          clearTimeout(debounceTimerRef.current);
        }
        debounceTimerRef.current = window.setTimeout(updateGridDimensions, 100);
      });
      ro.observe(containerRef.current);
    }

    return () => {
      window.removeEventListener('resize', updateGridDimensions);
      if (ro) ro.disconnect();
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [updateGridDimensions, isValidSize]);

  const clearActiveKey = React.useCallback((key: string) => {
    const timersMap = activeTimersRef.current;
    const existingTimeout = timersMap.get(key);
    if (existingTimeout !== undefined) {
      window.clearTimeout(existingTimeout);
      timersMap.delete(key);
    }
    expiryMapRef.current.delete(key);
    setActiveKeys(prev => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);

  const clearAllActive = React.useCallback(() => {
    const timersMap = activeTimersRef.current;
    for (const [, id] of timersMap) window.clearTimeout(id);
    timersMap.clear();
    expiryMapRef.current.clear();
    setActiveKeys(new Set());
  }, []);

  const updateActiveFromPoint = React.useCallback((clientX: number, clientY: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    const row = Math.floor(y / rowSpacing);
    if (row < 0 || row >= gridDimensions.rows) return;
    const shift = (((row + 1) % 2 === 0 ? evenRowMarginLeft : oddRowMarginLeft) - 10);
    const col = Math.floor((x - shift) / hexagonWidth);
    if (col < 0 || col >= gridDimensions.columns) return;
    const key = `${row}-${col}`;

    // If this hex is not currently in the trail, add it and schedule removal
    if (!activeTimersRef.current.has(key)) {
      setActiveKeys(prev => {
        if (prev.has(key)) return prev;
        const next = new Set(prev);
        next.add(key);
        return next;
      });
      // Track hard expiry as an additional failsafe to avoid any stuck actives
      expiryMapRef.current.set(key, Date.now() + trailDurationMs + 50);
      const timeoutId = window.setTimeout(() => {
        clearActiveKey(key);
      }, trailDurationMs);
      activeTimersRef.current.set(key, timeoutId);
    }
  }, [gridDimensions.rows, gridDimensions.columns, rowSpacing, hexagonWidth, evenRowMarginLeft, oddRowMarginLeft, clearActiveKey]);

  React.useEffect(() => {
    if (!isValidSize) return;
    const move = (e: MouseEvent) => updateActiveFromPoint(e.clientX, e.clientY);
    const leave = () => clearAllActive();
    const onVisibility = () => clearAllActive();
    window.addEventListener('mousemove', move, { passive: true });
    window.addEventListener('mouseleave', leave, { passive: true });
    window.addEventListener('blur', leave);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseleave', leave);
      window.removeEventListener('blur', leave);
      document.removeEventListener('visibilitychange', onVisibility);
      clearAllActive();
    };
  }, [updateActiveFromPoint, isValidSize, clearAllActive]);

  // Failsafe GC: periodically clear any overdue actives in case a timeout was throttled/lost
  React.useEffect(() => {
    if (!isValidSize) return;
    const intervalId = window.setInterval(() => {
      const now = Date.now();
      const expired: string[] = [];
      for (const [key, expiry] of expiryMapRef.current) {
        if (expiry <= now) expired.push(key);
      }
      if (expired.length) {
        for (const key of expired) clearActiveKey(key);
      }
    }, 500);
    return () => window.clearInterval(intervalId);
  }, [isValidSize, clearActiveKey]);

  // Trail is managed with per-hex timeouts; no idle loop needed

  if (!isValidSize) return null;

  return (
    <div
      ref={containerRef}
      data-slot="hexagon-background"
      className={cn(
        'relative size-full overflow-hidden dark:bg-neutral-900 bg-neutral-100',
        className,
      )}
      {...props}
    >
      <style>{`
        :root { --hexagon-margin: ${hexagonMargin}px; }
        [data-slot="hexagon-background"] [data-hex][data-active="true"]::before { background: rgb(229 229 229 / 1); }
        .dark [data-slot="hexagon-background"] [data-hex][data-active="true"]::before { background: rgb(38 38 38 / 1); }
        [data-slot="hexagon-background"] [data-hex][data-active="true"]::after { background: rgb(245 245 245 / 1); }
        .dark [data-slot="hexagon-background"] [data-hex][data-active="true"]::after { background: rgb(23 23 23 / 1); }
      `}</style>
      <div className="absolute top-0 left-0 size-full overflow-hidden z-0 pointer-events-none">
        {Array.from({ length: gridDimensions.rows }).map((_, rowIndex) => (
          <div
            key={`row-${rowIndex}`}
            style={{
              marginTop: computedMarginTop,
              marginLeft:
                ((rowIndex + 1) % 2 === 0
                  ? evenRowMarginLeft
                  : oddRowMarginLeft) - 10,
            }}
            className="inline-flex"
          >
            {Array.from({ length: gridDimensions.columns }).map(
              (_, colIndex) => (
                <div
                  key={`hexagon-${rowIndex}-${colIndex}`}
                  data-hex
                  {...hexagonProps}
                  style={{
                    width: hexagonWidth,
                    height: hexagonHeight,
                    marginLeft: hexagonMargin,
                    ...hexagonProps?.style,
                  }}
                  className={cn(
                    'relative',
                    '[clip-path:polygon(50%_0%,_100%_25%,_100%_75%,_50%_100%,_0%_75%,_0%_25%)]',
                    "before:content-[''] before:absolute before:top-0 before:left-0 before:w-full before:h-full dark:before:bg-neutral-950 before:bg-white before:opacity-100 before:transition-all before:duration-1000",
                    "after:content-[''] after:absolute after:inset-[var(--hexagon-margin)] dark:after:bg-neutral-950 after:bg-white",
                    'after:[clip-path:polygon(50%_0%,_100%_25%,_100%_75%,_50%_100%,_0%_75%,_0%_25%)]',
                    'hover:before:bg-neutral-200 dark:hover:before:bg-neutral-800 hover:before:opacity-100 hover:before:duration-0 dark:hover:after:bg-neutral-900 hover:after:bg-neutral-100 hover:after:opacity-100 hover:after:duration-0',
                    hexagonProps?.className,
                  )}
                  data-active={activeKeys.has(`${rowIndex}-${colIndex}`) ? 'true' : undefined}
                />
              ),
            )}
          </div>
        ))}
      </div>
      <div className="relative z-10 pointer-events-auto">
        {children}
      </div>
    </div>
  );
}

export { HexagonBackground, type HexagonBackgroundProps };