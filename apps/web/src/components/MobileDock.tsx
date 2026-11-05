'use client';

import { ReactNode, useEffect } from 'react';
import { useCafeStore } from '@/state/useCafeStore';

export type DockTab = 'audio' | 'screen' | 'people' | 'chat';

interface Props {
  panels: Record<DockTab, ReactNode>;
  /** The open sheet, or null when the café itself has the screen. */
  open: DockTab | null;
  onOpenChange: (tab: DockTab | null) => void;
}

const TABS: { id: DockTab; label: string; glyph: string }[] = [
  { id: 'audio', label: 'Âm thanh', glyph: '♪' },
  { id: 'people', label: 'Mọi người', glyph: '☻' },
  { id: 'chat', label: 'Trò chuyện', glyph: '✉' },
  { id: 'screen', label: 'Màn hình', glyph: '▭' },
];

/**
 * The panels, on a phone (SPEC 10.3).
 *
 * On a laptop the four panels float in a column beside the room. A 290px
 * column on a 390px screen is not a column, it is the screen — so here they
 * become a bar of four tabs along the bottom and one sheet at a time above
 * it. The room stays visible behind the sheet because the point of the café
 * is the room, and only one panel is ever in the way.
 */
export function MobileDock({ panels, open, onOpenChange }: Props) {
  const unread = useCafeStore((state) => state.unreadChat);
  const players = useCafeStore((state) => state.players);
  const hasSelf = Boolean(useCafeStore((state) => state.self));
  const micOn = useCafeStore((state) => state.micOn);
  const voicePhase = useCafeStore((state) => state.voicePhase);

  // Escape closes the sheet, for anyone on a small window with a keyboard.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  const badge = (tab: DockTab): string | null => {
    if (tab === 'chat' && unread > 0) return unread > 9 ? '9+' : String(unread);
    if (tab === 'people') return String(Object.keys(players).length + (hasSelf ? 1 : 0));
    if (tab === 'audio' && micOn) return '●';
    return null;
  };

  return (
    <>
      {open ? (
        <div
          // The room above the sheet doubles as the way out of it: a tap there
          // closes the panel instead of silently going nowhere, which is what
          // an invisible full-height container would otherwise do.
          onClick={(event) => {
            if (event.target === event.currentTarget) onOpenChange(null);
          }}
          className="pointer-events-auto absolute inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] top-16 z-30 flex flex-col justify-end px-2"
        >
          <div className="max-h-full animate-fade-up overflow-y-auto overscroll-contain rounded-2xl">
            {panels[open]}
          </div>
        </div>
      ) : null}

      <nav
        aria-label="Bảng điều khiển quán"
        className="pointer-events-auto absolute inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-white/10 bg-espresso/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md"
      >
        {TABS.map((tab) => {
          const active = open === tab.id;
          const mark = badge(tab.id);
          return (
            <button
              key={tab.id}
              type="button"
              aria-pressed={active}
              onClick={() => onOpenChange(active ? null : tab.id)}
              className={`relative flex min-h-[3.25rem] flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[10px] leading-none transition ${
                active ? 'text-caramel' : 'text-linen/70'
              }`}
            >
              <span aria-hidden className="text-base leading-none">
                {tab.glyph}
              </span>
              <span className="truncate">{tab.label}</span>
              {mark ? (
                <span
                  aria-hidden
                  className={`absolute right-[18%] top-1.5 min-w-4 rounded-full px-1 text-[9px] font-semibold leading-4 ${
                    tab.id === 'audio'
                      ? 'bg-transparent text-caramel'
                      : 'bg-caramel text-espresso'
                  }`}
                >
                  {mark}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      {/* Voice state is the one thing that must be readable without opening a
          panel, because a live microphone is never implied (SPEC 6.2, 14.2). */}
      {voicePhase === 'connected' ? (
        <p className="pointer-events-none absolute inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 text-center text-[10px] text-linen/45">
          {micOn ? 'Micro đang bật' : 'Đang trò chuyện · micro đang tắt'}
        </p>
      ) : null}
    </>
  );
}
