"use client";

import { useCallback, useEffect, useRef } from "react";
import { MAP_OBJECTS, SEATS_BY_ID, SEAT_DEFINITIONS } from "@virtual-cafe/shared";
import type { CafeEngine, InputState, MoveAxis } from "@/game/engine";
import { CafeRenderer } from "@/game/renderer";
import { playCatSound } from "@/game/cats";
import { CatPrompt } from "./CatPrompt";
import { useCafeStore } from "@/state/useCafeStore";

interface Props {
  engineRef: React.MutableRefObject<CafeEngine | null>;
  /**
   * Live joystick deflection, written straight into a ref by the touch
   * controls so dragging a thumb never re-renders React (SPEC 10.3).
   */
  touchVectorRef?: React.MutableRefObject<{ x: number; y: number } | null>;
  onSit: (seatId?: string) => void;
  onStand: () => void;
  onInteract: () => void;
  /**
   * The pointer is over the table the player is sitting at (screen position of
   * its centre, in CSS px), or has left it (null).
   */
  onOwnTableHover?: (anchor: { x: number; y: number } | null) => void;
}

/** True when a world point is on the given table or one of its seats. */
function onTable(groupId: string, x: number, y: number): boolean {
  const table = MAP_OBJECTS.find((object) => object.id === `table_${groupId}`);
  if (
    table &&
    x >= table.x &&
    x < table.x + table.w &&
    y >= table.y &&
    y < table.y + table.h
  )
    return true;
  return SEAT_DEFINITIONS.some(
    (seat) =>
      seat.seatGroupId === groupId &&
      x >= seat.x &&
      x < seat.x + 1 &&
      y >= seat.y &&
      y < seat.y + 1,
  );
}

function tableCentre(groupId: string): { x: number; y: number } | null {
  const table = MAP_OBJECTS.find((object) => object.id === `table_${groupId}`);
  if (!table) return null;
  return { x: table.x + table.w / 2, y: table.y + table.h / 2 };
}

const KEY_MAP: Record<string, MoveAxis> = {
  KeyW: "up",
  ArrowUp: "up",
  KeyS: "down",
  ArrowDown: "down",
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
};

/**
 * The café canvas (SPEC 10.1). React owns the panels; this element owns the
 * 2.5D world and runs its own animation loop so UI re-renders never cost frames.
 */
export function CafeCanvas({
  engineRef,
  touchVectorRef,
  onSit,
  onStand,
  onInteract,
  onOwnTableHover,
}: Props) {
  const hoveringRef = useRef(false);

  /** Stroke or hug the cat beside you (F, or the prompt's button on touch). */
  const interactCat = useCallback(() => {
    const engine = engineRef.current;
    const renderer = rendererRef.current;
    if (!engine || !renderer) return;
    const at = engine.cameraTarget();
    const reaction = renderer.interactCat(at.x, at.y);
    if (!reaction) return;
    const audio = useCafeStore.getState().audio;
    playCatSound(reaction, audio.muteAll ? 0 : audio.ui * audio.master);
  }, [engineRef]);
  const interactCatRef = useRef(interactCat);
  interactCatRef.current = interactCat;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<CafeRenderer | null>(null);
  const inputRef = useRef<InputState>({
    up: false,
    down: false,
    left: false,
    right: false,
    vector: null,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const renderer = new CafeRenderer();
    rendererRef.current = renderer;

    let frame = 0;
    let last = performance.now();
    let lastCatCheck = 0;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = parent.clientWidth;
      const height = parent.clientHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      renderer.resize(width, height, dpr);
    };
    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("orientationchange", resize);
    // Mobile browsers slide their chrome away without firing `resize`; the
    // visual viewport is the only thing that reports it.
    window.visualViewport?.addEventListener("resize", resize);

    // Shown while the session is still being set up, so the café fades in
    // rather than sitting on a black screen (SPEC 16.1).
    const emptyRoom = (time: number) => ({
      avatars: [],
      occupancy: new Map<string, boolean>(),
      highlightSeatId: null,
      time,
      reducedMotion: useCafeStore.getState().audio.reducedMotion,
      cameraX: 12,
      cameraY: 9,
    });

    const loop = (now: number) => {
      const delta = Math.min((now - last) / 1000, 0.1);
      last = now;
      const engine = engineRef.current;
      if (engine) {
        const modalOpen = Boolean(document.querySelector("dialog[open]"));
        if (modalOpen) {
          inputRef.current = {
            up: false,
            down: false,
            left: false,
            right: false,
            vector: null,
          };
        }
        engine.setInput({
          ...inputRef.current,
          vector: modalOpen ? null : (touchVectorRef?.current ?? null),
        });
        engine.update(delta);
        renderer.render(ctx, {
          ...engine.sceneInput(),
          ambience: useCafeStore.getState().ambience,
        });
        // Is a cat within reach? Checked a few times a second, not per frame.
        if (now - lastCatCheck > 150) {
          lastCatCheck = now;
          const at = engine.cameraTarget();
          useCafeStore.getState().setNearbyCat(renderer.nearbyCat(at.x, at.y));
        }
      } else {
        renderer.render(ctx, { ...emptyRoom(now), ambience: useCafeStore.getState().ambience });
      }
      frame = window.requestAnimationFrame(loop);
    };
    frame = window.requestAnimationFrame(loop);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("orientationchange", resize);
      window.visualViewport?.removeEventListener("resize", resize);
    };
  }, [engineRef, touchVectorRef]);

  useEffect(() => {
    const isTyping = () => {
      const active = document.activeElement;
      return (
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        (active instanceof HTMLElement && active.isContentEditable)
      );
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping()) return;
      const key = KEY_MAP[event.code];
      if (key) {
        inputRef.current[key] = true;
        event.preventDefault();
        return;
      }
      if (event.code === "KeyF") {
        event.preventDefault();
        interactCatRef.current();
        return;
      }
      if (event.code === "KeyE" || event.code === "Space") {
        event.preventDefault();
        onInteract();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const key = KEY_MAP[event.code];
      if (key) inputRef.current[key] = false;
    };
    const releaseAll = () => {
      inputRef.current = {
        up: false,
        down: false,
        left: false,
        right: false,
        vector: null,
      };
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", releaseAll);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", releaseAll);
    };
  }, [onInteract]);

  /** Own table under the pointer → its anchor on screen; otherwise null. */
  const ownTableAt = (clientX: number, clientY: number) => {
    const engine = engineRef.current;
    const canvas = canvasRef.current;
    const renderer = rendererRef.current;
    if (!engine || !canvas || !renderer) return null;
    const seatId = useCafeStore.getState().self?.seatId;
    const groupId = seatId ? SEATS_BY_ID.get(seatId)?.seatGroupId : undefined;
    if (!groupId) return null;
    const rect = canvas.getBoundingClientRect();
    const camera = engine.cameraTarget();
    const world = renderer.worldAtScreen(
      clientX - rect.left,
      clientY - rect.top,
      camera.x,
      camera.y,
    );
    if (!onTable(groupId, world.x, world.y)) return null;
    const centre = tableCentre(groupId);
    if (!centre) return null;
    return renderer.screenPosition(centre.x, centre.y, camera.x, camera.y);
  };

  const handleMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!onOwnTableHover || event.pointerType === "touch") return;
    const anchor = ownTableAt(event.clientX, event.clientY);
    if (Boolean(anchor) === hoveringRef.current) return;
    hoveringRef.current = Boolean(anchor);
    onOwnTableHover(anchor);
  };

  const handleLeave = () => {
    if (!hoveringRef.current) return;
    hoveringRef.current = false;
    onOwnTableHover?.(null);
  };

  const handleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const engine = engineRef.current;
    const canvas = canvasRef.current;
    const renderer = rendererRef.current;
    if (!engine || !canvas || !renderer) return;
    // Touch has no hover: a tap on your own table shows the same actions.
    const tableAnchor = ownTableAt(event.clientX, event.clientY);
    if (tableAnchor && onOwnTableHover) {
      onOwnTableHover(tableAnchor);
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const camera = engine.cameraTarget();
    const world = renderer.worldAtScreen(
      event.clientX - rect.left,
      event.clientY - rect.top,
      camera.x,
      camera.y,
    );
    const seat = engine.seatAtWorld(world.x, world.y);
    if (!seat) return;
    if (engine.isSeated() && engine.nearbySeatId === null) {
      onStand();
      return;
    }
    const owner = useCafeStore.getState().seatOwners[seat.seatId];
    if (owner) {
      useCafeStore.getState().showToast("Đã có người ngồi ở đó rồi.", "info");
      return;
    }
    onSit(seat.seatId);
  };

  return (
    <>
    <canvas
      ref={canvasRef}
      onClick={handleClick}
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
      className="block h-full w-full cursor-pointer touch-none"
      aria-label="Sàn quán cà phê. Dùng phím W, A, S, D hoặc các phím mũi tên để đi, và nhấn E để ngồi xuống."
      role="application"
      tabIndex={0}
    />
    <CatPrompt onInteract={interactCat} />
    </>
  );
}
