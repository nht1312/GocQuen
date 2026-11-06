"use client";

interface Props {
  /** Centre of the player's table, in CSS px relative to the café canvas. */
  anchor: { x: number; y: number };
  onChat: () => void;
  onScreen: () => void;
  onHoverChange: (hovering: boolean) => void;
}

/**
 * Two quick actions that float above the table you are sitting at.
 *
 * The bubble is clamped inside the viewport so it never pushes the layout or
 * slides under the edge of the screen on a small window.
 */
export function TableActions({ anchor, onChat, onScreen, onHoverChange }: Props) {
  const left = `clamp(3rem, ${anchor.x}px, calc(100% - 3rem))`;
  const top = `clamp(4.5rem, ${anchor.y - 70}px, calc(100% - 4rem))`;
  const button =
    "grid h-10 w-10 place-items-center rounded-full border border-white/15 bg-espresso/90 text-cream shadow-panel backdrop-blur-md transition hover:border-caramel hover:bg-caramel/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-caramel";
  return (
    <div
      className="pointer-events-auto absolute z-20 flex -translate-x-1/2 -translate-y-1/2 gap-2"
      style={{ left, top }}
      onPointerEnter={() => onHoverChange(true)}
      onPointerLeave={() => onHoverChange(false)}
    >
      <button type="button" onClick={onChat} className={button} title="Trò chuyện tại bàn" aria-label="Mở trò chuyện tại bàn">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path d="M4 5h16v10H9l-5 4V5z" strokeLinejoin="round" />
        </svg>
      </button>
      <button type="button" onClick={onScreen} className={button} title="Chia sẻ màn hình" aria-label="Chia sẻ hoặc xem màn hình của bàn">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <rect x="3" y="4" width="18" height="12" rx="1.5" />
          <path d="M8 20h8M12 16v4" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
