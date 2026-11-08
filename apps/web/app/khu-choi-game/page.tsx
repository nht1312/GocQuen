import type { Metadata } from 'next';
import { GamingComingSoon } from './GamingComingSoon';

export const metadata: Metadata = {
  title: 'Khu Chơi Game',
  description: 'Khu Chơi Game của Góc Quen — đang xây dựng.',
  robots: { index: false, follow: false },
  alternates: { canonical: '/khu-choi-game' },
};

/** A separate space from the café. Under construction for now. */
export default function GamingPage() {
  return <GamingComingSoon />;
}
