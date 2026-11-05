'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Subscribe to a CSS media query from React.
 *
 * `useSyncExternalStore` rather than `useState` + effect: the server snapshot
 * is always `false`, so hydration matches the markup Next sent, and the real
 * answer is read synchronously straight afterwards instead of one paint later.
 * Layouts built on this should therefore treat `false` as the safe default.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/**
 * Phone-sized viewport. The café drops its floating side column here and moves
 * the panels into a dock, because a 290px column on a 390px screen is the
 * whole screen.
 *
 * Kept in step with Tailwind's `md` breakpoint, which the same components use
 * for the parts that can be switched in CSS alone.
 */
export const COMPACT_QUERY = '(max-width: 767px)';

/**
 * Touch is the primary input: a phone or tablet, rather than a laptop that
 * happens to have a touchscreen and still has a keyboard and a hovering
 * pointer. Only the former needs an on-screen joystick.
 */
export const TOUCH_QUERY = '(pointer: coarse) and (hover: none)';
