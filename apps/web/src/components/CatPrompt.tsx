'use client';

import { TOUCH_QUERY, useMediaQuery } from '@/hooks/useMediaQuery';
import { useCafeStore } from '@/state/useCafeStore';

/**
 * Shown while a café cat is within reach. Keyboard: press F. Touch: there is
 * no F, so the prompt itself is the button.
 */
export function CatPrompt({ onInteract }: { onInteract: () => void }) {
  const cat = useCafeStore((state) => state.nearbyCat);
  const touch = useMediaQuery(TOUCH_QUERY);
  if (!cat) return null;
  const action = cat === 'pet' ? 'vuốt ve mèo' : 'ôm mèo';
  const box =
    'absolute bottom-[16.5rem] left-1/2 z-20 max-w-[92vw] -translate-x-1/2 rounded-full border border-caramel/40 bg-espresso/90 px-4 py-1.5 text-center text-xs text-cream shadow-panel backdrop-blur md:bottom-[8.5rem]';

  if (touch) {
    return (
      <button
        type="button"
        onClick={onInteract}
        className={`${box} pointer-events-auto min-h-11 hover:bg-espresso focus:outline-none focus-visible:ring-2 focus-visible:ring-caramel`}
      >
        🐾 Chạm để {action}
      </button>
    );
  }
  return (
    <div className={`${box} pointer-events-none`}>
      🐾 Nhấn{' '}
      <kbd className="mx-1 rounded border border-white/25 bg-white/10 px-1.5 py-0.5 font-sans text-[10px]">F</kbd> để{' '}
      {action}
    </div>
  );
}
