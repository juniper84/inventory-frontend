'use client';

type IconProps = {
  className?: string;
};

const base = 'h-4 w-4 text-current';

const Icons = {
  dashboard: (props: IconProps) => (
    <svg viewBox="0 0 24 24" className={props.className ?? base} fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M4 4h7v7H4z" />
      <path d="M13 4h7v4h-7z" />
      <path d="M13 10h7v10h-7z" />
      <path d="M4 13h7v7H4z" />
    </svg>
  ),
  settings: (props: IconProps) => (
    <svg viewBox="0 0 24 24" className={props.className ?? base} fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z" />
      <path d="M4 12l2-1 1-2-1-2 2-2 2 1 2-1 1-2h2l1 2 2 1 2-1 2 2-1 2 1 2 2 1-2 2-2-1-2 1-1 2h-2l-1-2-2-1-2 1-2-2 1-2-1-2-2-1z" />
    </svg>
  ),
  building: (props: IconProps) => (
    <svg viewBox="0 0 24 24" className={props.className ?? base} fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M4 20V6l8-3 8 3v14" />
      <path d="M8 10h2M8 14h2M14 10h2M14 14h2" />
    </svg>
  ),
  users: (props: IconProps) => (
    <svg viewBox="0 0 24 24" className={props.className ?? base} fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M8 11a3 3 0 1 0-3-3 3 3 0 0 0 3 3zM16 11a3 3 0 1 0-3-3 3 3 0 0 0 3 3z" />
      <path d="M2 20c0-3.3 2.7-6 6-6M22 20c0-3.3-2.7-6-6-6" />
    </svg>
  ),
  tag: (props: IconProps) => (
    <svg viewBox="0 0 24 24" className={props.className ?? base} fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M4 10V4h6l8 8-6 6-8-8z" />
      <path d="M7 7h.01" />
    </svg>
  ),
  cube: (props: IconProps) => (
    <svg viewBox="0 0 24 24" className={props.className ?? base} fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M12 2l9 5-9 5-9-5 9-5z" />
      <path d="M3 7v10l9 5 9-5V7" />
    </svg>
  ),
  layers: (props: IconProps) => (
    <svg viewBox="0 0 24 24" className={props.className ?? base} fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M12 3l9 5-9 5-9-5 9-5z" />
      <path d="M3 12l9 5 9-5" />
      <path d="M3 17l9 5 9-5" />
    </svg>
  ),
  stock: (props: IconProps) => (
    <svg viewBox="0 0 24 24" className={props.className ?? base} fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M3 20h18M6 16v-4M12 16V8M18 16V6" />
    </svg>
  ),
  move: (props: IconProps) => (
    <svg viewBox="0 0 24 24" className={props.className ?? base} fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M4 12h16M14 6l6 6-6 6" />
      <path d="M10 6l-6 6 6 6" />
    </svg>
  ),
  cart: (props: IconProps) => (
    <svg viewBox="0 0 24 24" className={props.className ?? base} fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M6 6h15l-2 8H8L6 6z" />
      <circle cx="9" cy="20" r="1.5" />
      <circle cx="18" cy="20" r="1.5" />
    </svg>
  ),
  receipt: (props: IconProps) => (
    <svg viewBox="0 0 24 24" className={props.className ?? base} fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M6 3h12v18l-2-1-2 1-2-1-2 1-2-1-2 1z" />
      <path d="M8 7h8M8 11h8M8 15h5" />
    </svg>
  ),
  clock: (props: IconProps) => (
    <svg viewBox="0 0 24 24" className={props.className ?? base} fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  ),
  truck: (props: IconProps) => (
    <svg viewBox="0 0 24 24" className={props.className ?? base} fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M3 6h11v8H3zM14 10h4l3 3v1h-7z" />
      <circle cx="7" cy="18" r="1.5" />
      <circle cx="18" cy="18" r="1.5" />
    </svg>
  ),
  file: (props: IconProps) => (
    <svg viewBox="0 0 24 24" className={props.className ?? base} fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M6 3h7l5 5v13H6z" />
      <path d="M13 3v5h5" />
    </svg>
  ),
  chart: (props: IconProps) => (
    <svg viewBox="0 0 24 24" className={props.className ?? base} fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M4 20V4" />
      <path d="M8 16l3-4 4 3 5-7" />
    </svg>
  ),
  search: (props: IconProps) => (
    <svg viewBox="0 0 24 24" className={props.className ?? base} fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  ),
  shield: (props: IconProps) => (
    <svg viewBox="0 0 24 24" className={props.className ?? base} fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M12 3l8 3v6c0 5-3.2 8.5-8 9-4.8-.5-8-4-8-9V6l8-3z" />
    </svg>
  ),
  bell: (props: IconProps) => (
    <svg viewBox="0 0 24 24" className={props.className ?? base} fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M6 9a6 6 0 1 1 12 0v5l2 2H4l2-2z" />
      <path d="M9.5 20a2.5 2.5 0 0 0 5 0" />
    </svg>
  ),
  check: (props: IconProps) => (
    <svg viewBox="0 0 24 24" className={props.className ?? base} fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M20 6l-11 11-5-5" />
    </svg>
  ),
  offline: (props: IconProps) => (
    <svg viewBox="0 0 24 24" className={props.className ?? base} fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M3 3l18 18" />
      <path d="M6 10a8 8 0 0 1 12 0" />
      <path d="M9 13a4 4 0 0 1 6 0" />
      <circle cx="12" cy="18" r="1" />
    </svg>
  ),
};

export function NavIcon({ name, className }: { name: keyof typeof Icons; className?: string }) {
  const Icon = Icons[name];
  return <Icon className={className ?? base} />;
}
