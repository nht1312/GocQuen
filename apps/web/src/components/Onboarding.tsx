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

const TABLE_STEPS = {
  keyboard: {
    title: 'Tiện ích tại bàn',
    body: 'Khi đã ngồi, rê chuột lên bàn của bạn để hiện 2 biểu tượng: 💬 mở khung trò chuyện ở giữa màn hình, 🖥 mở chia sẻ màn hình. Tin nhắn và màn hình chỉ những người cùng bàn mới thấy.',
    hint: 'Rê chuột lên bàn',
  },
  touch: {
    title: 'Tiện ích tại bàn',
    body: 'Khi đã ngồi, chạm vào bàn của bạn để hiện 2 biểu tượng: 💬 mở khung trò chuyện ở giữa màn hình, 🖥 mở chia sẻ màn hình. Tin nhắn và màn hình chỉ những người cùng bàn mới thấy.',
    hint: 'Chạm vào bàn',
  },
};

const REST_STEPS = [
  {
    title: 'Chọn chế độ khi đã ngồi',
    body: 'Chỉ khi ngồi vào bàn bạn mới chọn được chế độ trên thanh trạng thái: Đang rảnh, Đang làm việc, Cần tập trung hoặc Đang vắng mặt. Đứng dậy sẽ tự quay về “Đang rảnh”.',
    hint: 'Thanh trạng thái',
  },
  {
    title: 'Cần tập trung',
    body: 'Chọn “Cần tập trung” để quán yên hơn và ẩn bớt thông báo. Một hộp hiện ra để bạn dán link nhạc riêng (YouTube, SoundCloud hoặc .mp3) — chỉ mình bạn nghe. Nút ♪ Nhạc mở lại hộp này; đổi chế độ hoặc đứng dậy là nhạc dừng.',
    hint: '♪ Nhạc',
  },
  {
    title: 'Trò chuyện với bàn của bạn',
    body: 'Ngồi xuống, chọn “Tham gia trò chuyện”, rồi mới bật micro. Chỉ những người cùng bàn nghe được bạn — tiếng rì rầm xung quanh là âm thanh nền, không phải micro của ai cả.',
    hint: 'Micro mặc định tắt',
  },
  {
    title: 'Bảng điều khiển',
    body: 'Mở “Hiện bảng điều khiển” ở góc phải để chuyển giữa các mục Âm thanh, Màn hình, Mọi người và Trò chuyện. Âm thanh có thanh chỉnh riêng cho nhạc, tiếng quán, tiếng mưa và giọng nói, cùng lọc tiếng ồn micro.',
    hint: 'Âm thanh · Màn hình · Mọi người · Trò chuyện',
  },
  {
    title: 'Quán theo giờ và thời tiết thật',
    body: 'Bầu trời ngoài cửa sổ đổi theo giờ và thời tiết thật của quán: nắng, mây, mưa, giông. Từ 18:00 đến 06:00 đèn trong quán tự bật. Dòng “Ngoài trời…” trong mục Âm thanh cho biết thời tiết lúc này.',
    hint: 'Cửa sổ · Đèn 18:00–06:00',
  },
  {
    title: 'Khu Chơi Game',
    body: 'Đi tới biển neon “KHU CHƠI GAME” ở góc trên bên phải. Khi đứng trước biển, chọn “Vào Khu Chơi Game” để sang khu riêng. Chọn một game (như Böbl) để chơi ngay trên trình duyệt, rồi bấm “Quay lại quán” để trở về.',
    hint: 'Biển neon góc phải',
  },
  {
    title: 'Những chú mèo của quán',
    body: 'Có 3 chú mèo (cam, trắng và xám) hay chạy nhảy quanh quán, thỉnh thoảng nằm cuộn tròn ngủ một lúc, và một chú mèo mướp nằm ngủ trên bàn chung giữa quán. Đi lại gần rồi nhấn F (trên điện thoại: chạm vào nút hiện ra) — mèo đang ngủ thì được vuốt ve, mèo đang thức thì được ôm và kêu meo meo.',
    hint: 'Lại gần mèo · phím F',
  },
];

/** Hướng dẫn ngắn, có thể bỏ qua, kèm tuỳ chọn "không hiện lại" (SPEC 4.4). */
export function Onboarding({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [dontShow, setDontShow] = useState(true);
  const touch = useMediaQuery(TOUCH_QUERY);
  const kind = touch ? 'touch' : 'keyboard';
  const steps = [MOVE_STEPS[kind], SEAT_STEPS[kind], TABLE_STEPS[kind], ...REST_STEPS];
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

        {/* Jump straight to any step — handy when this is opened from Trợ giúp. */}
        <div className="mt-4 flex flex-wrap gap-1.5" role="tablist" aria-label="Các bước hướng dẫn">
          {steps.map((item, index) => (
            <button
              key={item.title}
              type="button"
              role="tab"
              aria-selected={index === step}
              aria-label={`Bước ${index + 1}: ${item.title}`}
              title={item.title}
              onClick={() => setStep(index)}
              className={`h-2 rounded-full transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-caramel ${
                index === step ? 'w-5 bg-caramel' : 'w-2 bg-white/25 hover:bg-white/45'
              }`}
            />
          ))}
        </div>

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
            {step > 0 ? (
              <button
                type="button"
                onClick={() => setStep((value) => value - 1)}
                className="min-h-11 rounded-lg border border-white/15 px-4 py-1.5 text-xs text-linen hover:border-caramel/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-caramel md:min-h-0 md:px-3"
              >
                Quay lại
              </button>
            ) : null}
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
