const LONG_DATE = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** Unambiguous long form. UTC, so a build machine's timezone cannot shift the day. */
export function formatDate(d: Date): string {
  return LONG_DATE.format(d);
}

/** Date-only ISO string for a <time datetime> attribute. */
export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function readingTimeLabel(minutes: number): string {
  return `${Math.max(1, Math.round(minutes))} min read`;
}
