'use client';

type AvatarInitialsProps = {
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
};

const COLORS = [
  { bg: 'bg-emerald-500/20', text: 'text-emerald-400' },
  { bg: 'bg-blue-500/20', text: 'text-blue-400' },
  { bg: 'bg-amber-500/20', text: 'text-amber-400' },
  { bg: 'bg-purple-500/20', text: 'text-purple-400' },
  { bg: 'bg-rose-500/20', text: 'text-rose-400' },
  { bg: 'bg-cyan-500/20', text: 'text-cyan-400' },
  { bg: 'bg-orange-500/20', text: 'text-orange-400' },
  { bg: 'bg-indigo-500/20', text: 'text-indigo-400' },
];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getColorIndex(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % COLORS.length;
}

const sizeClasses = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
  xl: 'h-20 w-20 text-2xl',
};

export function AvatarInitials({
  name,
  size = 'sm',
  className = '',
}: AvatarInitialsProps) {
  const initials = getInitials(name);
  const color = COLORS[getColorIndex(name)];

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${color.bg} ${color.text} ${sizeClasses[size]} ${className}`}
      title={name}
    >
      {initials}
    </span>
  );
}
