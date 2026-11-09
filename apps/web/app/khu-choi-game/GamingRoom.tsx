'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { STORAGE_KEYS, type GameSummary } from '@virtual-cafe/shared';
import { SERVER_URL, api } from '@/lib/api';
import { readLocal } from '@/lib/storage';

type Phase = 'idle' | 'loading' | 'playing' | 'error';

/**
 * Khu Chơi Game: a library of banners; picking one opens its .nes in the
 * Nostalgist emulator (RetroArch's fceumm core, running in the browser).
 * The list, banners and .nes files are read from the database through the
 * API server; the game itself runs locally in the browser.
 */
export function GamingRoom() {
  const router = useRouter();
  const [games, setGames] = useState<GameSummary[] | null>(null);
  const [listError, setListError] = useState('');
  const [game, setGame] = useState<GameSummary | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState('');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const instanceRef = useRef<{ exit: (options?: { removeCanvas?: boolean }) => unknown } | null>(null);

  const stop = useCallback(() => {
    const instance = instanceRef.current;
    instanceRef.current = null;
    try {
      instance?.exit({ removeCanvas: false });
    } catch {
      /* already stopped */
    }
  }, []);

  // Stop the emulator when leaving the page.
  useEffect(() => stop, [stop]);

  useEffect(() => {
    api
      .games()
      .then((result) => setGames(result.games))
      .catch(() => {
        setGames([]);
        setListError('Không tải được danh sách game. Kiểm tra kết nối rồi tải lại trang.');
      });
  }, []);

  useEffect(() => {
    if (!game || !canvasRef.current) return;
    let cancelled = false;
    setPhase('loading');
    setMessage('');
    (async () => {
      try {
        const session = readLocal(STORAGE_KEYS.session, { token: '' });
        if (!session.token) throw new Error('no session');
        const [{ Nostalgist }, bytes] = await Promise.all([
          import('nostalgist'),
          api.gameRom(session.token, game.romUrl),
        ]);
        if (cancelled) return;
        const instance = await Nostalgist.launch({
          core: 'fceumm',
          rom: { fileName: `${game.id}.nes`, fileContent: new Blob([bytes]) },
          element: canvasRef.current!,
        });
        if (cancelled) {
          instance.exit({ removeCanvas: false });
          return;
        }
        instanceRef.current = instance;
        setPhase('playing');
      } catch (error) {
        if (cancelled) return;
        console.error('[game] failed to start', error);
        setPhase('error');
        setMessage('Không mở được game này. Hãy vào quán trước (để có phiên khách) rồi thử lại.');
      }
    })();
    return () => {
      cancelled = true;
      stop();
    };
  }, [game, stop]);

  const backToLibrary = () => {
    stop();
    setGame(null);
    setPhase('idle');
  };

  return (
    <main className="relative min-h-dvh overflow-hidden bg-[#141019] p-4 text-cream sm:p-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(168,102,255,0.22),transparent_60%)]"
      />
      <div className="relative mx-auto w-full max-w-4xl">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.3em] text-[#c9a8ff]">Góc Quen</p>
            <h1 className="text-2xl font-bold tracking-wide text-[#e2d0ff] [text-shadow:0_0_18px_#a866ff]">
              KHU CHƠI GAME
            </h1>
          </div>
          <div className="flex gap-2">
            {game ? (
              <button
                type="button"
                onClick={backToLibrary}
                className="rounded-lg border border-[#a866ff]/50 px-3 py-2 text-xs text-[#e2d0ff] hover:bg-[#a866ff]/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e2d0ff]"
              >
                ← Chọn game khác
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                stop();
                router.push('/cafe');
              }}
              className="rounded-lg bg-caramel px-3 py-2 text-xs font-medium text-espresso hover:bg-caramel/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-caramel"
            >
              ☕ Quay lại quán
            </button>
          </div>
        </header>

        {!game ? (
          <>
            <p className="mb-4 text-sm text-linen/70">Chọn một game để bắt đầu chơi ngay trên trình duyệt.</p>
            {games === null ? <p className="text-sm text-linen/60">Đang tải danh sách game…</p> : null}
            {listError ? (
              <p role="alert" className="text-sm text-[#e7a99c]">
                {listError}
              </p>
            ) : null}
            {games && games.length === 0 && !listError ? (
              <p className="text-sm text-linen/60">Chưa có game nào trong Khu Chơi Game.</p>
            ) : null}
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {(games ?? []).map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => setGame(item)}
                    className="group block w-full overflow-hidden rounded-xl border border-[#a866ff]/30 bg-[#1d1726] text-left shadow-[0_0_24px_rgba(168,102,255,0.15)] transition hover:-translate-y-0.5 hover:border-[#a866ff] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e2d0ff]"
                  >
                    <img
                      src={`${SERVER_URL}${item.bannerUrl}`}
                      alt={item.title}
                      className="aspect-[8/7] w-full bg-black object-cover [image-rendering:pixelated]"
                    />
                    <span className="block px-3 py-2 text-sm font-semibold text-[#e2d0ff] group-hover:text-white">
                      {item.title}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <section>
            <h2 className="mb-2 text-lg font-semibold text-[#e2d0ff]">{game.title}</h2>
            <div className="relative mx-auto aspect-[8/7] w-full max-w-[768px] overflow-hidden rounded-xl border border-[#a866ff]/40 bg-black">
              <canvas ref={canvasRef} className="h-full w-full [image-rendering:pixelated]" />
              {phase === 'loading' ? (
                <p className="absolute inset-0 grid place-items-center text-sm text-linen/70">Đang tải game…</p>
              ) : null}
              {phase === 'error' ? (
                <p role="alert" className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-[#e7a99c]">
                  {message}
                </p>
              ) : null}
            </div>
            <p className="mt-3 text-center text-[11px] text-linen/55">{game.hint}</p>
          </section>
        )}
      </div>
    </main>
  );
}
