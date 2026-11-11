/**
 * Slash dates used across the app: "11/11 (수)", "2026/11/11 (수) 15:40".
 * Intl's ko-KR output ("11. 11. (수)") is split into parts and rejoined so
 * the weekday stays Korean while the date reads month/day.
 */
type Options = {
  /** Default Asia/Seoul; calendar-only dates pass "UTC". */
  timeZone?: string;
  year?: boolean;
  weekday?: boolean;
  time?: boolean;
};

const cache = new Map<string, Intl.DateTimeFormat>();

function formatter({ timeZone, year, weekday, time }: Required<Options>) {
  const key = `${timeZone}|${year}|${weekday}|${time}`;
  let format = cache.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat("ko-KR", {
      timeZone,
      ...(year ? { year: "numeric" } : {}),
      month: "numeric",
      day: "numeric",
      ...(weekday ? { weekday: "short" } : {}),
      ...(time ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" } : {}),
    });
    cache.set(key, format);
  }
  return format;
}

export function formatDate(
  value: number | Date,
  {
    timeZone = "Asia/Seoul",
    year = false,
    weekday = true,
    time = false,
  }: Options = {},
): string {
  const parts = Object.fromEntries(
    formatter({ timeZone, year, weekday, time })
      .formatToParts(value)
      .map((part) => [part.type, part.value]),
  );
  let text = `${parts.month}/${parts.day}`;
  if (year) text = `${parts.year}/${text}`;
  if (weekday) text += ` (${parts.weekday})`;
  if (time) text += ` ${parts.hour}:${parts.minute}`;
  return text;
}
