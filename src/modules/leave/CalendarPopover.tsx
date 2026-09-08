/**
 * Hover card for calendar cells.
 *
 * The calendar's day cells sit inside a horizontally scrollable container, so
 * an `position: absolute` card anchored to a cell extends past that container's
 * bounds and forces it to scroll — the whole grid shifts under the pointer as
 * soon as a card opens. Rendering into a portal with `position: fixed` takes
 * the card out of the scroll container entirely: it floats above the grid,
 * nothing reflows, and only the card itself scrolls when its content is long.
 */
import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** Keeps the card on screen without ever making an ancestor scroll. */
const MAX_HEIGHT = 320;
const WIDTH = 280;
const GAP = 8;
const EDGE = 12;

interface Props {
  /** The element the card is anchored to. */
  anchor: DOMRect | null;
  children: React.ReactNode;
  /** Pointer-transparent by default; set when the card has its own controls. */
  interactive?: boolean;
  /**
   * Because the card is portalled, moving the pointer from the cell into the
   * card fires the cell's mouseleave. An interactive card therefore has to tell
   * its owner "the pointer is still with me" so the card is not closed as the
   * user reaches for it.
   */
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export function CalendarPopover({
  anchor,
  children,
  interactive = false,
  onMouseEnter,
  onMouseLeave,
}: Props) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Measured after paint so the real height decides whether it flips upwards.
  useLayoutEffect(() => {
    if (!anchor) { setPos(null); return; }

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const h = Math.min(cardRef.current?.offsetHeight ?? MAX_HEIGHT, MAX_HEIGHT);

    const spaceBelow = vh - anchor.bottom - GAP - EDGE;
    const flipUp = spaceBelow < h && anchor.top - GAP - EDGE > spaceBelow;

    let top = flipUp ? anchor.top - h - GAP : anchor.bottom + GAP;
    top = Math.max(EDGE, Math.min(top, vh - h - EDGE));

    // Prefer left-aligned; pull back when it would run off the right edge.
    let left = anchor.left;
    if (left + WIDTH > vw - EDGE) left = Math.max(EDGE, anchor.right - WIDTH);
    left = Math.max(EDGE, Math.min(left, vw - WIDTH - EDGE));

    setPos({ top, left });
  }, [anchor]);

  if (!anchor) return null;

  return createPortal(
    <div
      ref={cardRef}
      role="tooltip"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        position: 'fixed',
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        width: WIDTH,
        maxHeight: MAX_HEIGHT,
        overflowY: 'auto',
        overscrollBehavior: 'contain',   // scrolling the card never scrolls the page
        zIndex: 1200,
        padding: '10px 11px',
        borderRadius: 12,
        border: '1px solid rgba(148,163,184,0.40)',
        background: 'var(--surface, #fff)',
        boxShadow: '0 18px 44px rgba(15,23,42,0.26), 0 2px 6px rgba(15,23,42,0.10)',
        color: 'var(--text-primary)',
        textAlign: 'left',
        textTransform: 'none',
        letterSpacing: 'normal',
        pointerEvents: interactive ? 'auto' : 'none',
        // Hidden until measured, so it never flashes at the wrong spot.
        visibility: pos ? 'visible' : 'hidden',
      }}
    >
      {children}
    </div>,
    document.body,
  );
}

/** Grabs the anchor rect from a mouse event target. */
export function rectOf(e: React.MouseEvent<HTMLElement>): DOMRect {
  return e.currentTarget.getBoundingClientRect();
}
