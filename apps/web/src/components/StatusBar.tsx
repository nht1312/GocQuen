'use client';

import { useEffect, useRef, useState } from 'react';
import {
  AVATAR_PRESETS,
  PLAYER_STATUSES,
  PlayerStatus,
  STATUS_LABELS,
  tableLabel,
} from '@virtual-cafe/shared';
import { useCafeStore } from '@/state/useCafeStore';

interface Props {
  onStatusChange: (status: PlayerStatus) => void;
  onStand: () => void;
  onLeave: () => void;
  onOpenHelp: () => void;
}

/**
 * Compact status strip (SPEC 10.1) — never covers more of the map than it must.
 *
 * On a phone "no more than it must" is much less: the avatar, the name and the
 * status picker stay on the strip, because those are what other people see,
 * and the three secondary actions fold into a menu rather than pushing the
 * name off the edge of a 390px screen.
 */
export function StatusBar({ onStatusChange, onStand, onLeave, onOpenHelp }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const self = useCafeStore((state) => state.self);
  const preset = AVATAR_PRESETS.find((item) => item.id === self?.avatar.presetId) ?? AVATAR_PRESETS[0];

  // `in_conversation` is set by the server when you join a table's voice.
  const selectable = PLAYER_STATUSES.filter((status) => status !== 'in_conversation');

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const actionClass =
    'whitespace-nowrap rounded-lg border border-white/15 px-2.5 py-1 text-xs hover:border-caramel/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-caramel';

  const actions = (
    <>
      {self?.seatId ? (
        <button type="button" onClick={onStand} className={actionClass}>
          Đứng dậy
        </button>
      ) : null}
      <button type="button" onClick={onOpenHelp} className={actionClass}>
        Trợ giúp
      </button>
      <button type="button" onClick={onLeave} className={`${actionClass} text-linen/80`}>
        Rời quán
      </button>
    </>
  );

  return (
    <div className="pointer-events-auto flex items-center gap-2 rounded-xl border border-white/10 bg-espresso/85 px-2.5 py-2 text-cream shadow-panel backdrop-blur-md sm:gap-3 sm:px-3">
      <span
        aria-hidden
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full"
        style={{ backgroundColor: preset.top }}
      >
        <span className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: preset.skin }} />
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium leading-tight">{self?.displayName ?? 'Khách'}</p>
        <p className="truncate text-[11px] leading-tight text-linen/60">
          {self?.seatId ? `Đang ngồi · ${tableLabel(self.seatId.split(':')[0])}` : 'Đang đứng'}
        </p>
      </div>

      <label className="shrink-0 text-[11px] text-linen/70 sm:ml-2">
        <span className="sr-only">Trạng thái của bạn</span>
        <select
          value={self?.status ?? 'available'}
          onChange={(event) => onStatusChange(event.target.value as PlayerStatus)}
          disabled={self?.status === 'in_conversation'}
          className="min-h-10 max-w-[7.5rem] rounded-lg border border-white/15 bg-charcoal px-2 py-1.5 text-xs text-cream focus:outline-none focus-visible:ring-2 focus-visible:ring-caramel disabled:opacity-60 sm:min-h-0 sm:max-w-none sm:py-1"
        >
          {self?.status === 'in_conversation' ? (
            <option value="in_conversation">{STATUS_LABELS.in_conversation}</option>
          ) : null}
          {selectable.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      </label>

      <div className="hidden items-center gap-2 sm:flex">{actions}</div>

      <div ref={menuRef} className="relative shrink-0 sm:hidden">
        <button
          type="button"
          onClick={() => setMenuOpen((value) => !value)}
          aria-expanded={menuOpen}
          aria-label="Thêm tuỳ chọn"
          className="grid h-9 w-9 place-items-center rounded-lg border border-white/15 text-base leading-none hover:border-caramel/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-caramel"
        >
          <span aria-hidden>⋯</span>
        </button>
        {menuOpen ? (
          <div
            onClick={() => setMenuOpen(false)}
            className="absolute right-0 top-11 z-10 flex w-max flex-col items-stretch gap-1.5 rounded-xl border border-white/10 bg-espresso p-2 text-left shadow-panel [&>button]:min-h-10 [&>button]:text-left"
          >
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  );
}
