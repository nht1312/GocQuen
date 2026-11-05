'use client';

import { useState } from 'react';
import { STORAGE_KEYS } from '@virtual-cafe/shared';
import { TOUCH_QUERY, useMediaQuery } from '@/hooks/useMediaQuery';
import { writeFlag } from '@/lib/storage';

/**
 * The first two steps are the only ones that differ by device, because they
 * are the only ones that name a control. Telling someone on a phone to press
 * W is the fastest way to lose them (SPEC 10.3).
 */
const MOVE_STEPS = {
  keyboard: {
    title: 'Đi lại trong quán',
    body: 'Dùng phím W, A, S, D hoặc các phím mũi tên để đi. Bạn không thể đi xuyên qua bàn, quầy pha chế hay người khác.',
    hint: 'W A S D',
  },
  touch: {
    title: 'Đi lại trong quán',
    body: 'Kéo cần điều khiển tròn ở góc dưới bên trái để đi. Kéo càng xa thì đi càng nhanh, và bạn không thể đi xuyên qua bàn, quầy pha chế hay người khác.',
    hint: 'Cần điều khiển góc dưới trái',
  },
};

const SEAT_STEPS = {
  keyboard: {
    title: 'Chọn một chỗ ngồi',
    body: 'Đứng cạnh một chiếc ghế trống rồi nhấn E, hoặc bấm chuột vào ghế. Ghế sẽ sáng lên khi bạn đã đứng đủ gần.',
    hint: 'E',
  },
  touch: {
    title: 'Chọn một chỗ ngồi',
    body: 'Chạm thẳng vào một chiếc ghế trống, hoặc lại gần rồi chạm nút "Ngồi" ở góc dưới bên phải. Ghế sẽ sáng lên khi bạn đã đứng đủ gần.',
    hint: 'Nút Ngồi',
  },
};

const REST_STEPS = [
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
  const touch = useMediaQuery(TOUCH_QUERY);
  const kind = touch ? 'touch' : 'keyboard';
  const steps = [MOVE_STEPS[kind], SEAT_STEPS[kind], ...REST_STEPS];
  const current = steps[step];
  const isLast = step === steps.length - 1;

  const finish = () => {
    if (dontShow) writeFlag(STORAGE_KEYS.onboarding, true);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      className="pointer-events-auto fixed inset-0 z-40 grid place-items-center overflow-y-auto bg-charcoal/70 p-4 backdrop-blur-sm"
    >
      <div className="my-auto w-full max-w-md animate-fade-up rounded-2xl border border-white/10 bg-espresso p-5 text-cream shadow-panel sm:p-6">
        <p className="text-[11px] uppercase tracking-widest text-caramel">
          Bước {step + 1}/{steps.length}
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
              className="h-5 w-5 accent-caramel md:h-4 md:w-4"
            />
            Không hiện lại
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={finish}
              className="min-h-11 rounded-lg border border-white/15 px-4 py-1.5 text-xs text-linen hover:border-caramel/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-caramel md:min-h-0 md:px-3"
            >
              Bỏ qua
            </button>
            <button
              type="button"
              onClick={() => (isLast ? finish() : setStep((value) => value + 1))}
              className="min-h-11 rounded-lg bg-caramel px-4 py-1.5 text-xs font-medium text-espresso hover:bg-caramel/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-cream md:min-h-0 md:px-3"
            >
              {isLast ? 'Vào quán' : 'Tiếp theo'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
