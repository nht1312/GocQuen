'use client';

import { useEffect, useRef } from 'react';
import { useCafeStore } from '@/state/useCafeStore';
import { deriveScreenShareView } from '@/voice/screenShareState';
import { IconButton, Panel } from './ui';

interface Props {
  /** The live <video> element produced by LiveKit, or null when there is none. */
  video: HTMLVideoElement | null;
  onStart: () => void;
  onStop: () => void;
}

/**
 * The shared screen (feature spec §2.3).
 *
 * A live screen takes the interface over by itself: once someone at the table
 * is sharing, that screen is what the table is doing, and everyone who joins
 * to watch should see it full size without hunting for an expand button. The
 * café goes behind it until the share ends or someone asks for it back.
 *
 * Outside a live share the panel floats among the others, so starting a share
 * is one small control rather than a mode you enter.
 *
 * The <video> element is created by LiveKit and adopted here rather than
 * rendered by React. Letting React own it would mean re-creating the element
 * on each render and re-attaching the media track, which drops frames; this
 * way the element outlives renders and only its container changes.
 */
export function ScreenSharePanel({ video, onStart, onStop }: Props) {
  const session = useCafeStore((state) => state.screenShare);
  const local = useCafeStore((state) => state.screenShareLocal);
  const focus = useCafeStore((state) => state.screenShareFocus);
  const setFocused = useCafeStore((state) => state.setScreenShareFocus);
  const self = useCafeStore((state) => state.self);
  const seated = Boolean(self?.seatId);

  const view = deriveScreenShareView({
    session,
    selfId: self?.userId ?? null,
    seated,
    local,
  });

  // The phase drives this from useCafe, so that a share going live takes
  // the interface over whether or not this panel happens to be mounted.
  const focused = focus.focused;

  const mount = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = mount.current;
    if (!host || !video) return;
    video.className = 'h-full w-full bg-black object-contain';
    host.appendChild(video);
    return () => {
      // Detach rather than destroy: the track may still be live and simply
      // moving between the floating and focused containers.
      if (video.parentElement === host) host.removeChild(video);
    };
  }, [video, focused]);

  // Nothing to show and nothing being attempted.
  if (view.phase === 'idle' && !view.canStart) return null;

  if (view.phase === 'idle') {
    return (
      <Panel title="Màn hình" className="w-[290px]">
        <p className="mb-2 text-[11px] leading-snug text-linen/60">
          Chia sẻ màn hình của bạn với những người ngồi cùng bàn.
        </p>
        <IconButton label="Chia sẻ màn hình của bạn" onClick={onStart}>
          <span className="text-xs">Chia sẻ màn hình</span>
        </IconButton>
      </Panel>
    );
  }

  const live = view.phase === 'publishing' || view.phase === 'watching';

  const body = (
    <>
      <div
        ref={mount}
        className={`relative overflow-hidden rounded-lg bg-black ${
          focused ? 'h-[calc(100dvh-12rem)] w-full' : 'aspect-video w-full'
        }`}
      >
        {!video ? (
          <p className="grid h-full place-items-center p-4 text-center text-[11px] text-linen/60">
            {view.message ?? 'Đang chờ màn hình…'}
          </p>
        ) : null}
      </div>

      <p className="mt-2 text-[11px] leading-snug text-linen/65">
        {view.phase === 'publishing'
          ? 'Bạn đang chia sẻ màn hình với bàn của mình'
          : (view.message ?? `${view.session?.publisherName} đang chia sẻ màn hình`)}
      </p>

      <div className="mt-2 flex flex-wrap gap-2">
        {live ? (
          <IconButton
            label={focused ? 'Thu nhỏ màn hình' : 'Phóng to màn hình'}
            onClick={() => setFocused(!focused)}
          >
            <span className="text-xs">{focused ? 'Thu nhỏ' : 'Phóng to'}</span>
          </IconButton>
        ) : null}
        {view.isPublisher ? (
          <IconButton label="Dừng chia sẻ màn hình" onClick={onStop}>
            <span className="text-xs">Dừng chia sẻ</span>
          </IconButton>
        ) : null}
        {view.canStart ? (
          <IconButton label="Thử chia sẻ màn hình lại" onClick={onStart}>
            <span className="text-xs">Thử lại</span>
          </IconButton>
        ) : null}
      </div>
    </>
  );

  if (!focused) {
    return (
      <Panel title="Màn hình" className="w-[290px]">
        {body}
      </Panel>
    );
  }

  return (
    <div className="pointer-events-auto fixed inset-0 z-30 grid place-items-center bg-charcoal/90 p-4 backdrop-blur-sm">
      {/* As wide as the display allows: the point of taking over is that the
          screen is readable, not that it is merely bigger. */}
      <div className="w-full max-w-[1600px]">
        <Panel
          title={
            view.phase === 'publishing'
              ? 'Màn hình của bạn'
              : `Màn hình của ${view.session?.publisherName ?? ''}`
          }
          action={
            <button
              type="button"
              onClick={() => setFocused(false)}
              className="rounded px-1.5 py-0.5 text-[11px] text-linen/70 hover:text-cream focus:outline-none focus-visible:ring-2 focus-visible:ring-caramel"
            >
              Quay lại quán
            </button>
          }
        >
          {body}
        </Panel>
      </div>
    </div>
  );
}
