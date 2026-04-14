'use client';

import { useEffect, useState } from 'react';
import {
  isSoundEnabled,
  setSoundEnabled,
  isPosMuteEnabled,
  setPosMuteEnabled,
  playNotificationSound,
} from '@/lib/notification-sounds';

/**
 * NotificationPreferences — Settings card for notification sound toggles.
 * Reads/writes localStorage directly (per-device, not per-account).
 */
export function NotificationPreferences() {
  const [soundsOn, setSoundsOn] = useState(false);
  const [posMuteOn, setPosMuteOn] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setSoundsOn(isSoundEnabled());
    setPosMuteOn(isPosMuteEnabled());
    setHydrated(true);
  }, []);

  const toggleSounds = () => {
    const next = !soundsOn;
    setSoundsOn(next);
    setSoundEnabled(next);
    if (next) {
      // Play a little info sound as confirmation
      playNotificationSound('info');
    }
  };

  const togglePosMute = () => {
    const next = !posMuteOn;
    setPosMuteOn(next);
    setPosMuteEnabled(next);
  };

  if (!hydrated) {
    // Avoid hydration mismatch — defer render until localStorage is read
    return (
      <div className="nvi-prefs-card">
        <h3 className="nvi-prefs-card__title">Notification preferences</h3>
        <p className="nvi-prefs-card__sub">Loading…</p>
      </div>
    );
  }

  return (
    <div className="nvi-prefs-card">
      <h3 className="nvi-prefs-card__title">Notification preferences</h3>
      <p className="nvi-prefs-card__sub">
        Saved on this device. Won&apos;t sync to other computers.
      </p>

      <div className="nvi-prefs-row">
        <button
          type="button"
          role="switch"
          aria-checked={soundsOn}
          onClick={toggleSounds}
          className={`nvi-prefs-switch ${soundsOn ? 'nvi-prefs-switch--on' : ''}`}
        >
          <span className="nvi-prefs-switch__thumb" />
        </button>
        <div className="nvi-prefs-row__body">
          <div className="nvi-prefs-row__label">Notification sounds</div>
          <div className="nvi-prefs-row__hint">
            Play a subtle chime when toasts appear (success, error, warning, info).
          </div>
        </div>
      </div>

      <div className="nvi-prefs-row">
        <button
          type="button"
          role="switch"
          aria-checked={posMuteOn}
          onClick={togglePosMute}
          className={`nvi-prefs-switch ${posMuteOn ? 'nvi-prefs-switch--on' : ''}`}
        >
          <span className="nvi-prefs-switch__thumb" />
        </button>
        <div className="nvi-prefs-row__body">
          <div className="nvi-prefs-row__label">
            Mute non-critical toasts in POS
          </div>
          <div className="nvi-prefs-row__hint">
            During POS sessions, hide info and success toasts. Errors still show.
          </div>
        </div>
      </div>
    </div>
  );
}
