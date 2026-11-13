/*
 * List search rules shared by the API adapter, the demo list and the search
 * panel: time windows, place matching, sort words and the removable chips.
 */
import {
  cleanSearch,
  type PostQuery,
  type PostSort,
  type TimeWindow,
} from "./posts";

const MINUTE = 60_000;
const SEOUL_OFFSET_MS = 9 * 3_600_000;
const SCHOOL = "삼육대";

export const SORT_LABELS: Record<PostSort, string> = {
  TIME: "출발·마감 빠른 순",
  RECENT: "최근 등록 순",
};

export const TIME_LABELS: Record<TimeWindow, string> = {
  hour: "1시간 안",
  tonight: "오늘 밤",
  morning: "내일 아침",
  custom: "직접",
};

/** Seoul wall clock as `YYYY-MM-DDTHH:mm` (Korea has no DST). */
export function seoulLocal(ms: number): string {
  return new Date(Math.floor(ms / MINUTE) * MINUTE + SEOUL_OFFSET_MS)
    .toISOString()
    .slice(0, 16);
}

/** `YYYY-MM-DDTHH:mm` in Seoul → ISO-8601 with the +09:00 offset. */
export const seoulIso = (local: string) => `${local}:00+09:00`;

const dayAfter = (date: string) =>
  seoulLocal(Date.parse(`${date}T00:00:00+09:00`) + 86_400_000).slice(0, 10);

/**
 * The reference-time window for the server's `from`/`to` (from inclusive, to
 * exclusive), worked out at `nowMs` so "1시간 안" always means from now.
 */
export function timeRange(
  query: PostQuery,
  nowMs: number,
): { from?: string; to?: string } {
  const today = seoulLocal(nowMs).slice(0, 10);
  switch (query.time) {
    case "hour":
      return {
        from: seoulIso(seoulLocal(nowMs)),
        to: seoulIso(seoulLocal(nowMs + 60 * MINUTE)),
      };
    case "tonight":
      return {
        from: seoulIso(`${today}T18:00`),
        to: seoulIso(`${dayAfter(today)}T03:00`),
      };
    case "morning": {
      const tomorrow = dayAfter(today);
      return {
        from: seoulIso(`${tomorrow}T06:00`),
        to: seoulIso(`${tomorrow}T12:00`),
      };
    }
    case "custom":
      return {
        ...(query.from ? { from: seoulIso(query.from) } : {}),
        ...(query.to ? { to: seoulIso(query.to) } : {}),
      };
    default:
      return {};
  }
}

/** A custom window that ends before it starts cannot match anything. */
export function invalidCustomRange(query: PostQuery): boolean {
  return (
    query.time === "custom" &&
    !!query.from &&
    !!query.to &&
    query.from >= query.to
  );
}

/** Server place rule: spaces, case and "역" do not matter. */
export function placeKey(value: string): string {
  return value.replace(/\s+/g, "").replace(/역/g, "").toLowerCase();
}

const contains = (value: string | undefined, needle: string) =>
  value !== undefined && placeKey(value).includes(placeKey(needle));

type Searchable = {
  type: "TAXI" | "DELIVERY";
  referenceTime: string;
  title?: string;
  departure?: string;
  destination?: string;
  restaurantName?: string;
  pickupLocation?: string;
};

/** The server's search rule, for lists built in the browser (demo). */
export function matchesSearch(
  post: Searchable,
  query: PostQuery,
  nowMs: number,
): boolean {
  const clean = cleanSearch(query);
  if (clean.type !== "ALL" && post.type !== clean.type) return false;
  if (
    clean.q &&
    ![
      post.departure,
      post.destination,
      post.restaurantName,
      post.pickupLocation,
      post.title,
    ].some((value) => contains(value, clean.q!))
  )
    return false;
  if (clean.departure && !contains(post.departure, clean.departure))
    return false;
  if (clean.destination && !contains(post.destination, clean.destination))
    return false;
  if (clean.restaurant && !contains(post.restaurantName, clean.restaurant))
    return false;
  if (clean.pickup && !contains(post.pickupLocation, clean.pickup))
    return false;
  if (clean.direction === "TO_SCHOOL" && !contains(post.destination, SCHOOL))
    return false;
  if (clean.direction === "FROM_SCHOOL" && !contains(post.departure, SCHOOL))
    return false;
  const { from, to } = timeRange(clean, nowMs);
  const at = Date.parse(post.referenceTime);
  if (from && at < Date.parse(from)) return false;
  if (to && at >= Date.parse(to)) return false;
  return true;
}

const shortTime = (local: string) => {
  const [date, time] = local.split("T");
  const [, month, day] = date.split("-");
  return `${Number(month)}/${Number(day)} ${time}`;
};

/** "11/14 21:00 ~ 23:00", "11/14 21:00부터", "23:00까지". */
export function customRangeLabel(from?: string, to?: string): string {
  if (from && to) {
    const sameDay = from.slice(0, 10) === to.slice(0, 10);
    return `${shortTime(from)} ~ ${sameDay ? to.slice(11) : shortTime(to)}`;
  }
  if (from) return `${shortTime(from)}부터`;
  return to ? `${shortTime(to)}까지` : TIME_LABELS.custom;
}

export type SearchChip = {
  key: string;
  label: string;
  /** Fields to reset when the chip is removed. */
  clear: Partial<PostQuery>;
};

/** The active conditions, in the panel's order, as removable chips. */
export function searchChips(query: PostQuery): SearchChip[] {
  const clean = cleanSearch(query);
  const chips: SearchChip[] = [];
  const text = (
    key: "q" | "departure" | "destination" | "restaurant" | "pickup",
    label: string,
  ) => {
    if (clean[key]) chips.push({ key, label, clear: { [key]: undefined } });
  };
  text("departure", `출발 ${clean.departure}`);
  text("destination", `도착 ${clean.destination}`);
  if (clean.direction)
    chips.push({
      key: "direction",
      label: clean.direction === "TO_SCHOOL" ? "학교행" : "학교발",
      clear: { direction: undefined },
    });
  text("restaurant", `음식점 ${clean.restaurant}`);
  text("pickup", `수령 ${clean.pickup}`);
  text("q", `검색어 ${clean.q}`);
  if (clean.time)
    chips.push({
      key: "time",
      label:
        clean.time === "custom"
          ? customRangeLabel(clean.from, clean.to)
          : TIME_LABELS[clean.time],
      clear: { time: undefined, from: undefined, to: undefined },
    });
  if (!clean.joinableOnly)
    chips.push({
      key: "joinable",
      label: "마감 포함",
      clear: { joinableOnly: true },
    });
  if (clean.sort === "RECENT")
    chips.push({
      key: "sort",
      label: SORT_LABELS.RECENT,
      clear: { sort: undefined },
    });
  return chips;
}

/** Form fields a new post can start with, from the list's conditions. */
export function newPostHref(query: PostQuery): string {
  const clean = cleanSearch(query);
  const params = new URLSearchParams();
  if (clean.type === "DELIVERY") {
    params.set("type", "DELIVERY");
    if (clean.restaurant) params.set("restaurant", clean.restaurant);
    if (clean.pickup) params.set("pickup", clean.pickup);
  } else if (clean.type === "TAXI") {
    if (clean.departure) params.set("departure", clean.departure);
    if (clean.destination) params.set("destination", clean.destination);
  }
  const search = params.toString();
  return search ? `/posts/new?${search}` : "/posts/new";
}
