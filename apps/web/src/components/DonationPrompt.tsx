"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { zoneAt } from "@virtual-cafe/shared";
import { useCafeStore } from "@/state/useCafeStore";

export function DonationPrompt({ hidden = false }: { hidden?: boolean }) {
  const atCounter = useCafeStore(
    (state) =>
      state.phase === "connected" &&
      state.self !== null &&
      zoneAt(state.self.x, state.self.y)?.id === "counter",
  );
  const [open, setOpen] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!atCounter || hidden) setOpen(false);
  }, [atCounter, hidden]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (open) dialog?.showModal();
    else dialog?.close();
  }, [open]);

  return (
    <>
      {atCounter && !hidden ? (
        <div className="pointer-events-auto absolute left-1/2 top-24 z-30 w-72 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-lg border border-caramel/50 bg-espresso/95 p-3 text-center text-cream shadow-panel backdrop-blur-md md:top-20">
          <p className="text-xs text-linen/80">
            Góp một chút để giúp chủ quán trang trải chi phí mặt bằng.
          </p>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
            className="mt-2 min-h-11 w-full rounded-lg bg-caramel px-3 py-2 text-sm font-semibold text-espresso hover:bg-caramel/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-cream"
          >
            Ủng hộ chủ quán
          </button>
        </div>
      ) : null}
      <dialog
        ref={dialogRef}
        aria-labelledby="donation-title"
        aria-describedby="donation-description"
        onCancel={() => setOpen(false)}
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}
        onKeyDown={(event) => event.stopPropagation()}
        onKeyUp={(event) => event.stopPropagation()}
        className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-sm overflow-y-auto rounded-lg border border-white/15 bg-espresso p-5 text-cream shadow-panel backdrop:bg-charcoal/80 backdrop:backdrop-blur-sm"
      >
        <h2 id="donation-title" className="text-lg font-semibold">
          Ủng hộ chủ quán
        </h2>
        <p id="donation-description" className="mt-2 text-sm text-linen/80">
          Khoản ủng hộ tự nguyện giúp chủ quán trang trải chi phí mặt bằng. Cảm
          ơn bạn đã đồng hành cùng quán.
        </p>
        {imageFailed ? (
          <p role="alert" className="mt-4 text-sm text-linen">
            Chưa tải được mã QR. Vui lòng thử lại sau.
          </p>
        ) : (
          <Image
            src="/donation-qr.jpg"
            alt="Mã QR MoMo nhận ủng hộ của NGUYEN HOAI TU"
            width={1098}
            height={1200}
            unoptimized
            onError={() => setImageFailed(true)}
            className="mt-4 h-auto max-h-[55dvh] w-full object-contain"
          />
        )}
        {!imageFailed ? (
          <a
            href="/donation-qr.jpg"
            download="donation-qr.jpg"
            className="mt-3 block py-2 text-center text-sm text-caramel underline underline-offset-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-caramel"
          >
            Tải mã QR
          </a>
        ) : null}
        <button
          type="button"
          autoFocus
          onClick={() => setOpen(false)}
          className="mt-4 min-h-11 w-full rounded-lg border border-white/20 px-3 py-2 text-sm hover:border-caramel/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-caramel"
        >
          Đóng
        </button>
      </dialog>
    </>
  );
}
