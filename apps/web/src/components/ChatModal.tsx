"use client";

import { useEffect } from "react";
import { ChatPanel } from "./ChatPanel";

/**
 * Table chat in the centre of the screen. Width is capped so it reads well on
 * a laptop and shrinks to the viewport on a phone; height scrolls inside.
 */
export function ChatModal({ onSend, onClose }: { onSend: (body: string) => void; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-30 grid place-items-center bg-charcoal/60 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Trò chuyện tại bàn"
        className="relative w-full max-w-md"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng trò chuyện"
          className="absolute right-2 top-1.5 z-10 rounded px-2 py-0.5 text-[11px] text-linen/70 hover:text-cream focus:outline-none focus-visible:ring-2 focus-visible:ring-caramel"
        >
          Đóng
        </button>
        <ChatPanel onSend={onSend} embedded />
      </div>
    </div>
  );
}
