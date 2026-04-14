'use client';

/**
 * BrandLogo — Pure CSS/HTML logo for New Vision Inventory.
 *
 * Variants:
 *   monogram    – Large "NVI" monogram + full name
 *   wordmark    – "NEW VISION" / "INVENTORY" stacked wordmark
 *   geometric   – Overlapping N + V lettermark
 *   vision      – Abstract eye motif
 *   crown       – Angular V crown/chevron
 *   blocks      – Letters in animated reveal blocks
 *
 * Sizes: sm (topbar), md (sidebar/general), lg (auth pages)
 */

import React from 'react';

export type BrandVariant =
  | 'monogram'
  | 'wordmark'
  | 'geometric'
  | 'vision'
  | 'crown'
  | 'blocks';

export type BrandSize = 'sm' | 'md' | 'lg';

interface BrandLogoProps {
  variant?: BrandVariant;
  size?: BrandSize;
  className?: string;
  animated?: boolean;
}

/* ─── Variant 1: Stacked Monogram ─── */
function Monogram({ size, animated }: { size: BrandSize; animated: boolean }) {
  return (
    <div className={`brand-monogram brand--${size} ${animated ? 'brand--animated' : ''}`}>
      <div className="brand-monogram__letters">
        <span className="brand-monogram__n">N</span>
        <span className="brand-monogram__v">V</span>
        <span className="brand-monogram__i">I</span>
      </div>
      <div className="brand-monogram__name">
        <span className="brand-monogram__full">New Vision Inventory</span>
      </div>
    </div>
  );
}

/* ─── Variant 2: Integrated Wordmark ─── */
function Wordmark({ size, animated }: { size: BrandSize; animated: boolean }) {
  return (
    <div className={`brand-wordmark brand--${size} ${animated ? 'brand--animated' : ''}`}>
      <span className="brand-wordmark__new">NEW</span>
      <span className="brand-wordmark__vision">VISION</span>
      <div className="brand-wordmark__line" />
      <span className="brand-wordmark__inventory">INVENTORY</span>
    </div>
  );
}

/* ─── Variant 3: Geometric Lettermark ─── */
function Geometric({ size, animated }: { size: BrandSize; animated: boolean }) {
  return (
    <div className={`brand-geo brand--${size} ${animated ? 'brand--animated' : ''}`}>
      <div className="brand-geo__mark">
        <span className="brand-geo__n">N</span>
        <span className="brand-geo__v">V</span>
      </div>
      <div className="brand-geo__text">
        <span className="brand-geo__full">New Vision</span>
        <span className="brand-geo__sub">Inventory</span>
      </div>
    </div>
  );
}

/* ─── Variant 4: Vision Eye ─── */
function VisionEye({ size, animated }: { size: BrandSize; animated: boolean }) {
  return (
    <div className={`brand-eye brand--${size} ${animated ? 'brand--animated' : ''}`}>
      <div className="brand-eye__icon">
        <div className="brand-eye__outer" />
        <div className="brand-eye__iris" />
        <div className="brand-eye__pupil" />
        <div className="brand-eye__glint" />
      </div>
      <div className="brand-eye__text">
        <span className="brand-eye__name">New Vision</span>
        <span className="brand-eye__sub">Inventory</span>
      </div>
    </div>
  );
}

/* ─── Variant 5: Angular Crown ─── */
function Crown({ size, animated }: { size: BrandSize; animated: boolean }) {
  return (
    <div className={`brand-crown brand--${size} ${animated ? 'brand--animated' : ''}`}>
      <div className="brand-crown__icon">
        <svg viewBox="0 0 80 50" className="brand-crown__svg" aria-hidden="true">
          <path
            d="M4 44 L20 12 L40 32 L60 12 L76 44"
            fill="none"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="brand-crown__path"
          />
          <circle cx="20" cy="10" r="3" className="brand-crown__gem" />
          <circle cx="40" cy="30" r="3" className="brand-crown__gem" />
          <circle cx="60" cy="10" r="3" className="brand-crown__gem" />
        </svg>
      </div>
      <div className="brand-crown__text">
        <span className="brand-crown__name">New Vision</span>
        <span className="brand-crown__sub">Inventory</span>
      </div>
    </div>
  );
}

/* ─── Variant 6: Split Blocks ─── */
function Blocks({ size, animated }: { size: BrandSize; animated: boolean }) {
  return (
    <div className={`brand-blocks brand--${size} ${animated ? 'brand--animated' : ''}`}>
      <div className="brand-blocks__row">
        {'NVI'.split('').map((char, i) => (
          <span
            key={char}
            className="brand-blocks__cell"
            style={{ animationDelay: `${i * 0.15}s` }}
          >
            {char}
          </span>
        ))}
      </div>
      <div className="brand-blocks__name">
        <span>New Vision Inventory</span>
      </div>
    </div>
  );
}

const VARIANTS: Record<BrandVariant, React.FC<{ size: BrandSize; animated: boolean }>> = {
  monogram: Monogram,
  wordmark: Wordmark,
  geometric: Geometric,
  vision: VisionEye,
  crown: Crown,
  blocks: Blocks,
};

export function BrandLogo({
  variant = 'wordmark',
  size = 'md',
  className = '',
  animated = true,
}: BrandLogoProps) {
  const Component = VARIANTS[variant];
  return (
    <div className={`brand-logo ${className}`} role="img" aria-label="New Vision Inventory">
      <Component size={size} animated={animated} />
    </div>
  );
}
