/**
 * Ambient NPCs (SPEC 8) — FR-017, priority P1.
 *
 * They exist so the café does not feel abandoned at low occupancy. Three rules
 * come straight from the spec and are enforced here: NPCs are always labelled
 * as such in the UI, they only ever use seats flagged `npcOnly`, and they never
 * produce voice — the murmur the player hears is a licensed/synthesised
 * soundscape layer, not a fake conversation.
 */

import { Direction } from './iso';
import { SEATS_BY_ID, seatAnchor } from './map';
import { AvatarPresetId, NpcActivity, NpcPresence } from './types';

interface NpcSpec {
  npcId: string;
  displayName: string;
  presetId: AvatarPresetId;
  activity: NpcActivity;
  /** Either a seat reserved for NPCs, or a standing position. */
  seatId?: string;
  x?: number;
  y?: number;
  direction?: Direction;
}

const NPC_SPECS: NpcSpec[] = [
  {
    npcId: 'npc_barista',
    displayName: 'Nhân viên pha chế',
    presetId: 'cocoa',
    activity: 'barista',
    x: 1.5,
    y: 6.5,
    direction: 'south_east',
  },
  {
    npcId: 'npc_reader',
    displayName: 'Khách quen đọc sách',
    presetId: 'cream',
    activity: 'reading',
    seatId: 'reading_nook:1',
  },
  {
    npcId: 'npc_laptop',
    displayName: 'Khách quen dùng laptop',
    presetId: 'slate',
    activity: 'laptop',
    seatId: 'window_nook:1',
  },
  {
    npcId: 'npc_chat_a',
    displayName: 'Khách quen',
    presetId: 'rose',
    activity: 'chatting',
    x: 15.6,
    y: 8.6,
    direction: 'south',
  },
  {
    npcId: 'npc_chat_b',
    displayName: 'Khách quen',
    presetId: 'sage',
    activity: 'chatting',
    x: 16.4,
    y: 9.4,
    direction: 'north',
  },
];

export const NPCS: NpcPresence[] = NPC_SPECS.map((spec) => {
  const seat = spec.seatId ? SEATS_BY_ID.get(spec.seatId) : undefined;
  if (spec.seatId && !seat) {
    throw new Error(`NPC ${spec.npcId} references unknown seat ${spec.seatId}`);
  }
  if (seat && !seat.npcOnly) {
    throw new Error(`NPC ${spec.npcId} may not occupy guest seat ${seat.seatId}`);
  }
  return {
    npcId: spec.npcId,
    displayName: spec.displayName,
    avatar: { presetId: spec.presetId },
    x: seat ? seatAnchor(seat).x : (spec.x ?? 0),
    y: seat ? seatAnchor(seat).y : (spec.y ?? 0),
    direction: seat?.facing ?? spec.direction ?? 'south',
    activity: spec.activity,
    seatId: seat?.seatId ?? null,
    isNpc: true,
  };
});
