'use client';

import { useState } from 'react';
import { STORAGE_KEYS } from '@virtual-cafe/shared';
import { writeFlag } from '@/lib/storage';

const STEPS = [
  {
    title: 'Đi lại trong quán',
    body: 'Dùng phím W, A, S, D hoặc các phím mũi tên để đi. Bạn không thể đi xuyên qua bàn, quầy pha chế hay người khác.',
    hint: 'W A S D',
  },
  {
    title: 'Chọn một chỗ ngồi',
    body: 'Đứng cạnh một chiếc ghế trống rồi nhấn E, hoặc bấm chuột vào ghế. Ghế sẽ sáng lên khi bạn đã đứng đủ gần.',
    hint: 'E',
  },
  {
    title: 'Cho mọi người biết bạn đang bận thế nào',
    body: 'Chọn “Đang làm việc” hoặc “Cần tập trung” trên thanh trạng thái để những người xung quanh biết có nên làm phiền bạn hay không.',
    hint: 'Trạng thái',
  },
  {
    title: 'Trò chuyện với bàn của bạn',
    body: 'Ngồi xuống, chọn “Tham gia trò chuyện”, rồi mới bật micro. Chỉ những người cùng bàn nghe được bạn — tiếng rì rầm xung quanh là âm thanh nền, không phải micro của ai cả.',
    hint: 'Micro mặc định tắt',
  },
  {
    title: 'Phối lại âm thanh trong quán',
    body: 'Nhạc, tiếng quán, tiếng mưa và giọng nói đều có thanh âm lượng riêng. Chế độ tập trung làm căn phòng yên hơn mà không thay đổi ai nghe được bạn.',
    hint: 'Bảng âm thanh',
  },
];

/** Hướng dẫn ngắn, có thể bỏ qua, kèm tuỳ chọn "không hiện lại" (SPEC 4.4). */
export function Onboarding({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [dontShow, setDontShow] = useState(true);
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  const finish = () => {
    if (dontShow) writeFlag(STORAGE_KEYS.onboarding, true);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      className="pointer-events-auto fixed inset-0 z-40 grid place-items-center bg-charcoal/70 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-md animate-fade-up rounded-2xl border border-white/10 bg-espresso p-6 text-cream shadow-panel">
        <p className="text-[11px] uppercase tracking-widest text-caramel">
          Bước {step + 1}/{STEPS.length}
        </p>
        <h2 id="onboarding-title" className="mt-1 text-xl font-semibold">
          {current.title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-linen/80">{current.body}</p>
        <p className="mt-3 inline-block rounded-md border border-white/15 px-2 py-1 text-[11px] text-linen/70">
          {current.hint}
        </p>

        <div className="mt-5 flex items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-[11px] text-linen/70">
            <input
              type="checkbox"
              checked={dontShow}
              onChange={(event) => setDontShow(event.target.checked)}
              className="h-4 w-4 accent-caramel"
            />
            Không hiện lại
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={finish}
              className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-linen hover:border-caramel/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-caramel"
            >
              Bỏ qua
            </button>
            <button
              type="button"
              onClick={() => (isLast ? finish() : setStep((value) => value + 1))}
              className="rounded-lg bg-caramel px-3 py-1.5 text-xs font-medium text-espresso hover:bg-caramel/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-cream"
            >
              {isLast ? 'Vào quán' : 'Tiếp theo'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
