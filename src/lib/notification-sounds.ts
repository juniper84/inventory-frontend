'use client';

import type { NotifySeverity } from '@/components/notifications/types';

/**
 * AudioPool — Pre-loads notification sound files and plays them on demand.
 *
 * Files expected at /public/sounds/notifications/{severity}.mp3.
 * If a file is missing, play() silently does nothing (no error thrown).
 *
 * Respects browser autoplay policy automatically — first user interaction
 * unlocks audio. Failures are swallowed (users will just not hear sound).
 */

const SOUND_FILES: Record<NotifySeverity, string> = {
  success: '/sounds/notifications/success.mp3',
  error: '/sounds/notifications/error.mp3',
  warning: '/sounds/notifications/warning.mp3',
  info: '/sounds/notifications/info.mp3',
};

const DEFAULT_VOLUME = 0.4;
const MUTE_KEY = 'nvi.notificationSounds'; // "on" | "off"
const POS_MUTE_KEY = 'nvi.muteNonCriticalPos';

let pool: Map<NotifySeverity, HTMLAudioElement> | null = null;
let preloadStarted = false;

export function preloadSounds() {
  if (preloadStarted || typeof window === 'undefined') return;
  preloadStarted = true;
  pool = new Map();
  (Object.keys(SOUND_FILES) as NotifySeverity[]).forEach((severity) => {
    try {
      const audio = new Audio(SOUND_FILES[severity]);
      audio.volume = DEFAULT_VOLUME;
      audio.preload = 'auto';
      // Listen for errors silently; a missing file is fine.
      audio.addEventListener('error', () => {
        pool?.delete(severity);
      });
      pool!.set(severity, audio);
    } catch {
      // ignore
    }
  });
}

export function isSoundEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(MUTE_KEY) === 'on';
}

export function setSoundEnabled(enabled: boolean) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(MUTE_KEY, enabled ? 'on' : 'off');
}

export function isPosMuteEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(POS_MUTE_KEY) === 'on';
}

export function setPosMuteEnabled(enabled: boolean) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(POS_MUTE_KEY, enabled ? 'on' : 'off');
}

export function playNotificationSound(severity: NotifySeverity) {
  if (typeof window === 'undefined') return;
  if (!isSoundEnabled()) return;
  if (!pool) preloadSounds();
  const audio = pool?.get(severity);
  if (!audio) return;
  try {
    audio.currentTime = 0;
    const result = audio.play();
    if (result && typeof result.catch === 'function') {
      result.catch(() => {
        // Autoplay blocked or file missing — silent fail
      });
    }
  } catch {
    // ignore
  }
}
