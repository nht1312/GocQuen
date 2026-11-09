import type { Metadata } from 'next';
import { GamingRoom } from './GamingRoom';

export const metadata: Metadata = {
  title: 'Khu Chơi Game',
  description: 'Khu Chơi Game của Góc Quen — chơi game NES ngay trên trình duyệt.',
  robots: { index: false, follow: false },
  alternates: { canonical: '/khu-choi-game' },
};

/** A separate space from the café: pick a game, play, go back. */
export default function GamingPage() {
  return <GamingRoom />;
}
