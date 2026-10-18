import type { PostStatus, PostType } from "../posts";

/** Field limits from the PRD (code points after NFC and trimming). */
export const LIMITS = {
  title: 60,
  description: 1000,
  place: 100,
  orderGuide: 500,
  communicationUrl: 500,
} as const;

export const CAPACITY: Record<PostType, { min: number; max: number }> = {
  TAXI: { min: 2, max: 4 },
  DELIVERY: { min: 2, max: 10 },
};

/** A reference time must be more than this far in the future. */
export const MIN_LEAD_MS = 10 * 60 * 1000;

export type CommonDraft = {
  title: string;
  description: string;
  communicationUrl: string;
};
export type TaxiDraft = {
  departure: string;
  destination: string;
  date: string;
  time: string;
  capacity: number;
};
export type DeliveryDraft = {
  restaurantName: string;
  pickupLocation: string;
  date: string;
  time: string;
  capacity: number;
  orderGuide: string;
};

/** Both type drafts stay in memory; only the active one is submitted (Q-DRAFT). */
export type PostDraft = {
  type: PostType;
  common: CommonDraft;
  taxi: TaxiDraft;
  delivery: DeliveryDraft;
};

export type FieldName =
  | "title"
  | "description"
  | "communicationUrl"
  | "departure"
  | "destination"
  | "restaurantName"
  | "pickupLocation"
  | "orderGuide"
  | "date"
  | "time"
  | "capacity";

export type FieldErrors = Partial<Record<FieldName, string>>;

/** Order used to focus the first invalid field. */
export const FIELD_ORDER: FieldName[] = [
  "title",
  "departure",
  "destination",
  "restaurantName",
  "pickupLocation",
  "date",
  "time",
  "capacity",
  "orderGuide",
  "description",
  "communicationUrl",
];

type CommonRequest = {
  title: string;
  description: string;
  communicationUrl: string | null;
};

/** Screen-side request; the adapter maps referenceTime to the DTO time field. */
export type PostRequest =
  | (CommonRequest & {
      type: "TAXI";
      departure: string;
      destination: string;
      referenceTime: string;
      capacity: number;
    })
  | (CommonRequest & {
      type: "DELIVERY";
      restaurantName: string;
      pickupLocation: string;
      referenceTime: string;
      capacity: number;
      orderGuide: string | null;
    });

/** Editable post as loaded for the edit screen. */
export type EditablePost = {
  id: string;
  status: PostStatus;
  isAuthor: boolean;
  /** JOINED participants other than the author. */
  otherJoinedCount: number;
  currentMemberCount: number;
  draft: PostDraft;
};

export type EditAccess =
  | { editable: false; reason: string }
  | { editable: true; coreLocked: boolean; reason: string | null };

const codePoints = (value: string) => Array.from(value).length;

/** NFC then trim both ends; inner spaces and line breaks are kept (Q-LENGTH). */
export function normalizeText(value: string): string {
  return value.normalize("NFC").trim();
}

const SEOUL_PARTS = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Splits an instant into Asia/Seoul `YYYY-MM-DD` and `HH:mm`. */
export function toSeoulParts(ms: number): { date: string; time: string } {
  const parts = Object.fromEntries(
    SEOUL_PARTS.formatToParts(ms).map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

/** Seoul has no daylight saving, so a fixed +09:00 offset is exact. */
export function toReferenceTime(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    return null;
  }
  const iso = `${date}T${time}:00+09:00`;
  const ms = Date.parse(iso);
  // Reject dates the engine rolls over, e.g. 2026-02-30.
  if (!Number.isFinite(ms) || toSeoulParts(ms).date !== date) return null;
  return iso;
}

export function emptyDraft(nowMs: number, type: PostType = "TAXI"): PostDraft {
  const { date } = toSeoulParts(nowMs);
  return {
    type,
    common: { title: "", description: "", communicationUrl: "" },
    taxi: { departure: "", destination: "", date, time: "", capacity: 4 },
    delivery: {
      restaurantName: "",
      pickupLocation: "",
      date,
      time: "",
      capacity: 4,
      orderGuide: "",
    },
  };
}

/** Picks 을/를 or 은/는 from the last syllable's final consonant. */
function particle(label: string, pair: "을를" | "은는") {
  const code = label.charCodeAt(label.length - 1) - 0xac00;
  const final = code >= 0 && code <= 11171 && code % 28 !== 0;
  return `${label}${final ? pair[0] : pair[1]}`;
}

function required(value: string, label: string, max: number) {
  const length = codePoints(normalizeText(value));
  if (length === 0) return `${particle(label, "을를")} 입력해 주세요.`;
  if (length > max) {
    return `${particle(label, "은는")} ${max}자 이하로 입력해 주세요.`;
  }
  return undefined;
}

function optional(value: string, label: string, max: number) {
  return codePoints(normalizeText(value)) > max
    ? `${particle(label, "은는")} ${max}자 이하로 입력해 주세요.`
    : undefined;
}

export function urlError(value: string): string | undefined {
  const url = value.trim();
  if (url === "") return undefined;
  if (codePoints(url) > LIMITS.communicationUrl) {
    return `링크는 ${LIMITS.communicationUrl}자 이하로 입력해 주세요.`;
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:" && parsed.hostname !== "") {
      return undefined;
    }
  } catch {
    // fall through
  }
  return "https://로 시작하는 올바른 링크를 입력해 주세요.";
}

/** Characters used, for the counter next to a field. */
export function usedLength(value: string): number {
  return codePoints(normalizeText(value));
}

export type ValidateOptions = {
  nowMs: number;
  /** Skip place/time/capacity checks when they are locked and unchanged. */
  coreLocked?: boolean;
  /** Original reference time on edit; an unchanged time is not re-checked. */
  originalReferenceTime?: string;
};

export function validateDraft(
  draft: PostDraft,
  { nowMs, coreLocked = false, originalReferenceTime }: ValidateOptions,
): FieldErrors {
  const errors: FieldErrors = {
    title: required(draft.common.title, "제목", LIMITS.title),
    description: required(
      draft.common.description,
      "전할 말",
      LIMITS.description,
    ),
    communicationUrl: urlError(draft.common.communicationUrl),
  };
  const taxi = draft.type === "TAXI";
  if (taxi) {
    errors.departure = required(draft.taxi.departure, "출발지", LIMITS.place);
    errors.destination = required(
      draft.taxi.destination,
      "도착지",
      LIMITS.place,
    );
  } else {
    errors.restaurantName = required(
      draft.delivery.restaurantName,
      "음식점명",
      LIMITS.place,
    );
    errors.pickupLocation = required(
      draft.delivery.pickupLocation,
      "수령 장소",
      LIMITS.place,
    );
    errors.orderGuide = optional(
      draft.delivery.orderGuide,
      "주문 안내",
      LIMITS.orderGuide,
    );
  }

  if (!coreLocked) {
    const active = taxi ? draft.taxi : draft.delivery;
    const label = taxi ? "출발" : "주문 마감";
    const { min, max } = CAPACITY[draft.type];
    if (
      !Number.isInteger(active.capacity) ||
      active.capacity < min ||
      active.capacity > max
    ) {
      errors.capacity = `정원은 작성자 포함 ${min}~${max}명으로 정해 주세요.`;
    }
    if (active.date === "") {
      errors.date = `${label} 날짜를 선택해 주세요.`;
    } else if (active.time === "") {
      errors.time = `${label} 시간을 선택해 주세요.`;
    } else {
      const reference = toReferenceTime(active.date, active.time);
      if (!reference) {
        errors.date = `${label} 날짜와 시간을 다시 확인해 주세요.`;
      } else if (
        reference !== originalReferenceTime &&
        Date.parse(reference) - nowMs <= MIN_LEAD_MS
      ) {
        // Exactly 10 minutes ahead is still too close (AC-POST-002-05).
        errors.time = `${label} 시각은 지금부터 10분이 넘게 남은 시각으로 정해 주세요.`;
      }
    }
  }

  return Object.fromEntries(
    Object.entries(errors).filter(([, message]) => message),
  ) as FieldErrors;
}

/** Builds the request from the active type only; the other draft is never sent. */
export function toPostRequest(draft: PostDraft): PostRequest {
  const common = {
    title: normalizeText(draft.common.title),
    description: normalizeText(draft.common.description),
    communicationUrl: draft.common.communicationUrl.trim() || null,
  };
  if (draft.type === "TAXI") {
    return {
      ...common,
      type: "TAXI",
      departure: normalizeText(draft.taxi.departure),
      destination: normalizeText(draft.taxi.destination),
      referenceTime: toReferenceTime(draft.taxi.date, draft.taxi.time) ?? "",
      capacity: draft.taxi.capacity,
    };
  }
  return {
    ...common,
    type: "DELIVERY",
    restaurantName: normalizeText(draft.delivery.restaurantName),
    pickupLocation: normalizeText(draft.delivery.pickupLocation),
    referenceTime:
      toReferenceTime(draft.delivery.date, draft.delivery.time) ?? "",
    capacity: draft.delivery.capacity,
    orderGuide: normalizeText(draft.delivery.orderGuide) || null,
  };
}

/**
 * Edit rules: only the author, never after CANCELLED/FINISHED/REMOVED.
 * Places, time and capacity lock once someone else joined, or on CLOSED (p.44).
 */
export function editAccess(post: EditablePost): EditAccess {
  if (!post.isAuthor) {
    return {
      editable: false,
      reason: "본인이 작성한 모집만 수정할 수 있어요.",
    };
  }
  if (post.status === "CANCELLED") {
    return { editable: false, reason: "취소된 모집은 수정할 수 없어요." };
  }
  if (post.status === "FINISHED") {
    return { editable: false, reason: "완료된 모집은 수정할 수 없어요." };
  }
  if (post.status === "REMOVED") {
    return { editable: false, reason: "삭제된 모집은 수정할 수 없어요." };
  }
  if (post.otherJoinedCount > 0) {
    return {
      editable: true,
      coreLocked: true,
      reason:
        "참여한 학생이 있어 장소·시각·정원은 바꿀 수 없어요. 제목·전할 말·링크만 수정할 수 있어요.",
    };
  }
  if (post.status === "CLOSED") {
    return {
      editable: true,
      coreLocked: true,
      reason:
        "마감한 모집은 장소·시각·정원을 바꿀 수 없어요. 제목·전할 말·링크만 수정할 수 있어요.",
    };
  }
  return { editable: true, coreLocked: false, reason: null };
}

/** Edit request: locked core fields are left out so the server keeps them. */
export function toUpdateRequest(
  draft: PostDraft,
  coreLocked: boolean,
): Partial<PostRequest> {
  const request = toPostRequest(draft);
  if (!coreLocked) return request;
  const { title, description, communicationUrl } = request;
  return request.type === "DELIVERY"
    ? { title, description, communicationUrl, orderGuide: request.orderGuide }
    : { title, description, communicationUrl };
}

/** Errors the adapter raises after reading the server's problem response. */
export type PostFormErrorKind =
  "invalid" | "duplicate" | "time" | "conflict" | "forbidden" | "notFound";

export class PostFormError extends Error {
  constructor(
    public readonly kind: PostFormErrorKind,
    public readonly fieldErrors: FieldErrors = {},
  ) {
    super(`모집글 요청이 거절되었습니다. (${kind})`);
    this.name = "PostFormError";
  }
}

// UI callbacks; URIs, DTOs and error codes belong to the API adapter (#18).
export type PostFormOperations = {
  /** Server-side similar search (same date/type, OPEN, ±30 min, exact match). */
  findSimilar: (request: PostRequest) => Promise<unknown>;
  /** Resolves with the created post id. */
  create: (request: PostRequest) => Promise<string>;
  load: (id: string) => Promise<EditablePost>;
  update: (id: string, request: Partial<PostRequest>) => Promise<void>;
};
