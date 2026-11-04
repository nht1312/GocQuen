'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { CafeInfo } from '@virtual-cafe/shared';
import { api } from '@/lib/api';
import { SITE_NAME } from '@/lib/site';

/**
 * Landing (SPEC 4.1): một màn hình ngắn, một nút bấm, không đăng ký. Trang này
 * cũng nói rõ cách micro và giọng nói hoạt động trước khi ai đó bước vào
 * (SPEC 14.2).
 *
 * Đây là trang duy nhất được lập chỉ mục, nên phần chữ hiển thị cũng chính là
 * phần nội dung SEO: một H1 duy nhất, các H2 mô tả tính năng, và từ khoá nằm
 * trong câu văn tự nhiên thay vì nhồi vào thẻ meta.
 */
export default function LandingPage() {
  const [info, setInfo] = useState<CafeInfo | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    api
      .cafeInfo()
      .then(setInfo)
      .catch(() => setOffline(true));
  }, []);

  return (
    <main className="relative min-h-dvh overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_72%_18%,rgba(255,206,140,0.22),transparent_58%),radial-gradient(ellipse_at_18%_82%,rgba(107,115,85,0.18),transparent_55%)]" />

      <div className="relative mx-auto flex min-h-dvh max-w-5xl flex-col justify-center px-6 py-16">
        <div className="flex items-center gap-4">
          {/* The logo artwork has an opaque cream background, so it is framed
              as a round badge rather than dropped flat onto the dark page. */}
          <Image
            src="/logo.png"
            alt={`Logo ${SITE_NAME}`}
            width={76}
            height={76}
            priority
            className="rounded-full shadow-panel ring-1 ring-white/15"
          />
          <p className="text-xs uppercase tracking-[0.3em] text-caramel">{SITE_NAME}</p>
        </div>
        <h1 className="mt-4 max-w-2xl text-4xl font-semibold leading-tight text-cream sm:text-5xl">
          Quán cà phê quen thuộc của bạn, luôn trong tầm tay.
        </h1>
        <p className="mt-5 max-w-xl text-base leading-relaxed text-linen/75">
          Một góc bàn yên tĩnh, tiếng mưa ngoài cửa sổ, tiếng máy pha cà phê phía sau lưng, và vài
          người khác cũng đang tập trung làm việc. Chọn một chỗ ngồi, cắm cúi với công việc của
          bạn, và khi đồng đội đến thì ngồi chung bàn để trò chuyện — không cần link họp, không
          cần bật camera.
        </p>

        <div className="mt-9 flex flex-wrap items-center gap-4">
          <Link
            href="/cafe"
            className="rounded-xl bg-caramel px-6 py-3 text-sm font-semibold text-espresso transition hover:bg-caramel/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-cream focus-visible:ring-offset-2 focus-visible:ring-offset-charcoal"
          >
            Vào quán
          </Link>
          <span className="text-xs text-linen/60">
            {offline
              ? 'Máy chủ của quán chưa phản hồi — hãy khởi động bằng lệnh npm run dev.'
              : info
                ? `${info.onlineCount} người đang ở trong quán · không cần tài khoản`
                : 'Không cần tài khoản'}
          </span>
        </div>

        <section
          aria-labelledby="tinh-nang"
          className="mt-16 grid gap-6 border-t border-white/10 pt-8 sm:grid-cols-3"
        >
          <h2 id="tinh-nang" className="sr-only">
            Vì sao nên làm việc ở quán cà phê ảo này
          </h2>
          <div>
            <h3 className="text-sm font-medium text-cream">Micro của bạn luôn tắt sẵn</h3>
            <p className="mt-1 text-xs leading-relaxed text-linen/65">
              Micro chỉ bật khi chính bạn bật, và không bao giờ tự bật lại sau khi kết nối lại.
              Không có gì được ghi âm.
            </p>
          </div>
          <div>
            <h3 className="text-sm font-medium text-cream">Giọng nói chỉ ở trong bàn của bạn</h3>
            <p className="mt-1 text-xs leading-relaxed text-linen/65">
              Chỉ những người ngồi cùng bàn mới nghe được bạn. Tiếng rì rầm xung quanh là âm thanh
              nền của quán, không phải micro của ai cả.
            </p>
          </div>
          <div>
            <h3 className="text-sm font-medium text-cream">Sinh ra để làm việc, không để lướt</h3>
            <p className="mt-1 text-xs leading-relaxed text-linen/65">
              Không bảng tin, không danh sách bạn bè, không thông báo giành giật sự chú ý của bạn.
              Chỉ là một căn phòng với bầu không khí dễ chịu.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
