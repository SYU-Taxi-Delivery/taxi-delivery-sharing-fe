import type { PostStatus } from "@/features/posts/posts";
import {
  REPORT_DETAIL_MAX,
  REPORT_REASONS,
  type ReportReason,
} from "@/features/posts/detail/postDetail";

export type ReportStatus = "PENDING" | "RESOLVED" | "REJECTED";
export type ReportResolution = Exclude<ReportStatus, "PENDING">;

/** Minimal moderation data. Server identity and authorization remain authoritative. */
export type AdminReportSummary = {
  id: string;
  status: ReportStatus;
  reason: ReportReason;
  createdAt: string;
  postId: string;
  postTitle: string | null;
  postStatus: PostStatus;
};

export type AdminReportDetail = AdminReportSummary & {
  detail: string | null;
  reporterId: string;
  processedAt: string | null;
  processedBy: string | null;
  postContent: string | null;
  referenceTime: string | null;
};

export type RemovalResult = {
  postId: string;
  status: "REMOVED";
  participationEffect: "CANCELLED_ACTIVE" | "PRESERVED_HISTORY";
  removedAt: string;
  removedBy: string;
};

// UI callbacks only; URI, DTOs and session transport await the backend contract.
export type AdminOperations = {
  list: () => Promise<unknown>;
  load: (id: string) => Promise<unknown>;
  process: (id: string, resolution: ReportResolution) => Promise<unknown>;
  removePost: (postId: string) => Promise<unknown>;
};

export class AdminError extends Error {
  constructor(
    readonly kind:
      | "notConnected"
      | "forbidden"
      | "notFound"
      | "conflict"
      | "invalid"
      | "unknownOutcome",
  ) {
    super(kind);
    this.name = "AdminError";
  }
}

const notConnected = async (): Promise<never> => {
  throw new AdminError("notConnected");
};

export const adminOperations: AdminOperations = {
  list: notConnected,
  load: notConnected,
  process: notConnected,
  removePost: notConnected,
};

const statuses: readonly PostStatus[] = [
  "OPEN",
  "FULL",
  "CLOSED",
  "CANCELLED",
  "FINISHED",
  "REMOVED",
];
const reportStatuses: readonly ReportStatus[] = [
  "PENDING",
  "RESOLVED",
  "REJECTED",
];
const reasons = REPORT_REASONS.map(({ value }) => value);
const isoInstant =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i;

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new AdminError("invalid");
  return value as Record<string, unknown>;
}

const text = (value: unknown) =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null;
const instant = (value: unknown) => {
  const raw = text(value);
  return raw && isoInstant.test(raw) && Number.isFinite(Date.parse(raw))
    ? raw
    : null;
};

function toReportSummary(value: unknown): AdminReportSummary {
  const raw = record(value);
  const id = text(raw.id);
  const createdAt = instant(raw.createdAt);
  const postId = text(raw.postId);
  const postStatus = raw.postStatus as PostStatus;
  const postTitle = postStatus === "REMOVED" ? null : text(raw.postTitle);
  const status = raw.status as ReportStatus;
  const reason = raw.reason as ReportReason;
  if (
    !id ||
    !createdAt ||
    !postId ||
    !statuses.includes(postStatus) ||
    (postStatus !== "REMOVED" && !postTitle) ||
    !reportStatuses.includes(status) ||
    !reasons.includes(reason)
  ) {
    throw new AdminError("invalid");
  }
  return { id, status, reason, createdAt, postId, postTitle, postStatus };
}

/** Pending reports come first; same-state ordering and pagination belong to the adapter. */
export function toReportList(value: unknown): AdminReportSummary[] {
  const raw = record(value);
  if (!Array.isArray(raw.content)) throw new AdminError("invalid");
  const reports = raw.content.map(toReportSummary);
  if (new Set(reports.map(({ id }) => id)).size !== reports.length)
    throw new AdminError("invalid");
  return [
    ...reports.filter(({ status }) => status === "PENDING"),
    ...reports.filter(({ status }) => status !== "PENDING"),
  ];
}

export function toReportDetail(value: unknown): AdminReportDetail {
  const raw = record(value);
  const summary = toReportSummary(raw);
  const reporterId = text(raw.reporterId);
  const detail = raw.detail;
  const pending = summary.status === "PENDING";
  const processedAt = pending ? null : instant(raw.processedAt);
  const processedBy = pending ? null : text(raw.processedBy);
  const removed = summary.postStatus === "REMOVED";
  const postContent = removed ? null : raw.postContent;
  const referenceTime = removed ? null : instant(raw.referenceTime);
  if (
    !reporterId ||
    (detail !== null &&
      (typeof detail !== "string" ||
        Array.from(detail.normalize("NFC")).length > REPORT_DETAIL_MAX)) ||
    (pending
      ? raw.processedAt !== null || raw.processedBy !== null
      : !processedAt || !processedBy) ||
    (!removed && (typeof postContent !== "string" || !referenceTime))
  ) {
    throw new AdminError("invalid");
  }
  return {
    ...summary,
    detail,
    reporterId,
    processedAt,
    processedBy,
    postContent: postContent as string | null,
    referenceTime,
  };
}

/** A confirmed result, never a client-side guess based on the current clock. */
export function toRemovalResult(value: unknown): RemovalResult {
  const raw = record(value);
  const postId = text(raw.postId);
  const removedAt = instant(raw.removedAt);
  const removedBy = text(raw.removedBy);
  const participationEffect = raw.participationEffect;
  if (
    !postId ||
    raw.status !== "REMOVED" ||
    !removedAt ||
    !removedBy ||
    (participationEffect !== "CANCELLED_ACTIVE" &&
      participationEffect !== "PRESERVED_HISTORY")
  ) {
    throw new AdminError("invalid");
  }
  return {
    postId,
    status: "REMOVED",
    participationEffect,
    removedAt,
    removedBy,
  };
}

export function adminErrorMessage(error: unknown): string {
  if (error instanceof AdminError) {
    switch (error.kind) {
      case "notConnected":
        return "관리자 화면 연동을 준비하고 있어요. 잠시 후 다시 이용해 주세요.";
      case "forbidden":
        return "관리자 권한을 확인할 수 없어요. 권한을 확인한 후 다시 이용해 주세요.";
      case "notFound":
        return "신고나 모집을 찾을 수 없어요. 최신 정보를 다시 불러와 주세요.";
      case "conflict":
        return "이미 처리됐거나 상태가 바뀌었어요. 최신 정보를 확인해 주세요.";
      case "invalid":
        return "관리자 화면 정보를 확인할 수 없어요. 최신 정보를 다시 불러와 주세요.";
    }
  }
  return "요청이 처리됐는지 확인하지 못했어요. 최신 정보를 불러와 결과를 확인해 주세요.";
}
