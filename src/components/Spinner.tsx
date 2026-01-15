'use client';

import React from 'react';

type SpinnerVariant = 'ring' | 'dots' | 'bars' | 'orbit' | 'pulse' | 'grid';
type SpinnerSize = 'xs' | 'sm' | 'md';

const SIZE_MAP: Record<SpinnerSize, string> = {
  xs: '0.75rem',
  sm: '1rem',
  md: '1.25rem',
};

export function Spinner({
  variant = 'ring',
  size = 'sm',
  className = '',
}: {
  variant?: SpinnerVariant;
  size?: SpinnerSize;
  className?: string;
}) {
  const style = {
    ['--spinner-size' as const]: SIZE_MAP[size],
  } as React.CSSProperties;

  if (variant === 'dots') {
    return (
      <span className={`spinner-dots ${className}`} style={style}>
        <span />
        <span />
        <span />
      </span>
    );
  }

  if (variant === 'bars') {
    return (
      <span className={`spinner-bars ${className}`} style={style}>
        <span />
        <span />
        <span />
      </span>
    );
  }

  if (variant === 'orbit') {
    return (
      <span className={`spinner-orbit ${className}`} style={style}>
        <span />
        <span />
      </span>
    );
  }

  if (variant === 'pulse') {
    return <span className={`spinner-pulse ${className}`} style={style} />;
  }

  if (variant === 'grid') {
    return (
      <span className={`spinner-grid ${className}`} style={style}>
        <span />
        <span />
        <span />
        <span />
      </span>
    );
  }

  return <span className={`spinner-ring ${className}`} style={style} />;
}
