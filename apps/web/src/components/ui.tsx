'use client';

import { ReactNode } from 'react';

/** Small shared pieces so every panel looks like it came from the same café. */

export function Panel({
  title,
  action,
  children,
  className = '',
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`w-full rounded-xl border border-white/10 bg-espresso/85 text-cream shadow-panel backdrop-blur-md ${className}`}
    >
      {title ? (
        <header className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-linen/80">{title}</h2>
          {action}
        </header>
      ) : null}
      <div className="p-3">{children}</div>
    </section>
  );
}

export function IconButton({
  label,
  active = false,
  danger = false,
  onClick,
  children,
  disabled = false,
}: {
  label: string;
  active?: boolean;
  danger?: boolean;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={[
        'inline-flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg border px-3 text-sm transition md:h-9 md:min-w-9 md:px-2.5',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-caramel focus-visible:ring-offset-1 focus-visible:ring-offset-espresso',
        disabled ? 'cursor-not-allowed opacity-40' : 'hover:border-caramel/70 hover:bg-white/5',
        active ? 'border-caramel bg-caramel/20 text-cream' : 'border-white/15 text-linen',
        danger ? 'border-[#a8584a]/60 text-[#e7a99c]' : '',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

export function Slider({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  const percent = Math.round(value * 100);
  return (
    <label className="flex items-center gap-2 text-xs text-linen/90">
      <span className="w-20 shrink-0">{label}</span>
      <input
        type="range"
        min={0}
        max={100}
        value={percent}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value) / 100)}
        aria-label={`${label} volume`}
        className="range-rail h-6 w-full cursor-pointer appearance-none bg-transparent accent-caramel disabled:opacity-40 md:h-1.5"
      />
      <span className="w-8 shrink-0 text-right tabular-nums text-linen/60">{percent}</span>
    </label>
  );
}

export function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-xs text-linen/90">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-5 w-5 shrink-0 accent-caramel md:h-4 md:w-4"
      />
      <span>
        <span className="font-medium">{label}</span>
        {description ? <span className="block text-linen/55">{description}</span> : null}
      </span>
    </label>
  );
}
