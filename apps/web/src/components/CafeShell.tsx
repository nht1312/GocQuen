'use client';

import { useCallback, useEffect, useState } from 'react';
import { STORAGE_KEYS } from '@virtual-cafe/shared';
import { useCafe } from '@/hooks/useCafe';
import { readFlag } from '@/lib/storage';
import { useCafeStore } from '@/state/useCafeStore';
import { AudioDock } from './AudioDock';
import { CafeCanvas } from './CafeCanvas';
import { ChatPanel } from './ChatPanel';
import { ConnectionBanner, InteractionPrompt, Toasts } from './Overlays';
import { Onboarding } from './Onboarding';
import { PeoplePanel } from './PeoplePanel';
import { ScreenSharePanel } from './ScreenSharePanel';
import { StatusBar } from './StatusBar';

/** The café screen (SPEC 10.1): canvas in the middle, collapsible panels around it. */
export function CafeShell() {
  const controls = useCafe();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [panelsOpen, setPanelsOpen] = useState(true);
  const phase = useCafeStore((state) => state.phase);
  const connectionMessage = useCafeStore((state) => state.connectionMessage);
  const seated = Boolean(useCafeStore((state) => state.self?.seatId));

  useEffect(() => {
    setShowOnboarding(!readFlag(STORAGE_KEYS.onboarding));
  }, []);

  // Browsers only allow audio after a gesture; take the first one we get.
  useEffect(() => {
    const unlock = () => {
      void controls.ensureAudio();
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [controls]);

  const interact = useCallback(() => {
    if (seated) controls.stand();
    else controls.sit();
  }, [controls, seated]);

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-charcoal">
      <CafeCanvas
        engineRef={controls.engineRef}
        onSit={controls.sit}
        onStand={controls.stand}
        onInteract={interact}
      />

      <ConnectionBanner />
      <InteractionPrompt />
      <Toasts />

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3">
        <div className="pointer-events-auto max-w-[min(92vw,660px)]">
          <StatusBar
            onStatusChange={controls.setStatus}
            onStand={controls.stand}
            onLeave={() => {
              void controls.leaveCafe();
              window.location.href = '/';
            }}
            onOpenHelp={() => setShowOnboarding(true)}
          />
        </div>
        <button
          type="button"
          onClick={() => setPanelsOpen((value) => !value)}
          aria-expanded={panelsOpen}
          className="pointer-events-auto rounded-xl border border-white/10 bg-espresso/85 px-3 py-2 text-xs text-cream shadow-panel backdrop-blur-md hover:border-caramel/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-caramel"
        >
          {panelsOpen ? 'Ẩn bảng điều khiển' : 'Hiện bảng điều khiển'}
        </button>
      </div>

      {panelsOpen ? (
        <div className="pointer-events-none absolute bottom-3 right-3 top-20 flex w-[290px] max-w-[92vw] flex-col gap-3 overflow-y-auto">
          <div className="pointer-events-auto">
            <AudioDock
              onToggleMic={() => void controls.toggleMic()}
              onJoinVoice={() => void controls.joinVoice()}
              onLeaveVoice={() => void controls.leaveVoice()}
              onEnableAudio={() => void controls.ensureAudio()}
            />
          </div>
          <div className="pointer-events-auto">
            <ScreenSharePanel
              video={controls.screenVideo}
              onStart={() => void controls.startScreenShare()}
              onStop={() => void controls.stopScreenShare()}
            />
          </div>
          <div className="pointer-events-auto">
            <PeoplePanel
              onMute={controls.muteUser}
              onBlock={(userId) => void controls.blockUser(userId)}
              onReport={(userId, reason, details) => void controls.reportUser(userId, reason, details)}
            />
          </div>
          <div className="pointer-events-auto">
            <ChatPanel onSend={controls.sendChat} />
          </div>
        </div>
      ) : null}

      {phase === 'error' ? (
        <div className="absolute inset-0 z-40 grid place-items-center bg-charcoal/80 p-6 text-center backdrop-blur">
          <div className="max-w-sm rounded-2xl border border-white/10 bg-espresso p-6 text-cream shadow-panel">
            <h2 className="text-lg font-semibold">Quán hiện đang đóng cửa</h2>
            <p className="mt-2 text-sm text-linen/75">
              {connectionMessage ?? 'Chúng tôi không kết nối được tới máy chủ.'}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 rounded-lg bg-caramel px-3 py-1.5 text-sm font-medium text-espresso hover:bg-caramel/90"
            >
              Thử lại
            </button>
          </div>
        </div>
      ) : null}

      {showOnboarding ? <Onboarding onClose={() => setShowOnboarding(false)} /> : null}

      <p className="pointer-events-none absolute bottom-3 left-3 hidden text-[11px] text-linen/40 md:block">
        W A S D để đi · E để ngồi · khách quen trong quán là nhân vật nền, không phải người thật
      </p>
    </main>
  );
}
