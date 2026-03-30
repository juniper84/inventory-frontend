/**
 * Date and time formatting utilities that respect the business's stored
 * timezone and date format preference. All functions accept a date value
 * (Date object, ISO string, or null/undefined) and return a formatted string.
 *
 * These are pure utilities — use the useFormatDate() hook in React components
 * to get pre-bound versions that automatically read from localStorage.
 */

const DEFAULT_TIMEZONE = 'Africa/Dar_es_Salaam';
const DEFAULT_DATE_FORMAT = 'DD/MM/YYYY';

/**
 * Formats a date value into a date-only string respecting the given timezone
 * and dateFormat preference (e.g. 'DD/MM/YYYY', 'YYYY-MM-DD', 'D MMM YYYY').
 */
export function formatDateWithTz(
  date: Date | string | null | undefined,
  timezone: string = DEFAULT_TIMEZONE,
  dateFormat: string = DEFAULT_DATE_FORMAT,
  locale = 'en',
): string {
  if (!date) return '—';
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return '—';

    const parts = new Intl.DateTimeFormat('en', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(d);

    const map: Record<string, string> = {};
    for (const part of parts) map[part.type] = part.value;
    const { year = '', month = '', day = '' } = map;

    switch (dateFormat) {
      case 'DD/MM/YYYY':  return `${day}/${month}/${year}`;
      case 'MM/DD/YYYY':  return `${month}/${day}/${year}`;
      case 'YYYY-MM-DD':  return `${year}-${month}-${day}`;
      case 'DD-MM-YYYY':  return `${day}-${month}-${year}`;
      case 'D MMM YYYY': {
        const monthName = new Intl.DateTimeFormat(locale, {
          month: 'short',
          timeZone: timezone,
        }).format(d);
        return `${parseInt(day, 10)} ${monthName} ${year}`;
      }
      default: return `${day}/${month}/${year}`;
    }
  } catch {
    return '—';
  }
}

/**
 * Formats a date+time value respecting the given timezone.
 * Time is always shown as 24-hour HH:mm.
 * Date portion respects the dateFormat preference.
 */
export function formatDateTimeWithTz(
  date: Date | string | null | undefined,
  timezone: string = DEFAULT_TIMEZONE,
  dateFormat: string = DEFAULT_DATE_FORMAT,
  locale = 'en',
): string {
  if (!date) return '—';
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return '—';

    const datePart = formatDateWithTz(d, timezone, dateFormat, locale);

    const timeParts = new Intl.DateTimeFormat('en', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(d);

    const timeMap: Record<string, string> = {};
    for (const part of timeParts) timeMap[part.type] = part.value;
    const hour = timeMap['hour'] ?? '00';
    const minute = timeMap['minute'] ?? '00';

    return `${datePart}, ${hour}:${minute}`;
  } catch {
    return '—';
  }
}

/**
 * Formats a time-only value (HH:mm) respecting the given timezone.
 */
export function formatTimeWithTz(
  date: Date | string | null | undefined,
  timezone: string = DEFAULT_TIMEZONE,
): string {
  if (!date) return '—';
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return '—';

    const parts = new Intl.DateTimeFormat('en', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(d);

    const map: Record<string, string> = {};
    for (const part of parts) map[part.type] = part.value;
    return `${map['hour'] ?? '00'}:${map['minute'] ?? '00'}`;
  } catch {
    return '—';
  }
}

/**
 * Converts a naive local datetime string (e.g. "2026-04-15T14:30") to a UTC
 * ISO string, interpreting the input as being in the given IANA timezone.
 *
 * Uses Intl.DateTimeFormat to determine the timezone offset at the given date,
 * then shifts the time to UTC accordingly.
 *
 * Returns the original value unchanged if parsing fails.
 */
export function localToUtcIso(
  naiveDatetime: string,
  timezone: string = DEFAULT_TIMEZONE,
): string {
  if (!naiveDatetime) return naiveDatetime;
  try {
    // Parse as UTC first to get a stable reference point
    const asUtc = new Date(naiveDatetime + (naiveDatetime.includes('Z') ? '' : 'Z'));
    if (isNaN(asUtc.getTime())) return naiveDatetime;

    // Find what the local time would be in the target timezone at this UTC instant
    const parts = new Intl.DateTimeFormat('en', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(asUtc);

    const map: Record<string, string> = {};
    for (const p of parts) map[p.type] = p.value;
    const localAtUtc = new Date(
      `${map['year']}-${map['month']}-${map['day']}T${map['hour']}:${map['minute']}:${map['second']}Z`,
    );

    // The offset is the difference between the UTC instant and the local representation
    const offsetMs = localAtUtc.getTime() - asUtc.getTime();

    // Shift the user's intended local time back by the offset to get true UTC
    const utc = new Date(asUtc.getTime() - offsetMs);
    return utc.toISOString();
  } catch {
    return naiveDatetime;
  }
}
