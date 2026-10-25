// All companies work in Estonian time, as in the original platform.
const ZONE = "Europe/Tallinn";
const zoned = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function now(): { date: string; minute: number } {
  const p = Object.fromEntries(zoned.formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minute: Number(p.hour) * 60 + Number(p.minute) };
}

export function addDays(date: string, days: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function isDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value + "T00:00:00Z")) &&
    new Date(value + "T00:00:00Z").toISOString().startsWith(value)
  );
}

/** ISO weekday: Monday is 1, Sunday is 7. */
export function weekday(date: string): number {
  return ((new Date(date + "T00:00:00Z").getUTCDay() + 6) % 7) + 1;
}

export function isFuture(date: string, minute: number): boolean {
  const n = now();
  return date > n.date || (date === n.date && minute > n.minute);
}
