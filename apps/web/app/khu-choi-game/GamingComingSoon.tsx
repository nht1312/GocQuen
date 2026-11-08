'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const SECONDS = 8;

/** "Đang xây dựng" — then back to the café, on its own or straight away. */
export function GamingComingSoon() {
  const router = useRouter();
  const [left, setLeft] = useState(SECONDS);

  useEffect(() => {
    if (left <= 0) {
      router.replace('/cafe');
      return;
    }
    const timer = window.setTimeout(() => setLeft((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [left, router]);

  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-[#141019] p-6 text-cream">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(168,102,255,0.25),transparent_60%)]"
      />
      <section className="relative w-full max-w-md rounded-2xl border border-[#a866ff]/40 bg-[#1d1726]/90 p-6 text-center shadow-[0_0_40px_rgba(168,102,255,0.25)] backdrop-blur">
        <p className="text-4xl" aria-hidden>
          🚧
        </p>
        <h1 className="mt-3 text-2xl font-bold tracking-wide text-[#e2d0ff] [text-shadow:0_0_18px_#a866ff]">
          KHU CHƠI GAME
        </h1>
        <p className="mt-2 text-sm font-medium text-[#c9a8ff]">Đang xây dựng</p>
        <p className="mt-4 text-sm leading-relaxed text-linen/75">
          Khu vực này sắp mở cửa. Bạn quay lại quán trong {left} giây…
        </p>
        <button
          type="button"
          onClick={() => router.replace('/cafe')}
          className="mt-6 inline-flex items-center justify-center rounded-lg bg-caramel px-4 py-2 text-sm font-medium text-espresso hover:bg-caramel/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-caramel"
        >
          Quay lại quán ngay
        </button>
      </section>
    </main>
  );
}
