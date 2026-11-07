'use client';

import { useEffect, useReducer } from 'react';
import type { AvatarRenderState } from '@/game/avatar';
import { StatusIcon } from '@/components/StatusIcon';

export type AvatarRef = { current: AvatarRenderState };

/**
 * Shared between the 3D scene (which moves the plates every frame) and the
 * DOM overlay (which renders them). Plates are HTML, not 3D text: they stay
 * crisp and the same size on screen however far the camera is zoomed out,
 * exactly like the 2D renderer's plates (SPEC 10.2).
 */
export interface PlateRegistry {
  avatars: Map<string, AvatarRef>;
  elements: Map<string, HTMLDivElement>;
}

function micGlyph(a: AvatarRenderState): string {
  if (a.mutedByViewer) return '⊘';
  if (a.micOn) return '●';
  if (a.inVoiceGroup) return '◦';
  return '';
}

function NamePlate({ id, registry }: { id: string; registry: PlateRegistry }) {
  // Name, status and mic change rarely; re-read them a few times a second
  // rather than re-rendering React every frame.
  const [, tick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, []);
  const a = registry.avatars.get(id)?.current;
  if (!a) return null;
  const glyph = micGlyph(a);
  const live = a.micOn && !a.mutedByViewer;
  return (
    <div
      ref={(element) => {
        if (element) registry.elements.set(id, element);
        else registry.elements.delete(id);
      }}
      className="pointer-events-none absolute left-0 top-0 will-change-transform"
      style={{ visibility: 'hidden' }}
    >
      <div
        className={[
          'flex -translate-x-1/2 -translate-y-full items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold leading-4 shadow-sm',
          a.isSelf ? 'bg-caramel/90 text-espresso' : 'bg-espresso/80 text-cream',
          live ? 'ring-[1.5px] ring-[rgba(232,180,120,0.95)]' : '',
        ].join(' ')}
      >
        <StatusIcon status={a.status} isNpc={a.isNpc} size={12} />
        <span>
          {a.isNpc ? `${a.displayName} · NPC` : a.displayName}
          {glyph ? ` ${glyph}` : ''}
        </span>
      </div>
    </div>
  );
}

export function NamePlates({ roster, registry }: { roster: string[]; registry: PlateRegistry }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {roster.map((id) => (
        <NamePlate key={id} id={id} registry={registry} />
      ))}
    </div>
  );
}
