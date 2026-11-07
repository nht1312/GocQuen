'use client';

import { useState } from 'react';
import { tableLabel } from '@virtual-cafe/shared';
import { useCafeStore } from '@/state/useCafeStore';
import { IconButton, Panel, Slider, Toggle } from './ui';
import { PHASE_LABELS, WEATHER_LABELS } from '@/world/ambience';

interface Props {
  onToggleMic: () => void;
  onJoinVoice: () => void;
  onLeaveVoice: () => void;
  onEnableAudio: () => void;
}

/**
 * Audio dock (SPEC 6.4, 10.1). Every layer has its own control, the
 * microphone is a separate deliberate action, and the state of both is always
 * written out in words — never signalled by colour alone (SPEC 16.3).
 */
export function AudioDock({ onToggleMic, onJoinVoice, onLeaveVoice, onEnableAudio }: Props) {
  const [expanded, setExpanded] = useState(true);
  const audio = useCafeStore((state) => state.audio);
  const update = useCafeStore((state) => state.updateAudio);
  const audioStarted = useCafeStore((state) => state.audioStarted);
  const audioBlocked = useCafeStore((state) => state.audioBlocked);
  const micOn = useCafeStore((state) => state.micOn);
  const micError = useCafeStore((state) => state.micError);
  const ncMode = useCafeStore((state) => state.noiseCancellationMode);
  const ambience = useCafeStore((state) => state.ambience);
  const voicePhase = useCafeStore((state) => state.voicePhase);
  const voiceGroupId = useCafeStore((state) => state.voiceGroupId);
  const seated = Boolean(useCafeStore((state) => state.self?.seatId));

  const voiceLabel = {
    off: 'Chưa tham gia cuộc trò chuyện nào',
    connecting: 'Đang vào cuộc trò chuyện…',
    connected: `Đang trò chuyện tại ${tableLabel(voiceGroupId)}`,
    unavailable: 'Không dùng được giọng nói ở đây',
    error: 'Lỗi giọng nói',
  }[voicePhase];

  return (
    <Panel
      title="Âm thanh"
      action={
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="rounded px-1.5 py-0.5 text-[11px] text-linen/70 hover:text-cream focus:outline-none focus-visible:ring-2 focus-visible:ring-caramel"
          aria-expanded={expanded}
        >
          {expanded ? 'Thu gọn' : 'Mở rộng'}
        </button>
      }
    >
      {!audioStarted || audioBlocked ? (
        <button
          type="button"
          onClick={onEnableAudio}
          className="mb-3 w-full rounded-lg border border-caramel/60 bg-caramel/15 px-3 py-2 text-xs font-medium text-cream hover:bg-caramel/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-caramel"
        >
          {audioBlocked
            ? 'Trình duyệt đã chặn âm thanh — chạm để bật tiếng quán'
            : 'Bật tiếng quán'}
        </button>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <IconButton
          label={micOn ? 'Tắt micro' : 'Bật micro'}
          active={micOn}
          onClick={onToggleMic}
          disabled={voicePhase !== 'connected'}
        >
          <span aria-hidden>{micOn ? '●' : '○'}</span>
          <span className="text-xs">{micOn ? 'Micro đang bật' : 'Micro đang tắt'}</span>
        </IconButton>

        {voicePhase === 'connected' ? (
          <IconButton label="Rời cuộc trò chuyện" onClick={onLeaveVoice}>
            <span className="text-xs">Rời trò chuyện</span>
          </IconButton>
        ) : (
          <IconButton
            label="Tham gia trò chuyện tại bàn của bạn"
            onClick={onJoinVoice}
            disabled={!seated || voicePhase === 'unavailable' || voicePhase === 'connecting'}
          >
            <span className="text-xs">Tham gia trò chuyện</span>
          </IconButton>
        )}

        <IconButton
          label={audio.muteAll ? 'Bật lại toàn bộ âm thanh' : 'Tắt toàn bộ âm thanh'}
          active={audio.muteAll}
          onClick={() => update({ muteAll: !audio.muteAll })}
        >
          <span className="text-xs">{audio.muteAll ? 'Đã tắt tiếng' : 'Tắt tất cả'}</span>
        </IconButton>
      </div>

      <p className="mt-2 text-[11px] leading-snug text-linen/60">
        {voiceLabel}
        {!seated && voicePhase === 'off' ? ' · hãy ngồi vào bàn để trò chuyện' : ''}
      </p>
      {micError ? (
        <p role="alert" className="mt-1 text-[11px] leading-snug text-[#e7a99c]">
          {micError}
        </p>
      ) : null}

      {expanded ? (
        <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
          <Slider label="Tổng" value={audio.master} onChange={(master) => update({ master })} disabled={audio.muteAll} />
          <Slider label="Nhạc" value={audio.music} onChange={(music) => update({ music })} disabled={audio.muteAll} />
          <Slider label="Tiếng quán" value={audio.ambience} onChange={(ambience) => update({ ambience })} disabled={audio.muteAll} />
          <Slider label="Tiếng mưa" value={audio.weather} onChange={(weather) => update({ weather })} disabled={audio.muteAll} />
          {ambience?.live ? (
            <p className="truncate text-[10px] leading-snug text-linen/55" title="Thời tiết thực bên ngoài quán">
              Ngoài trời {ambience.locationLabel}: {WEATHER_LABELS[ambience.weather]}
              {ambience.temperatureC !== null ? ` · ${Math.round(ambience.temperatureC)}°C` : ''} ·{' '}
              {PHASE_LABELS[ambience.phase]}
            </p>
          ) : null}
          <Slider label="Tiếng rì rầm" value={audio.crowd} onChange={(crowd) => update({ crowd })} disabled={audio.muteAll} />
          <Slider label="Giọng nói" value={audio.voice} onChange={(voice) => update({ voice })} disabled={audio.muteAll} />

          <div className="space-y-2 border-t border-white/10 pt-3">
            <Toggle
              label="Chế độ tập trung"
              description="Làm căn phòng yên hơn và ẩn thông báo. Không thay đổi ai nghe được bạn."
              checked={audio.focusMode}
              onChange={(focusMode) => update({ focusMode })}
            />
            <Toggle
              label="Lọc tiếng ồn micro"
              description={
                ncMode === 'enhanced'
                  ? 'Đang lọc tiếng ồn nâng cao (Krisp) cho micro của bạn.'
                  : ncMode === 'standard'
                    ? 'Trình duyệt/máy chủ này chỉ hỗ trợ lọc tiếng ồn cơ bản.'
                    : 'Lọc tiếng quạt, xe cộ, bàn phím khỏi micro của bạn. Chỉ ảnh hưởng tới tiếng bạn gửi đi.'
              }
              checked={audio.noiseCancellation ?? true}
              onChange={(noiseCancellation) => update({ noiseCancellation })}
            />
            <Toggle
              label="Giảm chuyển động"
              description="Tắt hiệu ứng khói, mưa và chuyển động khi đi lại."
              checked={audio.reducedMotion}
              onChange={(reducedMotion) => update({ reducedMotion })}
            />
          </div>
          <p className="pt-1 text-[10px] leading-snug text-linen/45">
            Tiếng rì rầm xung quanh là âm thanh nền thu sẵn của quán, không phải micro của
            người khác.
          </p>
        </div>
      ) : null}
    </Panel>
  );
}
