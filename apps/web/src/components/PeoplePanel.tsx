'use client';

import { useMemo, useState } from 'react';
import {
  MODERATION_REASON_LABELS,
  MODERATION_REASONS,
  ModerationReason,
  STATUS_LABELS,
} from '@virtual-cafe/shared';
import { DEMO_MODE } from '@/lib/flags';
import { useCafeStore } from '@/state/useCafeStore';
import { StatusIcon } from './StatusIcon';
import { Panel } from './ui';

interface Props {
  onMute: (userId: string) => void;
  onBlock: (userId: string) => void;
  onReport: (userId: string, reason: ModerationReason, details?: string) => void;
}


/** People panel (SPEC 10.1): who is here, what they are doing, and where. */
export function PeoplePanel({ onMute, onBlock, onReport }: Props) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [reporting, setReporting] = useState<string | null>(null);
  const players = useCafeStore((state) => state.players);
  const self = useCafeStore((state) => state.self);
  const npcs = useCafeStore((state) => state.npcs);
  const mutedUsers = useCafeStore((state) => state.mutedUsers);
  const capacity = useCafeStore((state) => state.capacity);
  const people = useCafeStore((state) => state.people);

  const rows = useMemo(() => people(), [people, players, self, npcs, mutedUsers]);
  const guests = rows.filter((row) => !row.isNpc);

  return (
    <Panel title={`Trong quán · ${guests.length}/${capacity}`}>
      <ul className="max-h-[46vh] space-y-1 overflow-y-auto overscroll-contain pr-1 md:max-h-[42vh]">
        {rows.map((row) => (
          <li key={row.userId} className="rounded-lg px-2 py-1.5 hover:bg-white/5">
            <div className="flex items-center gap-2">
              <span aria-hidden className="grid w-4 shrink-0 place-items-center text-caramel">
                <StatusIcon status={row.status} isNpc={row.isNpc} size={14} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-cream">
                  {row.displayName}
                  {row.isSelf ? <span className="text-linen/50"> · bạn</span> : null}
                  {row.isNpc ? <span className="text-linen/50"> · khách quen</span> : null}
                </span>
                <span className="block truncate text-[11px] text-linen/55">
                  {row.isNpc ? 'Một phần của khung cảnh' : STATUS_LABELS[row.status]} · {row.zone}
                  {row.micOn ? ' · micro đang bật' : row.inVoiceGroup ? ' · đang trò chuyện' : ''}
                  {row.muted ? ' · bạn đã tắt tiếng' : ''}
                </span>
              </span>
              {/* Demo mode hides the only entry point, so the menu and the
                  report form below are unreachable without removing them. */}
              {!DEMO_MODE && !row.isSelf && !row.isNpc ? (
                <button
                  type="button"
                  onClick={() => setOpenMenu(openMenu === row.userId ? null : row.userId)}
                  aria-label={`Tuỳ chọn cho ${row.displayName}`}
                  aria-expanded={openMenu === row.userId}
                  className="grid h-10 w-9 shrink-0 place-items-center rounded text-linen/60 hover:text-cream focus:outline-none focus-visible:ring-2 focus-visible:ring-caramel md:h-auto md:w-auto md:px-1.5"
                >
                  ⋯
                </button>
              ) : null}
            </div>

            {openMenu === row.userId ? (
              <div className="mt-1.5 flex flex-wrap gap-1.5 border-t border-white/10 pt-1.5">
                <button
                  type="button"
                  onClick={() => onMute(row.userId)}
                  className="min-h-10 rounded border border-white/15 px-2.5 py-1 text-[11px] text-linen hover:border-caramel/70 md:min-h-0 md:px-2"
                >
                  {row.muted ? 'Bật tiếng lại' : 'Tắt tiếng với tôi'}
                </button>
                <button
                  type="button"
                  onClick={() => setReporting(reporting === row.userId ? null : row.userId)}
                  className="min-h-10 rounded border border-white/15 px-2.5 py-1 text-[11px] text-linen hover:border-caramel/70 md:min-h-0 md:px-2"
                >
                  Báo cáo
                </button>
                <button
                  type="button"
                  onClick={() => onBlock(row.userId)}
                  className="min-h-10 rounded border border-[#a8584a]/60 px-2.5 py-1 text-[11px] text-[#e7a99c] hover:bg-[#a8584a]/15 md:min-h-0 md:px-2"
                >
                  Chặn
                </button>
              </div>
            ) : null}

            {reporting === row.userId ? (
              <form
                className="mt-1.5 space-y-1.5"
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  onReport(
                    row.userId,
                    form.get('reason') as ModerationReason,
                    String(form.get('details') ?? '') || undefined,
                  );
                  setReporting(null);
                  setOpenMenu(null);
                }}
              >
                <label className="block text-[11px] text-linen/70">
                  Lý do
                  <select
                    name="reason"
                    className="mt-0.5 w-full rounded border border-white/15 bg-charcoal px-2 py-1 text-[11px] text-cream"
                  >
                    {MODERATION_REASONS.map((reason) => (
                      <option key={reason} value={reason}>
                        {MODERATION_REASON_LABELS[reason]}
                      </option>
                    ))}
                  </select>
                </label>
                <textarea
                  name="details"
                  rows={2}
                  placeholder="Chuyện gì đã xảy ra? (không bắt buộc)"
                  className="w-full rounded border border-white/15 bg-charcoal px-2 py-1 text-[11px] text-cream placeholder:text-linen/35"
                />
                <button
                  type="submit"
                  className="min-h-10 rounded bg-caramel px-3 py-1 text-[11px] font-medium text-espresso hover:bg-caramel/90 md:min-h-0 md:px-2"
                >
                  Gửi báo cáo
                </button>
              </form>
            ) : null}
          </li>
        ))}
      </ul>
    </Panel>
  );
}
