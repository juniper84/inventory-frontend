'use client';

import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { X, Eye, EyeOff, Send, Check, UserCog } from 'lucide-react';
import { TextInput } from '@/components/ui/TextInput';
import { Spinner } from '@/components/Spinner';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getPlatformAccessToken } from '@/lib/auth';
import type { PlatformTheme, ThemeOption } from './PlatformShell';

type Props = {
  open: boolean;
  onClose: () => void;
  theme: PlatformTheme;
  onThemeChange: (theme: PlatformTheme) => void;
  themes: readonly ThemeOption[];
  adminEmail?: string | null;
  t: (key: string) => string;
};

/**
 * Platform admin settings slide-in panel (right side).
 * Consolidates: admin profile, password change, theme selector.
 * Replaces the orphaned PlatformSecuritySection that had no home after Phase 2.
 */
export function PlatformSettingsPanel({
  open,
  onClose,
  theme,
  onThemeChange,
  themes,
  adminEmail,
  t,
}: Props) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pwMessage, setPwMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Clear form when panel is closed
  useEffect(() => {
    if (!open) {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPwMessage(null);
    }
  }, [open]);

  const handlePasswordSubmit = async () => {
    setPwMessage(null);
    if (!currentPassword || !newPassword) {
      setPwMessage({ type: 'error', text: t('settingsPasswordMissing') });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwMessage({ type: 'error', text: t('settingsPasswordMismatch') });
      return;
    }
    setIsSubmitting(true);
    try {
      const token = getPlatformAccessToken();
      if (!token) return;
      await apiFetch('/platform/auth/password', {
        token,
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setPwMessage({ type: 'success', text: t('settingsPasswordSuccess') });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPwMessage({
        type: 'error',
        text: getApiErrorMessage(err, t('settingsPasswordFailed')),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <>
      <div
        className="p-settings-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className="p-settings-panel"
        role="dialog"
        aria-modal="true"
        aria-label={t('settingsTitle')}
      >
        <div className="p-settings-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <UserCog size={16} style={{ color: 'var(--pt-accent)' }} />
            <h2 className="p-settings-title">{t('settingsTitle')}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-drawer-close"
            aria-label={t('settingsClose')}
          >
            <X size={14} />
          </button>
        </div>

        {/* Profile section */}
        <section className="p-settings-section">
          <span className="p-settings-section-label">
            {t('settingsProfileLabel')}
          </span>
          <div className="p-settings-row">
            <span style={{ color: 'var(--pt-text-muted)' }}>
              {t('settingsEmailLabel')}
            </span>
            <span style={{ color: 'var(--pt-text-1)', fontWeight: 600 }}>
              {adminEmail ?? '—'}
            </span>
          </div>
        </section>

        {/* Theme section */}
        <section className="p-settings-section">
          <span className="p-settings-section-label">
            {t('settingsThemeLabel')}
          </span>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '0.45rem',
            }}
          >
            {themes.map((th) => {
              const isActive = theme === th.key;
              return (
                <button
                  key={th.key}
                  type="button"
                  onClick={() => onThemeChange(th.key)}
                  style={
                    {
                      '--swatch': th.swatch,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      padding: '0.45rem 0.55rem',
                      border: `1px solid ${isActive ? 'var(--pt-accent-border-hi)' : 'var(--pt-accent-border)'}`,
                      borderRadius: '8px',
                      background: isActive ? 'var(--pt-accent-dim)' : 'var(--pt-bg-card)',
                      color: 'var(--pt-text-1)',
                      fontSize: '0.74rem',
                      fontWeight: isActive ? 600 : 500,
                      cursor: 'pointer',
                      transition: 'all 140ms',
                    } as CSSProperties
                  }
                >
                  <span
                    style={{
                      width: '12px',
                      height: '12px',
                      borderRadius: '50%',
                      background: th.swatch,
                      boxShadow: isActive
                        ? `0 0 0 2px var(--pt-accent-border-hi)`
                        : 'none',
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {th.label}
                  </span>
                  {isActive && <Check size={10} style={{ marginLeft: 'auto' }} />}
                </button>
              );
            })}
          </div>
        </section>

        {/* Password change section */}
        <section className="p-settings-section">
          <span className="p-settings-section-label">
            {t('settingsPasswordLabel')}
          </span>

          <div style={{ display: 'grid', gap: '0.55rem' }}>
            <div style={{ position: 'relative' }}>
              <TextInput
                label={t('settingsCurrentPassword')}
                type={showCurrent ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowCurrent((s) => !s)}
                aria-label={showCurrent ? t('settingsHide') : t('settingsShow')}
                style={{
                  position: 'absolute',
                  right: '0.5rem',
                  top: '1.6rem',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--pt-text-muted)',
                  cursor: 'pointer',
                }}
              >
                {showCurrent ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            </div>

            <div style={{ position: 'relative' }}>
              <TextInput
                label={t('settingsNewPassword')}
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowNew((s) => !s)}
                aria-label={showNew ? t('settingsHide') : t('settingsShow')}
                style={{
                  position: 'absolute',
                  right: '0.5rem',
                  top: '1.6rem',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--pt-text-muted)',
                  cursor: 'pointer',
                }}
              >
                {showNew ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            </div>

            <TextInput
              label={t('settingsConfirmPassword')}
              type={showNew ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
            />

            {pwMessage && (
              <div
                style={{
                  padding: '0.4rem 0.55rem',
                  fontSize: '0.72rem',
                  borderRadius: '6px',
                  background:
                    pwMessage.type === 'success'
                      ? 'rgba(61, 186, 122, 0.12)'
                      : 'rgba(224, 82, 82, 0.12)',
                  border: `1px solid ${
                    pwMessage.type === 'success'
                      ? 'rgba(61, 186, 122, 0.35)'
                      : 'rgba(224, 82, 82, 0.35)'
                  }`,
                  color:
                    pwMessage.type === 'success'
                      ? 'var(--pt-success)'
                      : 'var(--pt-danger)',
                }}
              >
                {pwMessage.text}
              </div>
            )}

            <button
              type="button"
              onClick={handlePasswordSubmit}
              disabled={
                isSubmitting ||
                !currentPassword ||
                !newPassword ||
                !confirmPassword
              }
              className="nvi-press"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem',
                padding: '0.5rem 0.8rem',
                borderRadius: '8px',
                background: 'var(--pt-accent)',
                color: 'black',
                border: 'none',
                fontSize: '0.75rem',
                fontWeight: 700,
                cursor: 'pointer',
                opacity: isSubmitting ? 0.6 : 1,
              }}
            >
              {isSubmitting ? (
                <Spinner size="xs" variant="dots" />
              ) : (
                <Send size={12} />
              )}
              {t('settingsPasswordSubmit')}
            </button>
          </div>
        </section>
      </aside>
    </>
  );
}
