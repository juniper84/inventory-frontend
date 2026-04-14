'use client';

type TimelineItem = {
  id: string;
  title: string;
  subtitle?: string;
  timestamp?: string;
  icon?: string;
  color?: 'green' | 'red' | 'amber' | 'blue' | 'gray';
};

type TimelineProps = {
  items: TimelineItem[];
  className?: string;
};

const dotColors = {
  green: 'bg-emerald-400 shadow-emerald-400/40',
  red: 'bg-red-400 shadow-red-400/40',
  amber: 'bg-amber-400 shadow-amber-400/40',
  blue: 'bg-blue-400 shadow-blue-400/40',
  gray: 'bg-gray-400 shadow-gray-400/40',
};

export function Timeline({
  items,
  className = '',
}: TimelineProps) {
  if (!items.length) return null;

  return (
    <div className={`relative ${className}`}>
      {/* Vertical line */}
      <div className="absolute left-[7px] top-2 bottom-2 w-[2px] bg-[color:var(--border)]" />

      <div className="space-y-3">
        {items.map((item, index) => {
          const color = dotColors[item.color ?? 'gray'];
          return (
            <div key={item.id} className="relative flex gap-3 pl-6">
              {/* Dot */}
              <span
                className={`absolute left-0 top-1.5 h-4 w-4 rounded-full border-2 border-[color:var(--surface)] shadow-[0_0_6px] ${color}`}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                {item.icon ? (
                  <span className="absolute inset-0 flex items-center justify-center text-[8px]">
                    {item.icon}
                  </span>
                ) : null}
              </span>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-[color:var(--foreground)] font-medium truncate">
                  {item.title}
                </p>
                {item.subtitle ? (
                  <p className="text-xs text-[color:var(--muted)] truncate">{item.subtitle}</p>
                ) : null}
                {item.timestamp ? (
                  <p className="text-[10px] text-[color:var(--muted)] mt-0.5">{item.timestamp}</p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
