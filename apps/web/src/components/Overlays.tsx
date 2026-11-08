'use client';

import { useEffect } from 'react';
import { SEATS_BY_ID, tableLabel } from '@virtual-cafe/shared';
import { TOUCH_QUERY, useMediaQuery } from '@/hooks/useMediaQuery';
import { useCafeStore } from '@/state/useCafeStore';

/** Connection state is always visible, never silent (SPEC 10.2, 16.2). */
export function ConnectionBanner() {
  const phase = useCafeStore((state) => state.phase);
  const message = useCafeStore((state) => state.connectionMessage);

  if (phase === 'connected' || phase === 'idle') return null;

  const text =
    message ??
    {
      authenticating: 'Đang tìm bàn cho bạn…',
      connecting: 'Đang mở cửa quán…',
      reconnecting: 'Mất kết nối — đang kết nối lại…',
      error: 'Hiện chưa kết nối được tới quán.',
      connected: '',
      idle: '',
    }[phase];

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none absolute left-1/2 top-[4.5rem] z-30 max-w-[92vw] -translate-x-1/2 text-balance rounded-full border border-white/15 bg-espresso/90 px-4 py-1.5 text-center text-xs text-cream shadow-panel backdrop-blur md:top-4"
    >
      {phase === 'error' ? '⚠ ' : '◌ '}
      {text}
    </div>
  );
}

/**
 * Contextual prompt for the seat within reach (SPEC 10.1).
 *
 * A phone has no E key, so on touch the prompt names the round button in the
 * corner instead of a key that does not exist (SPEC 10.3). The button itself
 * carries the same wording, so the two always agree.
 */
export function InteractionPrompt() {
  const nearbySeatId = useCafeStore((state) => state.nearbySeatId);
  const seatId = useCafeStore((state) => state.self?.seatId);
  const touch = useMediaQuery(TOUCH_QUERY);

  if (seatId) {
    return touch ? (
      <PromptBubble>
        Chạm <Key>Đứng dậy</Key> để rời ghế
      </PromptBubble>
    ) : (
      <PromptBubble>
        Nhấn <Key>E</Key> để đứng dậy
      </PromptBubble>
    );
  }
  if (!nearbySeatId) return null;
  const seat = SEATS_BY_ID.get(nearbySeatId);
  const where = tableLabel(seat?.seatGroupId);

  return touch ? (
    <PromptBubble>
      Chạm <Key>Ngồi</Key> để ngồi vào {where}
    </PromptBubble>
  ) : (
    <PromptBubble>
      Nhấn <Key>E</Key> để ngồi vào {where}
    </PromptBubble>
  );
}

function PromptBubble({ children }: { children: React.ReactNode }) {
  // Clear of the joystick and the dock on a phone, clear of nothing much on a
  // laptop.
  return (
    <div className="pointer-events-none absolute bottom-[13.5rem] left-1/2 z-20 max-w-[92vw] -translate-x-1/2 text-balance rounded-full border border-white/15 bg-espresso/85 px-4 py-1.5 text-center text-xs text-cream shadow-panel backdrop-blur md:bottom-24">
      {children}
    </div>
  );
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="mx-1 rounded border border-white/25 bg-white/10 px-1.5 py-0.5 font-sans text-[10px]">
      {children}
    </kbd>
  );
}

/** Transient feedback, suppressed by Focus Mode except for errors (SPEC 6.2). */
export function Toasts() {
  const toast = useCafeStore((state) => state.toast);
  const dismiss = useCafeStore((state) => state.dismissToast);
  const focusMode = useCafeStore((state) => state.self?.status === 'focus' && Boolean(state.self?.seatId));

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(dismiss, 4000);
    return () => window.clearTimeout(timer);
  }, [toast, dismiss]);

  if (!toast) return null;
  if (focusMode && toast.tone !== 'error') return null;

  return (
    <div
      role={toast.tone === 'error' ? 'alert' : 'status'}
      aria-live={toast.tone === 'error' ? 'assertive' : 'polite'}
      className={`pointer-events-auto absolute bottom-[13.5rem] left-1/2 z-30 max-w-[92vw] -translate-x-1/2 animate-fade-up rounded-lg border px-3 py-2 text-center text-xs shadow-panel backdrop-blur md:bottom-6 ${
        toast.tone === 'error'
          ? 'border-[#a8584a]/60 bg-[#43211b]/90 text-[#f0c6bb]'
          : 'border-white/15 bg-espresso/90 text-cream'
      }`}
    >
      {toast.message}
    </div>
  );
}
