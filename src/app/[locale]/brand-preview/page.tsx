'use client';

import { useState } from 'react';
import { BrandLogo, type BrandVariant, type BrandSize } from '@/components/BrandLogo';

const VARIANTS: { id: BrandVariant; label: string; description: string }[] = [
  {
    id: 'monogram',
    label: 'A — Stacked Monogram',
    description:
      'Large NVI monogram with each letter uniquely styled. The V is elevated and brighter, creating depth. Full name sits below in elegant tracking.',
  },
  {
    id: 'wordmark',
    label: 'B — Integrated Wordmark',
    description:
      '"NEW" in light weight above bold "VISION" with shimmer gradient. A gold accent line separates "INVENTORY" below. Clean, professional, reads at any size.',
  },
  {
    id: 'geometric',
    label: 'C — Geometric Lettermark',
    description:
      'N and V letters overlap with a screen blend mode, creating a distinctive abstract mark. They slide together on load with a pulsing glow.',
  },
  {
    id: 'vision',
    label: 'D — Vision Eye',
    description:
      'Abstract eye icon made purely from CSS shapes — the "vision" in New Vision. The iris pulses with a gold glow. Memorable and distinctive.',
  },
  {
    id: 'crown',
    label: 'E — Angular Crown',
    description:
      'An SVG crown drawn with a line-drawing animation. Three gems appear at the peaks. Conveys premium quality and authority.',
  },
  {
    id: 'blocks',
    label: 'F — Split Blocks',
    description:
      'Each letter of NVI sits in its own glass-morphism card. They pop in with a springy animation and glow on hover. Modern and interactive.',
  },
];

const SIZES: { id: BrandSize; label: string; note: string }[] = [
  { id: 'sm', label: 'Small', note: 'Topbar / compact' },
  { id: 'md', label: 'Medium', note: 'Sidebar / general' },
  { id: 'lg', label: 'Large', note: 'Auth pages / hero' },
];

export default function BrandPreviewPage() {
  const [selectedSize, setSelectedSize] = useState<BrandSize>('lg');
  const [replayKey, setReplayKey] = useState(0);

  const replay = () => setReplayKey((k) => k + 1);

  return (
    <div className="auth-lux-root" style={{ minHeight: '100vh' }}>
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          maxWidth: 900,
          margin: '0 auto',
          padding: '40px 20px 80px',
        }}
      >
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <h1
            style={{
              fontSize: '1.5rem',
              fontWeight: 800,
              color: '#f6d37a',
              letterSpacing: '0.04em',
              margin: '0 0 8px',
            }}
          >
            Brand Logo Preview
          </h1>
          <p style={{ color: 'rgba(167,163,160,0.8)', fontSize: '0.85rem' }}>
            6 pure-CSS logo concepts for New Vision Inventory. Pick your favourite.
          </p>
        </div>

        {/* Controls */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 8,
            marginBottom: 12,
            flexWrap: 'wrap',
          }}
        >
          {SIZES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSelectedSize(s.id)}
              style={{
                padding: '6px 16px',
                borderRadius: 999,
                border: `1px solid ${selectedSize === s.id ? 'rgba(246,211,122,0.5)' : 'rgba(255,255,255,0.1)'}`,
                background:
                  selectedSize === s.id
                    ? 'rgba(246,211,122,0.12)'
                    : 'rgba(255,255,255,0.03)',
                color:
                  selectedSize === s.id
                    ? '#f6d37a'
                    : 'rgba(233,231,226,0.6)',
                fontSize: '0.75rem',
                cursor: 'pointer',
                fontWeight: selectedSize === s.id ? 600 : 400,
                transition: 'all 0.2s',
              }}
            >
              {s.label}{' '}
              <span style={{ opacity: 0.5, fontSize: '0.65rem' }}>
                ({s.note})
              </span>
            </button>
          ))}
        </div>

        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <button
            type="button"
            onClick={replay}
            style={{
              padding: '6px 20px',
              borderRadius: 999,
              border: '1px solid rgba(246,211,122,0.3)',
              background: 'rgba(246,211,122,0.08)',
              color: '#f6d37a',
              fontSize: '0.72rem',
              cursor: 'pointer',
              fontWeight: 500,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
            }}
          >
            Replay Animations
          </button>
        </div>

        {/* Variant Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
            gap: 24,
          }}
        >
          {VARIANTS.map((v) => (
            <div
              key={v.id}
              style={{
                borderRadius: 20,
                border: '1px solid rgba(255,215,120,0.1)',
                background: 'rgba(255,255,255,0.02)',
                backdropFilter: 'blur(12px)',
                padding: 28,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 20,
              }}
            >
              {/* Label */}
              <div style={{ textAlign: 'center' }}>
                <h2
                  style={{
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    color: '#f6d37a',
                    letterSpacing: '0.05em',
                    margin: '0 0 4px',
                  }}
                >
                  {v.label}
                </h2>
                <p
                  style={{
                    fontSize: '0.7rem',
                    color: 'rgba(167,163,160,0.7)',
                    lineHeight: 1.5,
                    maxWidth: 300,
                    margin: 0,
                  }}
                >
                  {v.description}
                </p>
              </div>

              {/* Logo display area */}
              <div
                style={{
                  minHeight: selectedSize === 'lg' ? 160 : selectedSize === 'md' ? 120 : 80,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '100%',
                }}
              >
                <BrandLogo
                  key={`${v.id}-${selectedSize}-${replayKey}`}
                  variant={v.id}
                  size={selectedSize}
                  animated
                />
              </div>
            </div>
          ))}
        </div>

        {/* Comparison: all on dark vs on surface */}
        <div style={{ marginTop: 48, textAlign: 'center' }}>
          <h2
            style={{
              fontSize: '0.9rem',
              fontWeight: 700,
              color: '#f6d37a',
              letterSpacing: '0.05em',
              marginBottom: 20,
            }}
          >
            Small Size — Topbar Preview
          </h2>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 32,
              flexWrap: 'wrap',
              padding: '16px 24px',
              borderRadius: 12,
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            {VARIANTS.map((v) => (
              <BrandLogo
                key={`topbar-${v.id}-${replayKey}`}
                variant={v.id}
                size="sm"
                animated={false}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
