/**
 * "Today" for general check-ins, computed in Asia/Riyadh regardless of the
 * server's timezone — a UTC server must not flip the date at 3am local.
 * en-CA locale yields YYYY-MM-DD directly.
 */
export function riyadhToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
