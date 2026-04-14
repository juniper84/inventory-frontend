'use client';

import { useState } from 'react';
import { BrandLogo } from '@/components/BrandLogo';

/* ─── Fake nav data ─── */
const NAV_SECTIONS = [
  {
    title: 'COMMAND',
    items: [{ icon: '📊', label: 'Dashboard', active: true }],
  },
  {
    title: 'CORE',
    items: [
      { icon: '⚙️', label: 'Settings', active: false },
      { icon: '🏢', label: 'Branches', active: false },
      { icon: '👥', label: 'Users', active: false },
    ],
  },
  {
    title: 'CATALOG',
    items: [
      { icon: '📦', label: 'Products', active: false },
      { icon: '🏷️', label: 'Categories', active: false },
      { icon: '👤', label: 'Customers', active: false },
    ],
  },
  {
    title: 'STOCK',
    items: [
      { icon: '📋', label: 'Stock on Hand', active: false },
      { icon: '🔄', label: 'Movements', active: false },
      { icon: '➕', label: 'Adjustments', active: false },
    ],
  },
  {
    title: 'SALES',
    items: [
      { icon: '💰', label: 'POS', active: false },
      { icon: '🧾', label: 'Receipts', active: false },
    ],
  },
  {
    title: 'INSIGHTS',
    items: [
      { icon: '📈', label: 'Reports', active: false },
      { icon: '💸', label: 'Expenses', active: false },
      { icon: '📤', label: 'Exports', active: false },
    ],
  },
];

const BOTTOM_ITEMS = [
  { icon: '📊', label: 'House' },
  { icon: '💰', label: 'POS' },
  { icon: '📋', label: 'Stock' },
  { icon: '🔔', label: 'Alerts' },
  { icon: '☰', label: 'Menu' },
];

type Viewport = 'desktop' | 'tablet' | 'phone';

/* ─────────────────────────────────────────────────
   CONCEPT 1 — COMMAND CENTER
   Military-precision layout, structured sections,
   gold accent borders, compact information density
   ───────────────────────────────────────────────── */
function CommandCenter({ viewport }: { viewport: Viewport }) {
  if (viewport === 'phone') {
    return (
      <div className="shell-preview__frame" style={{ width: 375, height: 720 }}>
        {/* Topbar */}
        <div className="sc1-topbar">
          <button className="sc1-hamburger">☰</button>
          <BrandLogo variant="wordmark" size="sm" animated={false} />
          <div className="sc1-topbar-right">
            <span className="sc1-notif-dot" />
            <div className="sc1-avatar">FK</div>
          </div>
        </div>
        {/* Content */}
        <div className="sc1-content">
          <div className="sc1-page-placeholder">
            <span className="sc1-placeholder-icon">📊</span>
            <span>Dashboard Content</span>
          </div>
        </div>
        {/* Bottom nav */}
        <div className="sc1-bottom-nav">
          {BOTTOM_ITEMS.map((item, i) => (
            <button key={item.label} className={`sc1-bottom-item ${i === 0 ? 'sc1-bottom-item--active' : ''}`}>
              <span className="sc1-bottom-icon">{item.icon}</span>
              <span className="sc1-bottom-label">{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const isTablet = viewport === 'tablet';

  return (
    <div className="shell-preview__frame" style={{ width: isTablet ? 768 : 1200, height: 700 }}>
      <div className="sc1-layout">
        {/* Sidebar */}
        <aside className={`sc1-sidebar ${isTablet ? 'sc1-sidebar--collapsed' : ''}`}>
          <div className="sc1-sidebar-brand">
            <BrandLogo variant="vision" size="sm" animated={false} />
            {!isTablet && <BrandLogo variant="wordmark" size="sm" animated={false} />}
          </div>
          <div className="sc1-sidebar-sections">
            {NAV_SECTIONS.map((section) => (
              <div key={section.title} className="sc1-section">
                {!isTablet && <div className="sc1-section-title">{section.title}</div>}
                {section.items.map((item) => (
                  <div
                    key={item.label}
                    className={`sc1-nav-item ${item.active ? 'sc1-nav-item--active' : ''}`}
                    title={item.label}
                  >
                    <span className="sc1-nav-icon">{item.icon}</span>
                    {!isTablet && <span className="sc1-nav-label">{item.label}</span>}
                    {item.active && !isTablet && <span className="sc1-nav-indicator" />}
                  </div>
                ))}
              </div>
            ))}
          </div>
          {!isTablet && (
            <div className="sc1-sidebar-footer">
              <div className="sc1-sidebar-user">
                <div className="sc1-avatar">FK</div>
                <div className="sc1-sidebar-user-info">
                  <span className="sc1-sidebar-user-name">Freddie K</span>
                  <span className="sc1-sidebar-user-role">System Owner</span>
                </div>
              </div>
            </div>
          )}
        </aside>
        {/* Main */}
        <div className="sc1-main">
          {/* Topbar */}
          <div className="sc1-topbar sc1-topbar--inner">
            <div className="sc1-topbar-left">
              <span className="sc1-breadcrumb">Command &gt; Dashboard</span>
            </div>
            <div className="sc1-topbar-right">
              <button className="sc1-toolbar-btn">POS</button>
              <button className="sc1-toolbar-btn">⌘K</button>
              <button className="sc1-toolbar-btn sc1-toolbar-btn--bell">
                🔔<span className="sc1-notif-badge">3</span>
              </button>
              <div className="sc1-avatar">FK</div>
            </div>
          </div>
          {/* Content */}
          <div className="sc1-content">
            <div className="sc1-page-placeholder">
              <span className="sc1-placeholder-icon">📊</span>
              <span>Dashboard Content</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────
   CONCEPT 2 — GLASS RAIL
   Floating glass sidebar with glow effects,
   hovering over content with transparency
   ───────────────────────────────────────────────── */
function GlassRail({ viewport }: { viewport: Viewport }) {
  if (viewport === 'phone') {
    return (
      <div className="shell-preview__frame" style={{ width: 375, height: 720 }}>
        <div className="sc2-topbar">
          <BrandLogo variant="vision" size="sm" animated={false} />
          <div className="sc2-topbar-center">
            <BrandLogo variant="wordmark" size="sm" animated={false} />
          </div>
          <div className="sc2-avatar-glow">FK</div>
        </div>
        <div className="sc2-content">
          <div className="sc1-page-placeholder">
            <span className="sc1-placeholder-icon">📊</span>
            <span>Dashboard Content</span>
          </div>
        </div>
        <div className="sc2-bottom-nav">
          {BOTTOM_ITEMS.map((item, i) => (
            <button key={item.label} className={`sc2-bottom-item ${i === 0 ? 'sc2-bottom-item--active' : ''}`}>
              <span className="sc2-bottom-icon">{item.icon}</span>
              <span className="sc2-bottom-label">{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const isTablet = viewport === 'tablet';

  return (
    <div className="shell-preview__frame" style={{ width: isTablet ? 768 : 1200, height: 700 }}>
      <div className="sc2-layout">
        <aside className={`sc2-sidebar ${isTablet ? 'sc2-sidebar--collapsed' : ''}`}>
          <div className="sc2-sidebar-brand">
            <BrandLogo variant="vision" size={isTablet ? 'sm' : 'md'} animated={false} />
            {!isTablet && (
              <div style={{ marginTop: 6 }}>
                <BrandLogo variant="wordmark" size="sm" animated={false} />
              </div>
            )}
          </div>
          <div className="sc2-sidebar-nav">
            {NAV_SECTIONS.map((section) => (
              <div key={section.title} className="sc2-section">
                {!isTablet && <div className="sc2-section-title">{section.title}</div>}
                {section.items.map((item) => (
                  <div
                    key={item.label}
                    className={`sc2-nav-item ${item.active ? 'sc2-nav-item--active' : ''}`}
                    title={item.label}
                  >
                    <span className="sc2-nav-icon">{item.icon}</span>
                    {!isTablet && <span className="sc2-nav-label">{item.label}</span>}
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="sc2-sidebar-footer">
            <div className="sc2-avatar-glow">FK</div>
            {!isTablet && <span className="sc2-footer-name">Freddie K</span>}
          </div>
        </aside>
        <div className="sc2-main">
          <div className="sc2-topbar sc2-topbar--inner">
            <span className="sc2-breadcrumb">Dashboard</span>
            <div className="sc2-topbar-right">
              <button className="sc2-pill-btn">POS</button>
              <button className="sc2-pill-btn">⌘K</button>
              <button className="sc2-pill-btn">🔔</button>
            </div>
          </div>
          <div className="sc2-content">
            <div className="sc1-page-placeholder">
              <span className="sc1-placeholder-icon">📊</span>
              <span>Dashboard Content</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────
   CONCEPT 3 — MINIMAL DOCK
   macOS-inspired dock at the side, clean topbar,
   tooltips on hover, ultra-minimal
   ───────────────────────────────────────────────── */
function MinimalDock({ viewport }: { viewport: Viewport }) {
  if (viewport === 'phone') {
    return (
      <div className="shell-preview__frame" style={{ width: 375, height: 720 }}>
        <div className="sc3-topbar">
          <BrandLogo variant="vision" size="sm" animated={false} />
          <div style={{ flex: 1 }} />
          <button className="sc3-pill">🔔</button>
          <div className="sc3-avatar-ring">FK</div>
        </div>
        <div className="sc3-content">
          <div className="sc1-page-placeholder">
            <span className="sc1-placeholder-icon">📊</span>
            <span>Dashboard Content</span>
          </div>
        </div>
        <div className="sc3-bottom-dock">
          {BOTTOM_ITEMS.map((item, i) => (
            <button key={item.label} className={`sc3-dock-item ${i === 0 ? 'sc3-dock-item--active' : ''}`}>
              <span className="sc3-dock-icon">{item.icon}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const isTablet = viewport === 'tablet';

  return (
    <div className="shell-preview__frame" style={{ width: isTablet ? 768 : 1200, height: 700 }}>
      <div className="sc3-layout">
        <aside className="sc3-dock-rail">
          <div className="sc3-dock-brand">
            <BrandLogo variant="vision" size="sm" animated={false} />
          </div>
          <div className="sc3-dock-items">
            {NAV_SECTIONS.flatMap((s) => s.items).map((item) => (
              <div
                key={item.label}
                className={`sc3-dock-nav ${item.active ? 'sc3-dock-nav--active' : ''}`}
                title={item.label}
              >
                <span className="sc3-dock-nav-icon">{item.icon}</span>
                <span className="sc3-dock-tooltip">{item.label}</span>
              </div>
            ))}
          </div>
          <div className="sc3-dock-bottom">
            <div className="sc3-avatar-ring sc3-avatar-ring--small">FK</div>
          </div>
        </aside>
        <div className="sc3-main">
          <div className="sc3-topbar sc3-topbar--inner">
            <div className="sc3-topbar-left">
              {!isTablet && <BrandLogo variant="wordmark" size="sm" animated={false} />}
              {isTablet && <span className="sc3-breadcrumb">Dashboard</span>}
            </div>
            <div className="sc3-topbar-right">
              <button className="sc3-pill">POS</button>
              <button className="sc3-pill">⌘K</button>
              <button className="sc3-pill">🔔</button>
              <div className="sc3-avatar-ring">FK</div>
            </div>
          </div>
          <div className="sc3-content">
            <div className="sc1-page-placeholder">
              <span className="sc1-placeholder-icon">📊</span>
              <span>Dashboard Content</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────
   CONCEPT 4 — PREMIUM SUITE
   Luxury dashboard with sidebar sections divided
   by glowing lines, subtle gradients, premium feel
   ───────────────────────────────────────────────── */
function PremiumSuite({ viewport }: { viewport: Viewport }) {
  if (viewport === 'phone') {
    return (
      <div className="shell-preview__frame" style={{ width: 375, height: 720 }}>
        <div className="sc4-topbar">
          <button className="sc4-hamburger">☰</button>
          <BrandLogo variant="wordmark" size="sm" animated={false} />
          <div className="sc4-topbar-right">
            <div className="sc4-avatar">FK</div>
          </div>
        </div>
        <div className="sc4-content">
          <div className="sc1-page-placeholder">
            <span className="sc1-placeholder-icon">📊</span>
            <span>Dashboard Content</span>
          </div>
        </div>
        <div className="sc4-bottom-nav">
          {BOTTOM_ITEMS.map((item, i) => (
            <button key={item.label} className={`sc4-bottom-item ${i === 0 ? 'sc4-bottom-item--active' : ''}`}>
              <span className="sc4-bottom-icon">{item.icon}</span>
              <span className="sc4-bottom-label">{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const isTablet = viewport === 'tablet';

  return (
    <div className="shell-preview__frame" style={{ width: isTablet ? 768 : 1200, height: 700 }}>
      <div className="sc4-layout">
        <aside className={`sc4-sidebar ${isTablet ? 'sc4-sidebar--collapsed' : ''}`}>
          <div className="sc4-sidebar-brand">
            <BrandLogo variant="vision" size="sm" animated={false} />
            {!isTablet && (
              <div style={{ marginTop: 4 }}>
                <BrandLogo variant="wordmark" size="sm" animated={false} />
              </div>
            )}
          </div>
          <div className="sc4-sidebar-nav">
            {NAV_SECTIONS.map((section, si) => (
              <div key={section.title}>
                {si > 0 && <div className="sc4-divider" />}
                <div className="sc4-section">
                  {!isTablet && <div className="sc4-section-title">{section.title}</div>}
                  {section.items.map((item) => (
                    <div
                      key={item.label}
                      className={`sc4-nav-item ${item.active ? 'sc4-nav-item--active' : ''}`}
                      title={item.label}
                    >
                      <span className="sc4-nav-icon">{item.icon}</span>
                      {!isTablet && <span className="sc4-nav-label">{item.label}</span>}
                      {item.active && <span className="sc4-active-bar" />}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="sc4-sidebar-footer">
            <div className="sc4-footer-card">
              <div className="sc4-avatar">FK</div>
              {!isTablet && (
                <div className="sc4-footer-info">
                  <span className="sc4-footer-name">Freddie K</span>
                  <span className="sc4-footer-plan">Premium Plan</span>
                </div>
              )}
            </div>
          </div>
        </aside>
        <div className="sc4-main">
          <div className="sc4-topbar sc4-topbar--inner">
            <span className="sc4-breadcrumb">Command &gt; Dashboard</span>
            <div className="sc4-topbar-right">
              <button className="sc4-action-btn sc4-action-btn--primary">POS</button>
              <button className="sc4-action-btn">⌘K</button>
              <button className="sc4-action-btn">
                🔔<span className="sc4-notif-badge">3</span>
              </button>
            </div>
          </div>
          <div className="sc4-content">
            <div className="sc1-page-placeholder">
              <span className="sc1-placeholder-icon">📊</span>
              <span>Dashboard Content</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Concept metadata ─── */
const CONCEPTS = [
  {
    id: 'command',
    label: '1 — Command Center',
    description: 'Military-precision layout. Structured sections with gold accent borders, compact density. Sidebar has brand at top, user card at bottom. Topbar shows breadcrumbs.',
    Component: CommandCenter,
  },
  {
    id: 'glass',
    label: '2 — Glass Rail',
    description: 'Floating glass sidebar with backdrop blur and glow effects. Semi-transparent, feels like it hovers over the content. Rounded, soft edges everywhere.',
    Component: GlassRail,
  },
  {
    id: 'dock',
    label: '3 — Minimal Dock',
    description: 'macOS-inspired narrow icon dock on the side. Ultra-minimal — icons only with tooltips on hover. Wordmark in topbar. Clean and spacious.',
    Component: MinimalDock,
  },
  {
    id: 'premium',
    label: '4 — Premium Suite',
    description: 'Luxury dashboard with glowing section dividers, gradient active states, and a user card at the bottom. POS button is highlighted as primary action.',
    Component: PremiumSuite,
  },
];

/* ─── Main Preview Page ─── */
export default function ShellPreviewPage() {
  const [viewport, setViewport] = useState<Viewport>('desktop');

  const viewports: { id: Viewport; label: string; note: string }[] = [
    { id: 'desktop', label: 'Desktop', note: '1200px+' },
    { id: 'tablet', label: 'Tablet', note: '768px' },
    { id: 'phone', label: 'Phone', note: '375px' },
  ];

  return (
    <div className="auth-lux-root" style={{ minHeight: '100vh' }}>
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          maxWidth: 1300,
          margin: '0 auto',
          padding: '40px 20px 80px',
        }}
      >
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h1
            style={{
              fontSize: '1.5rem',
              fontWeight: 800,
              color: '#f6d37a',
              letterSpacing: '0.04em',
              margin: '0 0 8px',
            }}
          >
            Shell Redesign Preview
          </h1>
          <p style={{ color: 'rgba(167,163,160,0.8)', fontSize: '0.85rem' }}>
            4 sidebar + topbar concepts across desktop, tablet, and phone viewports.
          </p>
        </div>

        {/* Viewport toggle */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 8,
            marginBottom: 36,
          }}
        >
          {viewports.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setViewport(v.id)}
              style={{
                padding: '6px 16px',
                borderRadius: 999,
                border: `1px solid ${viewport === v.id ? 'rgba(246,211,122,0.5)' : 'rgba(255,255,255,0.1)'}`,
                background: viewport === v.id ? 'rgba(246,211,122,0.12)' : 'rgba(255,255,255,0.03)',
                color: viewport === v.id ? '#f6d37a' : 'rgba(233,231,226,0.6)',
                fontSize: '0.75rem',
                cursor: 'pointer',
                fontWeight: viewport === v.id ? 600 : 400,
                transition: 'all 0.2s',
              }}
            >
              {v.label}{' '}
              <span style={{ opacity: 0.5, fontSize: '0.65rem' }}>({v.note})</span>
            </button>
          ))}
        </div>

        {/* Concept cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 48 }}>
          {CONCEPTS.map(({ id, label, description, Component }) => (
            <div key={id}>
              <div style={{ marginBottom: 16, textAlign: 'center' }}>
                <h2
                  style={{
                    fontSize: '1rem',
                    fontWeight: 700,
                    color: '#f6d37a',
                    letterSpacing: '0.04em',
                    margin: '0 0 4px',
                  }}
                >
                  {label}
                </h2>
                <p
                  style={{
                    fontSize: '0.75rem',
                    color: 'rgba(167,163,160,0.7)',
                    maxWidth: 500,
                    margin: '0 auto',
                    lineHeight: 1.5,
                  }}
                >
                  {description}
                </p>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  overflow: 'auto',
                  padding: '0 0 8px',
                }}
              >
                <Component viewport={viewport} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
