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
  /** Server decision: OPEN, seats left and now < T-10. */
  joinable: boolean;
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

export type PostQuery = {
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

/** Reads `?type=&joinable=&page=` with a 1-based page; anything invalid falls back. */
export function parsePostQuery(params: {
  type?: string | string[];
  joinable?: string | string[];
  page?: string | string[];
}): PostQuery {
  const first = (value?: string | string[]) =>
    Array.isArray(value) ? value[0] : value;
  const type = first(params.type);
  const page = Number(first(params.page));
  return {
    type: type === "TAXI" || type === "DELIVERY" ? type : "ALL",
    joinableOnly: first(params.joinable) === "true",
    page:
      Number.isSafeInteger(page) && page >= 1 && page <= 10_000 ? page - 1 : 0,
  };
}

export function postQueryHref(basePath: string, query: PostQuery): string {
  const params = new URLSearchParams();
  if (query.type !== "ALL") params.set("type", query.type);
  if (query.joinableOnly) params.set("joinable", "true");
  if (query.page > 0) params.set("page", String(query.page + 1));
  const search = params.toString();
  return search ? `${basePath}?${search}` : basePath;
}

/**
 * Text label for the card status. OPEN with joinable=false is shown as
 * "참여 마감" without inventing a new status (AC-DISC-003-04).
 */
export function postStatusLabel(post: PostSummary): {
  label: string;
  reason: string | null;
  available: boolean;
} {
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
                : `${deadline} 10분 전 마감`,
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
