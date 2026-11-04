import type { PlayerStatus } from '@virtual-cafe/shared';
import {
  ICON_STROKE_WIDTH,
  ICON_VIEWBOX,
  NPC_ICON_PATHS,
  STATUS_ICON_PATHS,
} from '@/icons/statusIcons';

interface Props {
  status: PlayerStatus;
  /** Café regulars get the coffee cup rather than a person's status. */
  isNpc?: boolean;
  size?: number;
  className?: string;
}

/**
 * Status icon (SPEC 10.2, 16.3).
 *
 * `currentColor` and no hardcoded fill, so the icon takes the colour of
 * whatever it sits in.
 *
 * Deliberately `aria-hidden`: every place this is used already writes the
 * status out in words beside it, so announcing the icon as well would just
 * repeat the label. The icon is a second visual channel for sighted users —
 * the UI never relies on it, or on colour, alone.
 */
export function StatusIcon({ status, isNpc = false, size = 14, className }: Props) {
  const paths = isNpc ? NPC_ICON_PATHS : STATUS_ICON_PATHS[status];

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${ICON_VIEWBOX} ${ICON_VIEWBOX}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={ICON_STROKE_WIDTH}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
