'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { SEATS_BY_ID, tableLabel } from '@virtual-cafe/shared';
import { useCafeStore } from '@/state/useCafeStore';

interface Props {
  /** Written on every pointer move; read by the render loop (never state). */
  vectorRef: React.MutableRefObject<{ x: number; y: number } | null>;
  /**
   * True while the floating panel column is on screen — a touch tablet, or a
   * phone turned sideways. The action button keeps out from under it.
   */
  sidePanels?: boolean;
  onInteract: () => void;
}

/** Half the pad, i.e. how far the thumb travels for full speed. */
const TRAVEL = 46;
/** Below this a resting thumb counts as standing still, not as a nudge. */
const DEAD_ZONE = 0.14;

/**
 * Walking and sitting with a thumb (SPEC 10.3).
 *
 * Phones have no W, A, S or D, which left the café readable but impossible to
 * move around in. The stick is analog rather than a four-way pad — it is the
 * same isometric floor, and a thumb can aim at a chair directly instead of
 * zig-zagging towards it — and its origin floats to wherever the thumb first
 * lands, so there is no invisible centre to find.
 *
 * Both controls write through refs and `style`, not React state, so dragging
 * costs no renders: the canvas is already running its own loop at 60fps and a
 * re-render per pointer move would be felt.
 */
export function TouchControls({ vectorRef, sidePanels = false, onInteract }: Props) {
  const knobRef = useRef<HTMLDivElement | null>(null);
  const originRef = useRef<{ x: number; y: number } | null>(null);
  const pointerRef = useRef<number | null>(null);
  const [active, setActive] = useState(false);

  const seated = Boolean(useCafeStore((state) => state.self?.seatId));
  const nearbySeatId = useCafeStore((state) => state.nearbySeatId);

  const moveKnob = useCallback((dx: number, dy: number) => {
    const knob = knobRef.current;
    if (knob) knob.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
  }, []);

  const release = useCallback(() => {
    pointerRef.current = null;
    originRef.current = null;
    vectorRef.current = null;
    moveKnob(0, 0);
    setActive(false);
  }, [moveKnob, vectorRef]);

  // A thumb that never lifts — the tab is backgrounded, the window loses
  // focus, the control unmounts because a panel opened over it — must not
  // leave the avatar walking into a wall for ever. `pointercancel` covers the
  // interruptions the browser notices; these cover the rest.
  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === 'hidden') release();
    };
    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      window.removeEventListener('blur', release);
      document.removeEventListener('visibilitychange', onHidden);
      release();
    };
  }, [release]);

  const start = (event: React.PointerEvent<HTMLDivElement>) => {
    if (pointerRef.current !== null) return;
    pointerRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    originRef.current = { x: event.clientX, y: event.clientY };
    setActive(true);
    moveKnob(0, 0);
    vectorRef.current = null;
  };

  const drag = (event: React.PointerEvent<HTMLDivElement>) => {
    const origin = originRef.current;
    if (origin === null || event.pointerId !== pointerRef.current) return;

    let dx = event.clientX - origin.x;
    let dy = event.clientY - origin.y;
    const distance = Math.hypot(dx, dy);
    if (distance > TRAVEL) {
      // Past the rim the stick stays at full deflection but keeps following
      // the thumb's direction, which is what a real stick does.
      dx = (dx / distance) * TRAVEL;
      dy = (dy / distance) * TRAVEL;
    }
    moveKnob(dx, dy);

    const push = Math.min(distance, TRAVEL) / TRAVEL;
    vectorRef.current = push < DEAD_ZONE ? null : { x: dx / TRAVEL, y: dy / TRAVEL };
  };

  const end = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerId !== pointerRef.current) return;
    release();
  };

  const seatName = nearbySeatId ? tableLabel(SEATS_BY_ID.get(nearbySeatId)?.seatGroupId) : null;
  const canInteract = seated || Boolean(nearbySeatId);
  const actionLabel = seated ? 'Đứng dậy' : seatName ? `Ngồi vào ${seatName}` : 'Lại gần một chiếc ghế';

  return (
    // Below `md` the dock owns the bottom 3.25rem of the screen, so the
    // controls stand clear of it; above `md` there is no dock, but there may
    // be the panel column down the right-hand edge instead.
    <div
      className={`pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end justify-between gap-4 pl-5 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-[calc(1rem+env(safe-area-inset-bottom))] ${
        sidePanels ? 'pr-[19.5rem]' : 'pr-5'
      }`}
    >
      <div
        onPointerDown={start}
        onPointerMove={drag}
        onPointerUp={end}
        onPointerCancel={end}
        // Not `role="application"`: that would hand the screen reader's own
        // keys to a control with no keyboard behaviour to give them to. A
        // labelled group states what it is and leaves navigation alone; the
        // action button beside it is the part that is operable without a drag.
        role="group"
        aria-label="Cần điều khiển: kéo để đi trong quán"
        className={`pointer-events-auto touch-none select-none rounded-full border transition-colors ${
          active ? 'border-caramel/70 bg-espresso/60' : 'border-white/15 bg-espresso/35'
        } h-[124px] w-[124px] backdrop-blur-sm`}
      >
        <div className="grid h-full w-full place-items-center">
          <div
            ref={knobRef}
            aria-hidden
            className={`h-[52px] w-[52px] rounded-full border shadow-panel will-change-transform ${
              active ? 'border-cream/50 bg-caramel/80' : 'border-white/25 bg-cream/20'
            }`}
          />
        </div>
      </div>

      <button
        type="button"
        onClick={onInteract}
        disabled={!canInteract}
        aria-label={actionLabel}
        className={`pointer-events-auto grid h-[76px] w-[76px] shrink-0 touch-none place-items-center rounded-full border text-center text-[11px] font-semibold leading-tight shadow-panel backdrop-blur-sm transition ${
          canInteract
            ? 'border-caramel/70 bg-caramel/85 text-espresso active:scale-95'
            : 'border-white/10 bg-espresso/40 text-linen/35'
        }`}
      >
        {seated ? 'Đứng dậy' : 'Ngồi'}
      </button>
    </div>
  );
}
