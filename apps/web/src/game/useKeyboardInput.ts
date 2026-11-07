'use client';

import { useEffect, useRef } from 'react';
import type { InputState, MoveAxis } from './engine';

const KEY_MAP: Record<string, MoveAxis> = {
  KeyW: 'up',
  ArrowUp: 'up',
  KeyS: 'down',
  ArrowDown: 'down',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
};

const idle = (): InputState => ({ up: false, down: false, left: false, right: false, vector: null });

/** WASD / arrows to walk, E or Space to interact; ignored while typing. */
export function useKeyboardInput(onInteract: () => void) {
  const inputRef = useRef<InputState>(idle());
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
      if (event.code === 'KeyE' || event.code === 'Space') {
        event.preventDefault();
        onInteract();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const key = KEY_MAP[event.code];
      if (key) inputRef.current[key] = false;
    };
    const releaseAll = () => {
      inputRef.current = idle();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', releaseAll);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', releaseAll);
    };
  }, [onInteract]);
  return inputRef;
}
