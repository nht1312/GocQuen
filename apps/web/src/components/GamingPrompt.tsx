'use client';

import { useCafeStore } from '@/state/useCafeStore';
import { isNearGamingBanner } from '@/game/gamingEntry';

/** Shown while standing in front of the Khu Chơi Game banner. */
export function GamingPrompt({ onEnter }: { onEnter: () => void }) {
  const near = useCafeStore((state) =>
    isNearGamingBanner(state.self ? { x: state.self.x, y: state.self.y, seatId: state.self.seatId } : null),
  );
  if (!near) return null;
  return (
    <div className="pointer-events-auto absolute left-1/2 top-24 z-20 flex max-w-[92vw] -translate-x-1/2 items-center gap-3 rounded-2xl border border-[#a866ff]/50 bg-[#1d1726]/90 px-4 py-2.5 text-cream shadow-[0_0_24px_rgba(168,102,255,0.3)] backdrop-blur-md">
      <span aria-hidden className="text-lg">🎮</span>
      <p className="text-xs leading-snug text-linen/85">
        Bạn đang ở trước <span className="font-semibold text-[#e2d0ff]">Khu Chơi Game</span>
      </p>
      <button
        type="button"
        onClick={onEnter}
        className="shrink-0 rounded-lg bg-[#a866ff] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#9550f0] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e2d0ff]"
      >
        Vào Khu Chơi Game
      </button>
    </div>
  );
}
