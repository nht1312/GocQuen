import { SEATS_BY_ID } from '@virtual-cafe/shared';

/**
 * What entitles this browser to hear a table.
 *
 * The server decides who may join a conversation and clears that membership
 * the moment someone stands up or moves table (`InstanceManager.clearVoice`).
 * But membership is a presence record, and clearing a record does not tear
 * down a media connection: the SFU room belongs to the client, and it keeps
 * delivering audio until the client closes it.
 *
 * So the transport is driven from the seat, which is the one thing the server
 * is authoritative about and pushes on every change. Deriving the decision
 * from the seat rather than from the stand button means every way of leaving
 * a table closes the room — the button, a tap on another table's chair, or a
 * correction that arrives from the server on its own.
 */

/** The conversation a seat entitles you to, or null when you are standing. */
export function voiceGroupOfSeat(seatId: string | null | undefined): string | null {
  if (!seatId) return null;
  return SEATS_BY_ID.get(seatId)?.seatGroupId ?? null;
}

/**
 * Whether an open voice connection has outlived the seat that justified it.
 *
 * `connectedGroupId` is the table the live room belongs to, or null when
 * there is no room open — in which case there is nothing to outlive and the
 * answer is always no.
 */
export function voiceConnectionOutlivedSeat(
  connectedGroupId: string | null,
  seatId: string | null | undefined,
): boolean {
  if (!connectedGroupId) return false;
  return voiceGroupOfSeat(seatId) !== connectedGroupId;
}
