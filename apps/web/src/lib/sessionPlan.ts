import { normaliseDisplayName } from '@virtual-cafe/shared';

export type SessionPlan =
  | { action: 'create'; name: string }
  | { action: 'rename'; name: string }
  | { action: 'reuse' }
  | { action: 'refuse' };

export interface SessionPlanInput {
  /** Whether a usable session token was found in storage. */
  hasToken: boolean;
  /** The name typed on the landing page, raw. */
  pendingName: string;
  /** The name the stored session currently carries, if known. */
  currentName: string | null;
}

/**
 * Decide what to do with a stored session and a name typed at the door.
 *
 * Pulled out of the bootstrap because getting it wrong is invisible: the café
 * still opens, it just shows the wrong person's name and leaves the session
 * missing from the store. Both of those shipped.
 *
 * - `create` — no session yet, and a usable name was given.
 * - `rename` — a session exists but the name at the door is different, so the
 *   name has to be applied to it rather than ignored.
 * - `reuse`  — a session exists and the name is unchanged or absent.
 * - `refuse` — no session and no usable name; do not mint one.
 */
export function planSessionBootstrap(input: SessionPlanInput): SessionPlan {
  const wanted = normaliseDisplayName(input.pendingName);

  if (!input.hasToken) {
    return wanted ? { action: 'create', name: wanted } : { action: 'refuse' };
  }

  // Compare normalised, so trailing whitespace is not treated as a rename.
  const current = normaliseDisplayName(input.currentName);
  if (wanted && wanted !== current) return { action: 'rename', name: wanted };
  return { action: 'reuse' };
}
