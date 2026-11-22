// Coming back day after day: the arithmetic of the days in a row. On its own so that the game can count by
// itself when there is no server to ask (src/net/Visits.js) without carrying the server along.
const DAY = 86400_000;

/** The calendar day (as a number of days since 1970) at a visitor's place: the server's clock, their time zone. */
export const localDay = (at, tzMinutes) => Math.floor((at - Math.max(-840, Math.min(840, Number(tzMinutes) || 0)) * 60_000) / DAY);

/**
 * A visit: how many days in a row this device has come (1 on the first day), and its longest run ever.
 * `seen` is what was kept ({ day, days, best }) or nothing. Returns the new record.
 */
export function visit(seen, day) {
  const was = seen && Number.isInteger(seen.day) ? seen : null;
  const days = !was ? 1 : day === was.day ? was.days : day === was.day + 1 ? was.days + 1 : day > was.day ? 1 : was.days;
  return { day: was ? Math.max(day, was.day) : day, days, best: Math.max(days, was?.best || 0) };
}
