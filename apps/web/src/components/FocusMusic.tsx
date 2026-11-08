'use client';

import { useEffect, useRef, useState } from 'react';
import { useCafeStore } from '@/state/useCafeStore';
import { parseMusicLink } from '@/audio/personalMusic';

/**
 * "Cần tập trung" music: a link the listener pastes, played only in their
 * own browser. Opened from the status select when they pick focus mode.
 */
export function FocusMusicDialog({ onClose }: { onClose: () => void }) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const music = useCafeStore((state) => state.personalMusic);
  const setMusic = useCafeStore((state) => state.setPersonalMusic);
  const input = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    input.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const play = () => {
    const parsed = parseMusicLink(draft);
    if ('error' in parsed) {
      setError(parsed.error);
      return;
    }
    let label = draft.trim();
    try {
      const url = new URL(label);
      label = url.hostname.replace(/^www\./, '') + url.pathname;
    } catch {
      /* keep raw */
    }
    // Set from the click itself: browsers only let audio start inside a
    // user gesture, and the player below starts in this same event.
    setMusic({ source: parsed, label });
    onClose();
  };

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-40 grid place-items-center bg-charcoal/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Nhạc cho chế độ tập trung"
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-white/10 bg-espresso p-4 text-cream shadow-panel"
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Chế độ tập trung</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-0.5 text-[11px] text-linen/70 hover:text-cream focus:outline-none focus-visible:ring-2 focus-visible:ring-caramel"
          >
            Đóng
          </button>
        </div>
        <p className="mb-3 text-[11px] leading-snug text-linen/60">
          Dán link nhạc để nghe trong lúc tập trung. Khi nhạc phát, mọi âm thanh của quán sẽ tắt để bạn chỉ nghe nhạc của mình. Chỉ mình bạn nghe được; nhạc dừng khi bạn đổi chế độ hoặc đứng dậy.
        </p>

        {music ? (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-caramel/40 bg-caramel/10 px-2 py-1.5">
            <span aria-hidden>♪</span>
            <p className="min-w-0 flex-1 truncate text-[11px]" title={music.label}>
              Đang phát · {music.label}
            </p>
            <button
              type="button"
              onClick={() => setMusic(null)}
              className="shrink-0 rounded px-1.5 py-0.5 text-[11px] text-linen/80 hover:text-cream"
            >
              Dừng
            </button>
          </div>
        ) : null}

        <form
          onSubmit={(event) => {
            event.preventDefault();
            play();
          }}
          className="space-y-1.5"
        >
          <div className="flex gap-1.5">
            <input
              ref={input}
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                setError(null);
              }}
              placeholder="Dán link YouTube, SoundCloud hoặc .mp3"
              aria-label="Link nhạc"
              className="min-h-10 min-w-0 flex-1 rounded-lg border border-white/15 bg-charcoal px-2.5 py-1.5 text-xs text-cream placeholder:text-linen/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-caramel"
            />
            <button
              type="submit"
              disabled={draft.trim().length === 0}
              className="min-h-10 shrink-0 rounded-lg bg-caramel px-3 text-xs font-medium text-espresso hover:bg-caramel/90 disabled:opacity-40"
            >
              Phát
            </button>
          </div>
          {error ? (
            <p role="alert" className="text-[11px] leading-snug text-[#e7a99c]">
              {error}
            </p>
          ) : (
            <p className="text-[10px] leading-snug text-linen/45">Hoặc bỏ qua để tập trung trong yên lặng.</p>
          )}
        </form>
      </div>
    </div>
  );
}

/**
 * The player. Mounted once by the café shell — not inside a panel — so it
 * keeps playing when panels change.
 *
 * Why the old one stayed silent:
 *  - The <audio> only mounted after the link was set, and `play()` ran in an
 *    effect a frame later, outside the click — browsers reject that.
 *    Now one element lives for the whole visit and plays the moment it has
 *    a source, with `autoplay` as a second try.
 *  - YouTube / SoundCloud embeds were squeezed to 1×1 px off-screen; YouTube
 *    refuses to play in a player that small, and autoplay with sound needs
 *    the iframe to be allowed it. Now it is a small 200×113 player in the
 *    bottom-left corner (visible, so the listener can also press play if the
 *    browser still blocks it), with `allow="autoplay"`.
 */
export function FocusMusicPlayer() {
  const music = useCafeStore((state) => state.personalMusic);
  const audio = useCafeStore((state) => state.audio);
  const setMusic = useCafeStore((state) => state.setPersonalMusic);
  const showToast = useCafeStore((state) => state.showToast);
  const element = useRef<HTMLAudioElement | null>(null);

  const volume = audio.muteAll ? 0 : Math.max(0, Math.min(1, audio.music * audio.master));
  const src = music?.source.kind === 'audio' ? music.source.url : null;

  useEffect(() => {
    if (element.current) element.current.volume = volume;
  }, [volume]);

  useEffect(() => {
    const player = element.current;
    if (!player) return;
    if (!src) {
      player.pause();
      player.removeAttribute('src');
      player.load();
      return;
    }
    if (player.src !== src) player.src = src;
    player.play().catch((error: unknown) => {
      const name = error instanceof DOMException ? error.name : '';
      // NotAllowed = autoplay policy; the controls toast lets them retry.
      showToast(
        name === 'NotAllowedError'
          ? 'Trình duyệt chặn tự phát nhạc. Bấm ♪ Nhạc rồi Phát lại.'
          : 'Không phát được link nhạc này.',
        'error',
      );
      if (name !== 'NotAllowedError') setMusic(null);
    });
  }, [src, setMusic, showToast]);

  const embed = music && music.source.kind !== 'audio' ? music.source.embedUrl : null;

  return (
    <>
      <audio
        ref={element}
        loop
        preload="auto"
        className="hidden"
        onError={() => {
          if (!src) return;
          showToast('Không phát được link nhạc này.', 'error');
          setMusic(null);
        }}
      />
      {embed ? (
        <div className="pointer-events-auto fixed bottom-3 left-3 z-30 overflow-hidden rounded-xl border border-white/10 bg-black shadow-panel">
          <div className="flex items-center justify-between gap-2 bg-espresso/95 px-2 py-1 text-[10px] text-linen/75">
            <span className="truncate">♪ {music?.label}</span>
            <span className="flex shrink-0 gap-2">
              {music?.source.kind === 'youtube' ? (
                <a
                  href={music.source.watchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Nếu video báo không phát được ở đây, mở trên YouTube"
                  className="hover:text-cream"
                >
                  Mở YouTube
                </a>
              ) : null}
              <button type="button" onClick={() => setMusic(null)} className="hover:text-cream">
                Dừng
              </button>
            </span>
          </div>
          <iframe
            key={embed}
            src={embed}
            title="Nhạc riêng cho chế độ tập trung"
            allow="autoplay; encrypted-media; picture-in-picture"
            referrerPolicy="strict-origin-when-cross-origin"
            width={200}
            height={113}
            className="block"
          />
        </div>
      ) : null}
    </>
  );
}
