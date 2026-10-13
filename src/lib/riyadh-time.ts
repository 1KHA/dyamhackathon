/**
 * Riyadh time for everyone, whatever timezone the viewer's device is set to.
 *
 * Times are stored as UTC instants. Shown with plain `toLocaleString()` (or
 * typed into a date/time input), they follow the DEVICE's timezone — a laptop
 * on Asia/Jakarta showed a 13:40 session as 17:40. Every page shows and
 * accepts Saudi local time instead:
 *   - formatting: pass `timeZone: APP_TIME_ZONE` to toLocale*() / Intl;
 *   - inputs: build instants with fromRiyadh() / fromRiyadhInput(), fill
 *     inputs with riyadhDayKey() / riyadhHHMM() / toRiyadhInput();
 *   - date-fns format(): pass asRiyadhWallClock(date);
 *   - react-big-calendar: use moment from '@/lib/riyadh-moment'.
 * Asia/Riyadh is UTC+3 all year (no daylight saving), so fixed-offset maths
 * is exact. Safe on server and client.
 */
export const APP_TIME_ZONE = 'Asia/Riyadh';

const OFFSET = '+03:00';
const OFFSET_MS = 3 * 60 * 60 * 1000;
const pad = (n: number) => String(n).padStart(2, '0');

/** Same instant, moved so its UTC fields read Riyadh wall-clock time. */
function shifted(value: Date | string | number): Date {
  return new Date(new Date(value).getTime() + OFFSET_MS);
}

/** Riyadh calendar day, "YYYY-MM-DD". */
export function riyadhDayKey(value: Date | string | number): string {
  const s = shifted(value);
  return `${s.getUTCFullYear()}-${pad(s.getUTCMonth() + 1)}-${pad(s.getUTCDate())}`;
}

/** Riyadh time of day, "HH:MM" (24h) — for <input type="time">. */
export function riyadhHHMM(value: Date | string | number): string {
  const s = shifted(value);
  return `${pad(s.getUTCHours())}:${pad(s.getUTCMinutes())}`;
}

/** Riyadh "YYYY-MM-DDTHH:MM" — for <input type="datetime-local">. */
export function toRiyadhInput(value: Date | string | number): string {
  return `${riyadhDayKey(value)}T${riyadhHHMM(value)}`;
}

/** A Riyadh day ("YYYY-MM-DD") and time ("HH:MM") → the instant. */
export function fromRiyadh(day: string, time = '00:00'): Date {
  return new Date(`${day}T${time.length === 5 ? `${time}:00` : time}${OFFSET}`);
}

/** A datetime-local value typed as Riyadh time → the instant. */
export function fromRiyadhInput(value: string): Date {
  const [day, time] = value.split('T');
  return fromRiyadh(day, time || '00:00');
}

/**
 * A Date whose DEVICE-local fields equal Riyadh wall-clock time. Only for
 * libraries that read local fields to display (date-fns format); never send
 * it to the server or compare it with real instants.
 */
export function asRiyadhWallClock(value: Date | string | number): Date {
  const s = shifted(value);
  return new Date(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate(), s.getUTCHours(), s.getUTCMinutes(), s.getUTCSeconds());
}
