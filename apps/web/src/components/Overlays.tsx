'use client';

import { useEffect } from 'react';
import { SEATS_BY_ID, tableLabel } from '@virtual-cafe/shared';
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
      className="pointer-events-none absolute left-1/2 top-4 z-30 -translate-x-1/2 rounded-full border border-white/15 bg-espresso/90 px-4 py-1.5 text-xs text-cream shadow-panel backdrop-blur"
    >
      {phase === 'error' ? '⚠ ' : '◌ '}
      {text}
    </div>
  );
}

/** Contextual prompt for the seat within reach (SPEC 10.1). */
export function InteractionPrompt() {
  const nearbySeatId = useCafeStore((state) => state.nearbySeatId);
  const seatId = useCafeStore((state) => state.self?.seatId);

  if (seatId) {
    return (
      <PromptBubble>
        Nhấn <Key>E</Key> để đứng dậy
      </PromptBubble>
    );
  }
  if (!nearbySeatId) return null;
  const seat = SEATS_BY_ID.get(nearbySeatId);

  return (
    <PromptBubble>
      Nhấn <Key>E</Key> để ngồi vào {tableLabel(seat?.seatGroupId)}
    </PromptBubble>
  );
}

function PromptBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="pointer-events-none absolute bottom-24 left-1/2 z-20 -translate-x-1/2 rounded-full border border-white/15 bg-espresso/85 px-4 py-1.5 text-xs text-cream shadow-panel backdrop-blur">
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
  const focusMode = useCafeStore((state) => state.audio.focusMode);

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
      className={`pointer-events-auto absolute bottom-6 left-1/2 z-30 -translate-x-1/2 animate-fade-up rounded-lg border px-3 py-2 text-xs shadow-panel backdrop-blur ${
        toast.tone === 'error'
          ? 'border-[#a8584a]/60 bg-[#43211b]/90 text-[#f0c6bb]'
          : 'border-white/15 bg-espresso/90 text-cream'
      }`}
    >
      {toast.message}
    </div>
  );
}
