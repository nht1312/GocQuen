import type { Metadata } from 'next';
import { CafeShell } from '@/components/CafeShell';

export const metadata: Metadata = {
  title: 'Trong quán',
  description: 'Không gian quán cà phê ảo. Chọn chỗ ngồi, chỉnh âm thanh và trò chuyện cùng bàn.',
  // The live room is a canvas behind a guest session: nothing to index.
  robots: { index: false, follow: false },
  alternates: { canonical: '/cafe' },
};

export default function CafePage() {
  return <CafeShell />;
}
