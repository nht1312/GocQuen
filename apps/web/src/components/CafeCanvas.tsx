"use client";

import { useEffect, useRef } from "react";
import type { CafeEngine, InputState, MoveAxis } from "@/game/engine";
import { CafeRenderer } from "@/game/renderer";
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
}: Props) {
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
        renderer.render(ctx, engine.sceneInput());
      } else {
        renderer.render(ctx, emptyRoom(now));
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

  const handleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const engine = engineRef.current;
    const canvas = canvasRef.current;
    const renderer = rendererRef.current;
    if (!engine || !canvas || !renderer) return;
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
    <canvas
      ref={canvasRef}
      onClick={handleClick}
      className="block h-full w-full cursor-pointer touch-none"
      aria-label="Sàn quán cà phê. Dùng phím W, A, S, D hoặc các phím mũi tên để đi, và nhấn E để ngồi xuống."
      role="application"
      tabIndex={0}
    />
  );
}
