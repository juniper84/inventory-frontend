'use client';

import { useState } from 'react';
import { FontScale, FONT_SCALE_VALUES, getStoredFontScale, setFontScale } from '@/lib/font-scale';

type FontScaleSelectorProps = {
  showPreview?: boolean;
  showHint?: boolean;
  className?: string;
};

export function FontScaleSelector({ showPreview = false, showHint = true, className = '' }: FontScaleSelectorProps) {
  const [current, setCurrent] = useState<FontScale>(getStoredFontScale);

  const handleChange = (scale: FontScale) => {
    setCurrent(scale);
    setFontScale(scale);
  };

  const options: { key: FontScale; label: string; description: string }[] = [
    { key: 'small', label: 'A', description: 'Small' },
    { key: 'default', label: 'A', description: 'Default' },
    { key: 'large', label: 'A', description: 'Large' },
    { key: 'xl', label: 'A', description: 'Extra Large' },
  ];

  return (
    <div className={className}>
      <div className="flex items-center gap-1.5">
        {options.map((opt) => (
          <button
            key={opt.key}
            type="button"
            onClick={() => handleChange(opt.key)}
            title={opt.description}
            className={[
              'nvi-press flex flex-col items-center justify-center rounded-xl border px-3 py-2 transition-all',
              current === opt.key
                ? 'border-gold-500/40 bg-gold-500/[0.08] text-gold-400 ring-1 ring-gold-500/20'
                : 'border-white/[0.06] bg-white/[0.02] text-white/40 hover:border-white/[0.12] hover:text-white/60',
            ].join(' ')}
          >
            <span style={{ fontSize: opt.key === 'small' ? '12px' : opt.key === 'default' ? '14px' : opt.key === 'large' ? '16px' : '18px', fontWeight: 600 }}>
              {opt.label}
            </span>
            <span className="mt-0.5 text-[9px] leading-none opacity-60">{opt.description}</span>
          </button>
        ))}
      </div>
      {showHint && (
        <p className="mt-2 text-[11px] text-white/30">
          You can always change this later in your Profile settings.
        </p>
      )}
      {showPreview && (
        <div className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-2">
          <p className="text-sm font-semibold text-white/80">Preview</p>
          <p className="text-xs text-white/50">This is how text will appear throughout the system at your selected size.</p>
          <p className="text-[10px] text-white/30">Small labels and metadata will look like this.</p>
        </div>
      )}
    </div>
  );
}
