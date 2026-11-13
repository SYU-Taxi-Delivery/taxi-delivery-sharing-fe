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

const seoulDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Days between two instants by Seoul calendar date (0 = same day). */
export function seoulDayDiff(value: number, now: number): number {
  const day = (ms: number) => Date.parse(`${seoulDay.format(ms)}T00:00:00Z`);
  return Math.round((day(value) - day(now)) / 86_400_000);
}

/**
 * Relative day word for schedules: "오늘", "내일", "모레", else the slash
 * date ("11/16 (월)"); past days ("어제") also fall back to the date. Times
 * after midnight read as "내일 00:04", never as today.
 */
export function dayLabel(value: number, now: number): string {
  if (!Number.isFinite(value) || !Number.isFinite(now))
    return formatDate(value);
  const diff = seoulDayDiff(value, now);
  if (diff === 0) return "오늘";
  if (diff === 1) return "내일";
  if (diff === 2) return "모레";
  return formatDate(value);
}

const clock = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Seoul wall clock "HH:MM". */
export function formatTime(value: number): string {
  return clock.format(value);
}

/**
 * Day word plus time for schedules and deadlines: "오늘 23:49",
 * "내일 00:04", "11/16 (월) 09:00". Every time a student must act by gets
 * one, so a deadline just after midnight never reads as tonight.
 */
export function dayTime(value: number, now: number): string {
  return `${dayLabel(value, now)} ${formatTime(value)}`;
}
