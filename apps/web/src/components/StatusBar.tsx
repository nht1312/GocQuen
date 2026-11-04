'use client';

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

/** Compact status strip (SPEC 10.1) — never covers more of the map than it must. */
export function StatusBar({ onStatusChange, onStand, onLeave, onOpenHelp }: Props) {
  const self = useCafeStore((state) => state.self);
  const preset = AVATAR_PRESETS.find((item) => item.id === self?.avatar.presetId) ?? AVATAR_PRESETS[0];

  // `in_conversation` is set by the server when you join a table's voice.
  const selectable = PLAYER_STATUSES.filter((status) => status !== 'in_conversation');

  return (
    <div className="pointer-events-auto flex items-center gap-3 rounded-xl border border-white/10 bg-espresso/85 px-3 py-2 text-cream shadow-panel backdrop-blur-md">
      <span
        aria-hidden
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full"
        style={{ backgroundColor: preset.top }}
      >
        <span className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: preset.skin }} />
      </span>

      <div className="min-w-0">
        <p className="truncate text-sm font-medium leading-tight">{self?.displayName ?? 'Khách'}</p>
        <p className="truncate text-[11px] leading-tight text-linen/60">
          {self?.seatId ? `Đang ngồi · ${tableLabel(self.seatId.split(':')[0])}` : 'Đang đứng'}
        </p>
      </div>

      <label className="ml-2 text-[11px] text-linen/70">
        <span className="sr-only">Trạng thái của bạn</span>
        <select
          value={self?.status ?? 'available'}
          onChange={(event) => onStatusChange(event.target.value as PlayerStatus)}
          disabled={self?.status === 'in_conversation'}
          className="rounded-lg border border-white/15 bg-charcoal px-2 py-1 text-xs text-cream focus:outline-none focus-visible:ring-2 focus-visible:ring-caramel disabled:opacity-60"
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

      {self?.seatId ? (
        <button
          type="button"
          onClick={onStand}
          className="whitespace-nowrap rounded-lg border border-white/15 px-2.5 py-1 text-xs hover:border-caramel/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-caramel"
        >
          Đứng dậy
        </button>
      ) : null}

      <button
        type="button"
        onClick={onOpenHelp}
        className="whitespace-nowrap rounded-lg border border-white/15 px-2.5 py-1 text-xs hover:border-caramel/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-caramel"
      >
        Trợ giúp
      </button>
      <button
        type="button"
        onClick={onLeave}
        className="whitespace-nowrap rounded-lg border border-white/15 px-2.5 py-1 text-xs text-linen/80 hover:border-caramel/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-caramel"
      >
        Rời quán
      </button>
    </div>
  );
}
