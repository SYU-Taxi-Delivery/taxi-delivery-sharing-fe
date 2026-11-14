import {
  cutoffMinutes,
  recruitmentStatusAt,
  toRecruitmentStatus,
  type RecruitmentStatus,
} from "@/features/participation/participation";
import { formatDate } from "@/lib/dateFormat";

export type PostType = "TAXI" | "DELIVERY";
export type PostStatus =
  "OPEN" | "FULL" | "CLOSED" | "CANCELLED" | "FINISHED" | "REMOVED";

type PostBase = {
  id: string;
  status: PostStatus;
  /** TAXI departure time or DELIVERY order deadline, ISO with offset. */
  referenceTime: string;
  capacity: number;
  /** Includes the author. */
  currentMemberCount: number;
  /** Server decision: OPEN, seats left and now before the participation deadline. */
  joinable: boolean;
  /** Server join/cancel cutoff, ISO with offset. */
  participationDeadline?: string;
  /** Server public status; preferred over the local derivation when present. */
  recruitmentStatus?: RecruitmentStatus;
  authorName?: string;
};

/** Screen model for a list card. Not a server DTO; the adapter maps into it. */
export type PostSummary =
  | (PostBase & { type: "TAXI"; departure: string; destination: string })
  | (PostBase & {
      type: "DELIVERY";
      restaurantName: string;
      pickupLocation: string;
    });

export type PostPage = {
  content: PostSummary[];
  totalElements: number;
  totalPages: number;
  /** 0-based page index. */
  number: number;
  size: number;
};

export type PostFilter = "ALL" | PostType;

export type Direction = "TO_SCHOOL" | "FROM_SCHOOL";
/** Time window chips; `custom` uses `from`/`to`. */
export type TimeWindow = "hour" | "tonight" | "morning" | "custom";
export type PostSort = "TIME" | "RECENT";

/**
 * Search conditions (GET /api/posts). All optional; an empty or missing value
 * means "no condition". Taxi fields only apply to TAXI, delivery fields only
 * to DELIVERY.
 */
export type PostSearch = {
  /** Any of places or title. */
  q?: string;
  departure?: string;
  destination?: string;
  restaurant?: string;
  pickup?: string;
  direction?: Direction;
  time?: TimeWindow;
  /** Custom window in Seoul local time, `YYYY-MM-DDTHH:mm`; from inclusive. */
  from?: string;
  /** Custom window end, exclusive. */
  to?: string;
  /** TIME (default) or RECENT. */
  sort?: PostSort;
};

export type PostQuery = PostSearch & {
  type: PostFilter;
  joinableOnly: boolean;
  /** 0-based page index sent to the API. */
  page: number;
};

export const PAGE_SIZE = 20;

// UI callback; URI, query names and DTO mapping belong to the API adapter (#18).
export type PostListOperations = {
  list: (query: PostQuery) => Promise<unknown>;
};

const statuses: readonly PostStatus[] = [
  "OPEN",
  "FULL",
  "CLOSED",
  "CANCELLED",
  "FINISHED",
  "REMOVED",
];
const maxCapacity: Record<PostType, number> = { TAXI: 4, DELIVERY: 10 };
const hasTimezone = /(?:Z|[+-]\d{2}:\d{2})$/i;

class InvalidPostData extends Error {
  constructor() {
    super("모집 목록 정보를 확인할 수 없습니다.");
    this.name = "InvalidPostData";
  }
}

const text = (value: unknown) =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null;
const instant = (value: unknown) => {
  const raw = text(value);
  return raw && hasTimezone.test(raw) && Number.isFinite(Date.parse(raw))
    ? raw
    : null;
};
const count = (value: unknown) =>
  Number.isSafeInteger(value) && (value as number) >= 0
    ? (value as number)
    : null;

function toPostSummary(value: unknown): PostSummary {
  if (typeof value !== "object" || value === null) throw new InvalidPostData();
  const raw = value as Record<string, unknown>;
  const id =
    text(raw.id) ??
    (Number.isSafeInteger(raw.id) && (raw.id as number) > 0
      ? String(raw.id)
      : null);
  const type = raw.type;
  const status = raw.status as PostStatus;
  const referenceTime = text(raw.referenceTime);
  const capacity = count(raw.capacity);
  const current = count(raw.currentMemberCount);
  if (
    !id ||
    (type !== "TAXI" && type !== "DELIVERY") ||
    !statuses.includes(status) ||
    !referenceTime ||
    !hasTimezone.test(referenceTime) ||
    !Number.isFinite(Date.parse(referenceTime)) ||
    capacity === null ||
    capacity < 2 ||
    capacity > maxCapacity[type] ||
    current === null ||
    current < 1 ||
    current > capacity ||
    typeof raw.joinable !== "boolean"
  ) {
    throw new InvalidPostData();
  }
  const base = {
    id,
    status,
    referenceTime,
    capacity,
    currentMemberCount: current,
    joinable: raw.joinable,
    ...(instant(raw.participationDeadline)
      ? { participationDeadline: instant(raw.participationDeadline)! }
      : {}),
    ...(toRecruitmentStatus(raw.recruitmentStatus)
      ? { recruitmentStatus: toRecruitmentStatus(raw.recruitmentStatus) }
      : {}),
    ...(text(raw.authorName) ? { authorName: text(raw.authorName)! } : {}),
  };
  if (type === "TAXI") {
    const departure = text(raw.departure);
    const destination = text(raw.destination);
    // A card with a guessed place would mislead (AC-TAXI-003-02).
    if (!departure || !destination) throw new InvalidPostData();
    return { ...base, type, departure, destination };
  }
  const restaurantName = text(raw.restaurantName);
  const pickupLocation = text(raw.pickupLocation);
  if (!restaurantName || !pickupLocation) throw new InvalidPostData();
  return { ...base, type, restaurantName, pickupLocation };
}

/** Validates a plain list of cards, e.g. similar-post candidates. */
export function toPostSummaries(value: unknown): PostSummary[] {
  if (!Array.isArray(value)) throw new InvalidPostData();
  return value.map(toPostSummary);
}

/** Validates the whole page; one broken card makes the page an error. */
export function toPostPage(value: unknown): PostPage {
  if (typeof value !== "object" || value === null) throw new InvalidPostData();
  const raw = value as Record<string, unknown>;
  const totalElements = count(raw.totalElements);
  const totalPages = count(raw.totalPages);
  const number = count(raw.number);
  const size = count(raw.size);
  if (
    !Array.isArray(raw.content) ||
    totalElements === null ||
    totalPages === null ||
    number === null ||
    size === null ||
    raw.content.length > Math.max(size, 0)
  ) {
    throw new InvalidPostData();
  }
  const content = raw.content.map(toPostSummary);
  const ids = new Set(content.map((post) => post.id));
  if (ids.size !== content.length) throw new InvalidPostData();
  return { content, totalElements, totalPages, number, size };
}

/** Default list view: every type, only pods you can still join, first page. */
export const DEFAULT_POST_QUERY: PostQuery = {
  type: "ALL",
  joinableOnly: true,
  page: 0,
};

export const SEARCH_TEXT_MAX = 100;
const localMinute = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const TEXT_KEYS = [
  "q",
  "departure",
  "destination",
  "restaurant",
  "pickup",
] as const;

/**
 * Keeps only conditions that apply: taxi fields for TAXI, delivery fields for
 * DELIVERY, trimmed text, a custom window only with a valid from or to, and
 * TIME sort left out as the default.
 */
export function cleanSearch(query: PostQuery): PostQuery {
  const next: PostQuery = {
    type: query.type,
    joinableOnly: query.joinableOnly,
    page: query.page,
  };
  for (const key of TEXT_KEYS) {
    const value = query[key]?.trim().slice(0, SEARCH_TEXT_MAX);
    if (!value) continue;
    if ((key === "departure" || key === "destination") && query.type !== "TAXI")
      continue;
    if ((key === "restaurant" || key === "pickup") && query.type !== "DELIVERY")
      continue;
    next[key] = value;
  }
  if (query.type === "TAXI" && query.direction)
    next.direction = query.direction;
  if (query.time && query.time !== "custom") next.time = query.time;
  if (query.time === "custom") {
    const from = query.from && localMinute.test(query.from) ? query.from : "";
    const to = query.to && localMinute.test(query.to) ? query.to : "";
    if (from || to) {
      next.time = "custom";
      if (from) next.from = from;
      if (to) next.to = to;
    }
  }
  if (query.sort === "RECENT") next.sort = "RECENT";
  return next;
}

/** True when any search condition (not type, 참여 가능 or page) is set. */
export function hasSearch(query: PostQuery): boolean {
  const clean = cleanSearch(query);
  return (
    TEXT_KEYS.some((key) => clean[key]) ||
    !!clean.direction ||
    !!clean.time ||
    !!clean.sort
  );
}

/** True when type, the joinable filter or a search differs from the default. */
export function isFilteredQuery(query: PostQuery): boolean {
  return (
    query.type !== DEFAULT_POST_QUERY.type ||
    query.joinableOnly !== DEFAULT_POST_QUERY.joinableOnly ||
    hasSearch(query)
  );
}

type Params = Record<string, string | string[] | undefined>;

/**
 * Reads `?type=&joinable=&page=` with a 1-based page plus the search
 * conditions; anything invalid falls back. 참여 가능 is on by default, so only
 * `joinable=false` turns it off.
 */
export function parsePostQuery(params: Params): PostQuery {
  const first = (value?: string | string[]) =>
    Array.isArray(value) ? value[0] : value;
  const type = first(params.type);
  const page = Number(first(params.page));
  const direction = first(params.direction);
  const time = first(params.time);
  return cleanSearch({
    type: type === "TAXI" || type === "DELIVERY" ? type : "ALL",
    joinableOnly: first(params.joinable) !== "false",
    page:
      Number.isSafeInteger(page) && page >= 1 && page <= 10_000 ? page - 1 : 0,
    q: first(params.q),
    departure: first(params.departure),
    destination: first(params.destination),
    restaurant: first(params.restaurant),
    pickup: first(params.pickup),
    direction:
      direction === "TO_SCHOOL" || direction === "FROM_SCHOOL"
        ? direction
        : undefined,
    time:
      time === "hour" ||
      time === "tonight" ||
      time === "morning" ||
      time === "custom"
        ? time
        : undefined,
    from: first(params.from),
    to: first(params.to),
    sort: first(params.sort) === "RECENT" ? "RECENT" : undefined,
  });
}

/** The list URL; every condition lives in the query so it can be shared. */
export function postQueryHref(basePath: string, query: PostQuery): string {
  const clean = cleanSearch(query);
  const params = new URLSearchParams();
  if (clean.type !== "ALL") params.set("type", clean.type);
  if (!clean.joinableOnly) params.set("joinable", "false");
  for (const key of TEXT_KEYS) {
    if (clean[key]) params.set(key, clean[key]);
  }
  if (clean.direction) params.set("direction", clean.direction);
  if (clean.time) params.set("time", clean.time);
  if (clean.from) params.set("from", clean.from);
  if (clean.to) params.set("to", clean.to);
  if (clean.sort) params.set("sort", clean.sort);
  if (clean.page > 0) params.set("page", String(clean.page + 1));
  const search = params.toString();
  return search ? `${basePath}?${search}` : basePath;
}

type StatusLabel = { label: string; reason: string | null; available: boolean };

/** Card words for each server recruitment status. */
function recruitmentLabel(
  post: PostSummary,
  status: RecruitmentStatus,
): StatusLabel {
  const deadline = post.type === "TAXI" ? "출발" : "주문 마감";
  switch (status) {
    case "RECRUITING":
      return { label: "모집 중", reason: null, available: true };
    case "FULL":
      return { label: "정원 마감", reason: "정원 마감", available: false };
    case "CLOSED":
      return {
        label: "모집 마감",
        reason: "작성자 모집 마감",
        available: false,
      };
    case "APPLICATION_CLOSED":
      return {
        label: "참여 마감",
        reason: `${deadline} ${cutoffMinutes(post)}분 전 마감`,
        available: false,
      };
    case "CANCELLED":
      return {
        label: "모집 취소",
        reason: "작성자 모집 취소",
        available: false,
      };
    case "FINISHED":
      return {
        label: "모집 완료",
        reason: `${deadline} 시간 경과`,
        available: false,
      };
    case "REMOVED":
      return { label: "삭제된 모집", reason: "삭제된 모집", available: false };
  }
}

/**
 * Text label for the card status. The server's recruitmentStatus wins (moved
 * on by `nowMs` when given); without it, OPEN with joinable=false is shown as
 * "참여 마감" without inventing a new status (AC-DISC-003-04).
 */
export function postStatusLabel(
  post: PostSummary,
  nowMs?: number,
): StatusLabel {
  const server =
    nowMs === undefined
      ? post.recruitmentStatus
      : recruitmentStatusAt(post, nowMs);
  if (server) return recruitmentLabel(post, server);
  const deadline = post.type === "TAXI" ? "출발" : "주문 마감";
  switch (post.status) {
    case "OPEN":
      return post.joinable
        ? { label: "모집 중", reason: null, available: true }
        : {
            label: "참여 마감",
            reason:
              post.currentMemberCount >= post.capacity
                ? "정원 마감"
                : `${deadline} ${cutoffMinutes(post)}분 전 마감`,
            available: false,
          };
    case "FULL":
      return { label: "정원 마감", reason: "정원 마감", available: false };
    case "CLOSED":
      return {
        label: "모집 마감",
        reason: "작성자 모집 마감",
        available: false,
      };
    case "CANCELLED":
      return {
        label: "모집 취소",
        reason: "작성자 모집 취소",
        available: false,
      };
    case "FINISHED":
      return {
        label: "모집 완료",
        reason: `${deadline} 시간 경과`,
        available: false,
      };
    case "REMOVED":
      return { label: "삭제된 모집", reason: "삭제된 모집", available: false };
  }
}

export type PostDayGroup = {
  /** Seoul calendar date, e.g. "2026/11/13 (금)". */
  key: string;
  /** referenceTime of the first post in the group, epoch ms. */
  time: number;
  posts: PostSummary[];
};

/**
 * Splits a server-ordered page into runs of the same Seoul day, keeping the
 * order. A run only breaks where the day changes between neighbours.
 */
export function groupPostsByDay(posts: PostSummary[]): PostDayGroup[] {
  const groups: PostDayGroup[] = [];
  for (const post of posts) {
    const time = Date.parse(post.referenceTime);
    const key = formatDate(time, { year: true });
    const last = groups.at(-1);
    if (last?.key === key) last.posts.push(post);
    else groups.push({ key, time, posts: [post] });
  }
  return groups;
}
