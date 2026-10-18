import {
  hideUnavailableDetails,
  type ParticipationSnapshot,
} from "@/features/participation/participation";
import type { PostStatus } from "../posts";

/** The signed-in viewer's relation to the post, decided by the server. */
export type DetailRelation = "AUTHOR" | "JOINED" | "CANCELLED" | "NONE";

type DetailBase = {
  id: string;
  title: string;
  description: string;
  status: PostStatus;
  referenceTime: string;
  /** Server time of this response; drives the T-10 and T boundaries. */
  serverTime: string;
  createdAt?: string;
  capacity: number;
  /** Includes the author. */
  currentMemberCount: number;
  joinable: boolean;
  relation: DetailRelation;
  authorName: string;
  /** Display names, author first. Only sent to the author and JOINED members. */
  participantNames?: string[];
  communicationUrl?: string;
  /** The viewer already reported this post (REPORT-002). */
  reported: boolean;
};

/** Screen model for the detail page. Not a server DTO; the adapter maps into it. */
export type PostDetail =
  | (DetailBase & { type: "TAXI"; departure: string; destination: string })
  | (DetailBase & {
      type: "DELIVERY";
      restaurantName: string;
      pickupLocation: string;
      orderGuide?: string;
    });

export const REPORT_REASONS = [
  { value: "INAPPROPRIATE", label: "부적절한 내용" },
  { value: "AD_PROMOTION", label: "광고·홍보" },
  { value: "ABUSE", label: "욕설·비방" },
  { value: "FALSE_RECRUITMENT", label: "허위 모집" },
  { value: "OTHER", label: "기타" },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]["value"];
export type ReportRequest = { reason: ReportReason; detail: string | null };
export const REPORT_DETAIL_MAX = 500;

/** Errors the adapter raises after reading the server's problem response. */
export type PostDetailErrorKind =
  | "notFound"
  | "forbidden"
  | "conflict"
  | "duplicateReport"
  | "ownPost"
  | "invalid";

export class PostDetailError extends Error {
  constructor(public readonly kind: PostDetailErrorKind) {
    super(`모집 요청이 거절되었습니다. (${kind})`);
    this.name = "PostDetailError";
  }
}

// UI callbacks; URIs, DTOs and error codes belong to the API adapter (#18).
export type PostDetailOperations = {
  load: (id: string) => Promise<unknown>;
  /** OPEN/FULL → CLOSED by the author. */
  close: (id: string) => Promise<void>;
  /** OPEN/FULL/CLOSED → CANCELLED by the author; JOINED members are cancelled too. */
  cancel: (id: string) => Promise<void>;
  join: (id: string) => Promise<void>;
  leave: (id: string) => Promise<void>;
  report: (id: string, request: ReportRequest) => Promise<void>;
};

const STATUSES: readonly PostStatus[] = [
  "OPEN",
  "FULL",
  "CLOSED",
  "CANCELLED",
  "FINISHED",
  "REMOVED",
];
const RELATIONS: readonly DetailRelation[] = [
  "AUTHOR",
  "JOINED",
  "CANCELLED",
  "NONE",
];
const hasTimezone = /(?:Z|[+-]\d{2}:\d{2})$/i;

class InvalidPostDetail extends Error {
  constructor() {
    super("모집 상세 정보를 확인할 수 없습니다.");
    this.name = "InvalidPostDetail";
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

/**
 * Validates the response and keeps only known fields, so unexpected data such
 * as another user's email or phone number never reaches the screen.
 */
export function toPostDetail(value: unknown): PostDetail {
  if (typeof value !== "object" || value === null)
    throw new InvalidPostDetail();
  const raw = value as Record<string, unknown>;
  const id =
    text(raw.id) ??
    (Number.isSafeInteger(raw.id) && (raw.id as number) > 0
      ? String(raw.id)
      : null);
  const type = raw.type;
  const status = raw.status as PostStatus;
  const relation = raw.relation as DetailRelation;
  const referenceTime = instant(raw.referenceTime);
  const serverTime = instant(raw.serverTime);
  const capacity = raw.capacity as number;
  const current = raw.currentMemberCount as number;
  const max = type === "TAXI" ? 4 : 10;
  if (
    !id ||
    (type !== "TAXI" && type !== "DELIVERY") ||
    !STATUSES.includes(status) ||
    !RELATIONS.includes(relation) ||
    !referenceTime ||
    !serverTime ||
    !Number.isSafeInteger(capacity) ||
    capacity < 2 ||
    capacity > max ||
    !Number.isSafeInteger(current) ||
    current < 1 ||
    current > capacity ||
    typeof raw.joinable !== "boolean" ||
    !text(raw.title) ||
    typeof raw.description !== "string" ||
    !text(raw.authorName)
  ) {
    throw new InvalidPostDetail();
  }
  const names = Array.isArray(raw.participantNames)
    ? raw.participantNames.map(text)
    : undefined;
  if (names && names.some((name) => name === null))
    throw new InvalidPostDetail();
  const url = text(raw.communicationUrl);
  const base: DetailBase = {
    id,
    title: text(raw.title)!,
    description: raw.description,
    status,
    referenceTime,
    serverTime,
    ...(instant(raw.createdAt) ? { createdAt: instant(raw.createdAt)! } : {}),
    capacity,
    currentMemberCount: current,
    joinable: raw.joinable,
    relation,
    authorName: text(raw.authorName)!,
    ...(names ? { participantNames: names as string[] } : {}),
    // Only https links are ever rendered as a link.
    ...(url && /^https:\/\//i.test(url) ? { communicationUrl: url } : {}),
    reported: raw.reported === true,
  };
  if (type === "TAXI") {
    const departure = text(raw.departure);
    const destination = text(raw.destination);
    if (!departure || !destination) throw new InvalidPostDetail();
    return { ...base, type, departure, destination };
  }
  const restaurantName = text(raw.restaurantName);
  const pickupLocation = text(raw.pickupLocation);
  if (!restaurantName || !pickupLocation) throw new InvalidPostDetail();
  return {
    ...base,
    type,
    restaurantName,
    pickupLocation,
    ...(text(raw.orderGuide) ? { orderGuide: text(raw.orderGuide)! } : {}),
  };
}

/** Snapshot for the #9 participation panel; it applies the same visibility rules. */
export function toSnapshot(detail: PostDetail): ParticipationSnapshot {
  return hideUnavailableDetails({
    postId: detail.id,
    type: detail.type,
    title: detail.title,
    status: detail.status,
    referenceTime: detail.referenceTime,
    serverTime: detail.serverTime,
    currentMemberCount: detail.currentMemberCount,
    capacity: detail.capacity,
    viewerRelation: detail.relation,
    joinable: detail.joinable,
    participantNames: detail.participantNames,
    communicationUrl: detail.communicationUrl,
  });
}

/**
 * Names for the author/JOINED (also after FINISHED) and the link only while
 * OPEN/FULL/CLOSED before T, whatever the server sent (AC-DISC-004-01~04).
 */
export function visibleDetails(
  detail: PostDetail,
  nowMs: number,
): { participantNames?: string[]; communicationUrl?: string } {
  const { participantNames, communicationUrl } = toSnapshot({
    ...detail,
    serverTime: new Date(nowMs).toISOString(),
  });
  return {
    ...(participantNames ? { participantNames: [...participantNames] } : {}),
    ...(communicationUrl && Date.parse(detail.referenceTime) > nowMs
      ? { communicationUrl }
      : {}),
  };
}

/** Effective status: an active post past its reference time is finished. */
export function effectiveStatus(detail: PostDetail, nowMs: number): PostStatus {
  const active = ["OPEN", "FULL", "CLOSED"].includes(detail.status);
  return active && nowMs >= Date.parse(detail.referenceTime)
    ? "FINISHED"
    : detail.status;
}

export type AuthorActions = {
  edit: boolean;
  close: boolean;
  cancel: boolean;
};

/** Author management; T-10 does not apply, only the reference time T (POST-005/006). */
export function authorActions(
  detail: PostDetail,
  nowMs: number,
): AuthorActions {
  if (detail.relation !== "AUTHOR") {
    return { edit: false, close: false, cancel: false };
  }
  const status = effectiveStatus(detail, nowMs);
  const active = status === "OPEN" || status === "FULL" || status === "CLOSED";
  return {
    edit: active,
    close: status === "OPEN" || status === "FULL",
    cancel: active,
  };
}

/** Other users may report OPEN/FULL/CLOSED/CANCELLED/FINISHED posts once. */
export function canReport(detail: PostDetail): boolean {
  return (
    detail.relation !== "AUTHOR" &&
    detail.status !== "REMOVED" &&
    !detail.reported
  );
}

/** NFC, trim both ends, count code points; blank means no detail (AC-REPORT-001-10). */
export function normalizeReportDetail(value: string): string {
  return value.normalize("NFC").trim();
}

export function reportDetailError(value: string): string | undefined {
  return Array.from(normalizeReportDetail(value)).length > REPORT_DETAIL_MAX
    ? `상세 내용은 ${REPORT_DETAIL_MAX}자 이하로 입력해 주세요.`
    : undefined;
}
