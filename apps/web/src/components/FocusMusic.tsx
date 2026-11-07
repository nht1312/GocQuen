'use client';

import { useEffect, useRef, useState } from 'react';
import { useCafeStore } from '@/state/useCafeStore';
import { parseMusicLink } from '@/audio/personalMusic';

/**
 * The request form, shown inside the audio panel while Focus Mode is on.
 */
export function FocusMusicRequest() {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const source = useCafeStore((state) => state.personalMusic);
  const setSource = useCafeStore((state) => state.setPersonalMusic);

  if (source) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-caramel/40 bg-caramel/10 px-2 py-1.5">
        <span aria-hidden>♪</span>
        <p className="min-w-0 flex-1 truncate text-[11px] text-cream" title={source.label}>
          Đang phát nhạc riêng của bạn · {source.label}
        </p>
        <button
          type="button"
          onClick={() => setSource(null)}
          className="shrink-0 rounded px-1.5 py-0.5 text-[11px] text-linen/80 hover:text-cream focus:outline-none focus-visible:ring-2 focus-visible:ring-caramel"
        >
          Dừng
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
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
        setError(null);
        setDraft('');
        setSource({ source: parsed, label });
      }}
      className="space-y-1"
    >
      <div className="flex gap-1.5">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Dán link YouTube, SoundCloud hoặc .mp3"
          aria-label="Link nhạc cho chế độ tập trung"
          className="min-h-9 min-w-0 flex-1 rounded-lg border border-white/15 bg-charcoal px-2 py-1 text-[11px] text-cream placeholder:text-linen/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-caramel"
        />
        <button
          type="submit"
          disabled={draft.trim().length === 0}
          className="min-h-9 shrink-0 rounded-lg bg-caramel px-2.5 text-[11px] font-medium text-espresso hover:bg-caramel/90 disabled:opacity-40"
        >
          Phát
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-[10px] leading-snug text-[#e7a99c]">
          {error}
        </p>
      ) : (
        <p className="text-[10px] leading-snug text-linen/45">
          Chỉ mình bạn nghe được. Nhạc dừng khi bạn tắt chế độ tập trung hoặc đổi trạng thái.
        </p>
      )}
    </form>
  );
}

/**
 * The player itself. Mounted once by the café shell — not inside a panel —
 * so switching panel tabs never stops the music. Invisible: the controls
 * live in the request form.
 */
export function FocusMusicPlayer() {
  const music = useCafeStore((state) => state.personalMusic);
  const audio = useCafeStore((state) => state.audio);
  const setSource = useCafeStore((state) => state.setPersonalMusic);
  const showToast = useCafeStore((state) => state.showToast);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const volume = audio.muteAll ? 0 : Math.max(0, Math.min(1, audio.music * audio.master));

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume, music]);

  useEffect(() => {
    const element = audioRef.current;
    if (!element || music?.source.kind !== 'audio') return;
    element.play().catch(() => {
      showToast('Không phát được link nhạc này.', 'error');
      setSource(null);
    });
  }, [music, setSource, showToast]);

  if (!music) return null;
  const { source } = music;

  if (source.kind === 'audio') {
    return (
      <audio
        ref={audioRef}
        src={source.url}
        loop
        hidden
        onError={() => {
          showToast('Không phát được link nhạc này.', 'error');
          setSource(null);
        }}
      />
    );
  }

  // Embeds are kept off-screen rather than display:none, which some
  // players treat as "not visible" and refuse to autoplay.
  return (
    <iframe
      key={source.embedUrl}
      src={source.embedUrl}
      title="Nhạc riêng cho chế độ tập trung"
      allow="autoplay; encrypted-media"
      className="pointer-events-none fixed -left-[9999px] top-0 h-[1px] w-[1px] opacity-0"
      tabIndex={-1}
      aria-hidden
    />
  );
}
