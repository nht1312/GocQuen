"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { STORAGE_KEYS, normaliseDisplayName } from "@virtual-cafe/shared";
import { useCafe } from "@/hooks/useCafe";
import {
  COMPACT_QUERY,
  TOUCH_QUERY,
  useMediaQuery,
} from "@/hooks/useMediaQuery";
import { readFlag, readLocal } from "@/lib/storage";
import { useCafeStore } from "@/state/useCafeStore";
import { AudioDock } from "./AudioDock";
import { CafeCanvas } from "./CafeCanvas";
import { GAMING_ROUTE } from "@/game/gamingEntry";
import { GamingPrompt } from "./GamingPrompt";

import { ChatPanel } from "./ChatPanel";
import { DonationPrompt } from "./DonationPrompt";
import { DockTab, MobileDock } from "./MobileDock";
import { ConnectionBanner, InteractionPrompt, Toasts } from "./Overlays";
import { Onboarding } from "./Onboarding";
import { PeoplePanel } from "./PeoplePanel";
import { ScreenSharePanel } from "./ScreenSharePanel";
import { StatusBar } from "./StatusBar";
import { TouchControls } from "./TouchControls";
import { TableActions } from "./TableActions";
import { ChatModal } from "./ChatModal";
import { FocusMusicPlayer } from "./FocusMusic";

type SideTab = DockTab;

const SIDE_TABS: { id: SideTab; label: string }[] = [
  { id: "audio", label: "Âm thanh" },
  { id: "screen", label: "Màn hình" },
  { id: "people", label: "Mọi người" },
  { id: "chat", label: "Trò chuyện" },
];

/**
 * The café screen (SPEC 10.1): canvas in the middle, collapsible panels around
 * it.
 *
 * "Around it" only holds once there is room to be around. Below `md` the same
 * panels move into a dock along the bottom and the room keeps the rest of the
 * screen (SPEC 10.3); the panels themselves are the same components either
 * way, and each is mounted exactly once, because the screen-share panel adopts
 * a live <video> element that cannot be in two places at once.
 */
export function CafeShell() {
  const router = useRouter();
  const controls = useCafe();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [panelsOpen, setPanelsOpen] = useState(true);
  const [dockTab, setDockTab] = useState<DockTab | null>(null);
  const [sideTab, setSideTab] = useState<SideTab>("audio");
  const [chatModal, setChatModal] = useState(false);
  const [tableAnchor, setTableAnchor] = useState<{ x: number; y: number } | null>(null);
  const overActionsRef = useRef(false);
  const hideTimerRef = useRef<number | null>(null);
  const touchVectorRef = useRef<{ x: number; y: number } | null>(null);
  const phase = useCafeStore((state) => state.phase);
  const connectionMessage = useCafeStore((state) => state.connectionMessage);
  const seated = Boolean(useCafeStore((state) => state.self?.seatId));
  const screenFocused = useCafeStore((state) => state.screenShareFocus.focused);
  const compact = useMediaQuery(COMPACT_QUERY);
  const touch = useMediaQuery(TOUCH_QUERY);

  useEffect(() => {
    setShowOnboarding(!readFlag(STORAGE_KEYS.onboarding));
  }, []);

  // Everyone gives a name at the door. Arriving at /cafe directly — a
  // bookmark, a shared link, a refresh after clearing storage — sends you
  // back to the front to provide one, unless you already have a session and
  // therefore already have a name.
  useEffect(() => {
    const named = normaliseDisplayName(
      readLocal(STORAGE_KEYS.pendingName, { name: "" }).name,
    );
    const hasSession = Boolean(
      readLocal(STORAGE_KEYS.session, { token: "" }).token,
    );
    if (!named && !hasSession) router.replace("/");
  }, [router]);

  // Browsers only allow audio after a gesture; take the first one we get.
  useEffect(() => {
    const unlock = () => {
      void controls.ensureAudio();
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [controls]);

  // A shared screen takes the whole display; a sheet left open underneath it
  // would be waiting to reappear over the café once the share ends.
  useEffect(() => {
    if (screenFocused) setDockTab(null);
  }, [screenFocused]);

  // Standing up takes the table — and its actions — away.
  useEffect(() => {
    if (!seated) {
      setTableAnchor(null);
      setChatModal(false);
    }
  }, [seated]);

  const onOwnTableHover = useCallback((anchor: { x: number; y: number } | null) => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    if (anchor) {
      setTableAnchor(anchor);
      return;
    }
    // A short grace so the pointer can travel from the table to the icons.
    hideTimerRef.current = window.setTimeout(() => {
      if (!overActionsRef.current) setTableAnchor(null);
    }, 350);
  }, []);

  const openScreenTab = useCallback(() => {
    setTableAnchor(null);
    if (compact) setDockTab("screen");
    else {
      setPanelsOpen(true);
      setSideTab("screen");
    }
  }, [compact]);

  // Khu Chơi Game is its own page. Leaving the café goes through the same
  // path as the "Rời quán" button so the seat and voice are released at once.
  const enterGaming = useCallback(() => {
    void controls.leaveCafe();
    router.push(GAMING_ROUTE);
  }, [controls, router]);

  const interact = useCallback(() => {
    if (seated) controls.stand();
    else controls.sit();
  }, [controls, seated]);

  const screenShare = (
    <ScreenSharePanel
      video={controls.screenVideo}
      embedded={compact}
      onStart={() => void controls.startScreenShare()}
      onStop={() => void controls.stopScreenShare()}
    />
  );
  const audioDock = (
    <AudioDock
      onToggleMic={() => void controls.toggleMic()}
      onJoinVoice={() => void controls.joinVoice()}
      onLeaveVoice={() => void controls.leaveVoice()}
      onEnableAudio={() => void controls.ensureAudio()}
    />
  );
  const peoplePanel = (
    <PeoplePanel
      onMute={controls.muteUser}
      onBlock={(userId) => void controls.blockUser(userId)}
      onReport={(userId, reason, details) =>
        void controls.reportUser(userId, reason, details)
      }
    />
  );
  const chatPanel = <ChatPanel onSend={controls.sendChat} embedded={compact} />;

  const sidePanelsVisible = !compact && panelsOpen && !screenFocused;

  return (
    <main className="relative h-dvh w-full overflow-hidden overscroll-none bg-charcoal">
      <CafeCanvas
        engineRef={controls.engineRef}
        touchVectorRef={touchVectorRef}
        onSit={controls.sit}
        onStand={controls.stand}
        onInteract={interact}
        onOwnTableHover={seated && !screenFocused ? onOwnTableHover : undefined}
      />

      {tableAnchor && seated && !screenFocused && !chatModal ? (
        <TableActions
          anchor={tableAnchor}
          onChat={() => {
            setTableAnchor(null);
            setDockTab(null);
            setChatModal(true);
          }}
          onScreen={openScreenTab}
          onHoverChange={(hovering) => {
            overActionsRef.current = hovering;
            if (!hovering) onOwnTableHover(null);
          }}
        />
      ) : null}

      <FocusMusicPlayer />
      <ConnectionBanner />
      <InteractionPrompt />
      {!screenFocused && !chatModal ? <GamingPrompt onEnter={enterGaming} /> : null}
      <Toasts />
      <DonationPrompt
        hidden={showOnboarding || screenFocused || Boolean(dockTab)}
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2 pt-[calc(0.5rem+env(safe-area-inset-top))] sm:gap-3 sm:p-3">
        <div className="pointer-events-auto min-w-0 flex-1 md:max-w-[min(92vw,660px)]">
          <StatusBar
            onStatusChange={controls.setStatus}
            onStand={controls.stand}
            onLeave={() => {
              void controls.leaveCafe();
              window.location.href = "/";
            }}
            onOpenHelp={() => setShowOnboarding(true)}
          />
        </div>
        {/* The drawer toggle belongs to the floating column; on a phone the
            dock along the bottom does the same job with four labelled tabs. */}
        <button
          type="button"
          onClick={() => setPanelsOpen((value) => !value)}
          aria-expanded={panelsOpen}
          className="pointer-events-auto hidden rounded-xl border border-white/10 bg-espresso/85 px-3 py-2 text-xs text-cream shadow-panel backdrop-blur-md hover:border-caramel/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-caramel md:block"
        >
          {panelsOpen ? "Ẩn bảng điều khiển" : "Hiện bảng điều khiển"}
        </button>
      </div>

      {/* A live screen takes the room over, so the side panels stand down
          until it ends or someone asks for the café back. It is rendered on
          its own below so the takeover does not depend on the panel drawer
          being open. */}
      {sidePanelsVisible ? (
        <div className="pointer-events-none absolute bottom-3 right-3 top-20 flex w-[300px] max-w-[92vw] flex-col gap-2">
          {/* One section at a time: the column never grows past the screen
              and nothing has to scroll under the others. */}
          <div
            role="tablist"
            aria-label="Bảng điều khiển"
            className="pointer-events-auto grid shrink-0 grid-cols-4 gap-1 rounded-xl border border-white/10 bg-espresso/85 p-1 shadow-panel backdrop-blur-md"
          >
            {SIDE_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={sideTab === tab.id}
                onClick={() => setSideTab(tab.id)}
                className={`truncate rounded-lg px-1 py-1.5 text-[11px] font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-caramel ${
                  sideTab === tab.id
                    ? "bg-caramel/25 text-cream"
                    : "text-linen/70 hover:bg-white/5 hover:text-cream"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div role="tabpanel" className="pointer-events-auto min-h-0 overflow-y-auto overscroll-contain">
            {sideTab === "audio" ? audioDock : null}
            {sideTab === "screen" && !screenFocused ? (
              <ScreenSharePanel
                video={controls.screenVideo}
                embedded
                onStart={() => void controls.startScreenShare()}
                onStop={() => void controls.stopScreenShare()}
              />
            ) : null}
            {sideTab === "people" ? peoplePanel : null}
            {sideTab === "chat" && !chatModal ? (
              <ChatPanel onSend={controls.sendChat} embedded />
            ) : null}
          </div>
        </div>
      ) : null}

      {compact && !screenFocused && !chatModal ? (
        <MobileDock
          open={dockTab}
          onOpenChange={setDockTab}
          panels={{
            audio: audioDock,
            screen: screenShare,
            people: peoplePanel,
            chat: chatPanel,
          }}
        />
      ) : null}

      {/* Walking and sitting with a thumb. Hidden behind an open sheet, which
          covers the joystick anyway, and behind a shared screen. */}
      {touch && !screenFocused && !dockTab ? (
        <TouchControls
          vectorRef={touchVectorRef}
          sidePanels={sidePanelsVisible}
          onInteract={interact}
        />
      ) : null}

      {screenFocused ? screenShare : null}

      {chatModal ? (
        <ChatModal onSend={controls.sendChat} onClose={() => setChatModal(false)} />
      ) : null}

      {phase === "error" ? (
        <div className="absolute inset-0 z-40 grid place-items-center bg-charcoal/80 p-6 text-center backdrop-blur">
          <div className="max-w-sm rounded-2xl border border-white/10 bg-espresso p-6 text-cream shadow-panel">
            <h2 className="text-lg font-semibold">Quán hiện đang đóng cửa</h2>
            <p className="mt-2 text-sm text-linen/75">
              {connectionMessage ?? "Chúng tôi không kết nối được tới máy chủ."}
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

      {showOnboarding ? (
        <Onboarding onClose={() => setShowOnboarding(false)} />
      ) : null}

      {/* The keyboard footnote, for the devices that have a keyboard. On touch
          the joystick stands in this corner and the tour has already explained
          it, so the line would be both wrong and in the way. */}
      {touch ? null : (
        <p className="pointer-events-none absolute bottom-3 left-3 hidden text-[11px] text-linen/40 md:block">
          W A S D để đi · E để ngồi · khách quen trong quán là nhân vật nền,
          không phải người thật
        </p>
      )}
    </main>
  );
}
