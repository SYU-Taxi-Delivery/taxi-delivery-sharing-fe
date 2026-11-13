export type ParticipationStatus =
  "OPEN" | "FULL" | "CLOSED" | "CANCELLED" | "FINISHED" | "REMOVED";

/**
 * Public recruitment status the server computes with one rule for every post
 * shape (list, detail, participation, history, my posts). The viewer's own
 * relation is separate (ViewerRelation).
 */
export const RECRUITMENT_STATUSES = [
  "RECRUITING",
  "FULL",
  "CLOSED",
  "APPLICATION_CLOSED",
  "CANCELLED",
  "FINISHED",
  "REMOVED",
] as const;
export type RecruitmentStatus = (typeof RECRUITMENT_STATUSES)[number];

/** A known server value, or undefined (older servers do not send it). */
export function toRecruitmentStatus(
  value: unknown,
): RecruitmentStatus | undefined {
  return RECRUITMENT_STATUSES.includes(value as RecruitmentStatus)
    ? (value as RecruitmentStatus)
    : undefined;
}

export type ViewerRelation =
  "GUEST" | "AUTHOR" | "NONE" | "JOINED" | "CANCELLED";

export type ParticipationSnapshot = {
  postId: string;
  type: "TAXI" | "DELIVERY";
  title: string;
  status: ParticipationStatus;
  referenceTime: string;
  serverTime: string;
  currentMemberCount: number;
  capacity: number;
  viewerRelation: ViewerRelation;
  joinable: boolean;
  /** Server join/cancel cutoff (ISO with offset); T-10 is assumed when absent. */
  participationDeadline?: string;
  /** Server public status; absent from older servers. */
  recruitmentStatus?: RecruitmentStatus;
  participantNames?: readonly string[];
  communicationUrl?: string;
};

const FALLBACK_CUTOFF_MS = 10 * 60 * 1000;
const offsetInstant = /(?:Z|[+-]\d{2}:\d{2})$/i;

type DeadlineSource = { referenceTime: string; participationDeadline?: string };

/** The server's join/cancel cutoff; falls back to T-10 when it is missing or invalid. */
export function participationDeadlineMs(source: DeadlineSource): number {
  const server = source.participationDeadline;
  const serverMs =
    server && offsetInstant.test(server) ? Date.parse(server) : Number.NaN;
  return Number.isFinite(serverMs)
    ? serverMs
    : Date.parse(source.referenceTime) - FALLBACK_CUTOFF_MS;
}

/** Minutes between the cutoff and the reference time, for help text. */
export function cutoffMinutes(source: DeadlineSource): number {
  return Math.round(
    (Date.parse(source.referenceTime) - participationDeadlineMs(source)) /
      60_000,
  );
}

/**
 * The server's recruitment status moved on by the clock: the value was true at
 * evaluatedAt, so a post can since have reached its cutoff or start time.
 * Returns undefined without a server value; callers then keep their own
 * derivation from status, joinable and counts.
 */
export function recruitmentStatusAt(
  source: DeadlineSource & { recruitmentStatus?: RecruitmentStatus },
  nowMs: number,
): RecruitmentStatus | undefined {
  const server = source.recruitmentStatus;
  if (!server || !Number.isFinite(nowMs)) return server;
  const running =
    server === "RECRUITING" ||
    server === "FULL" ||
    server === "CLOSED" ||
    server === "APPLICATION_CLOSED";
  if (running && nowMs >= Date.parse(source.referenceTime)) return "FINISHED";
  if (
    (server === "RECRUITING" || server === "FULL") &&
    nowMs >= participationDeadlineMs(source)
  )
    return "APPLICATION_CLOSED";
  return server;
}

/** Codes of a 409 join/cancel refusal the screen explains in its own words. */
export const REJECTION_MESSAGES: Record<string, string> = {
  POST_FULL: "방금 정원이 찼어요.",
  JOIN_TIME_CLOSED: "신청 기한이 지났어요.",
  CANCEL_TIME_CLOSED: "신청 기한이 지났어요.",
  POST_CLOSED: "작성자가 모집을 마감했어요.",
  POST_CANCELLED: "모집이 취소됐어요.",
  POST_FINISHED: "일정이 끝났어요.",
};

/** The post's latest public state sent with a refusal (`error.details.post`). */
export type LatestPublicState = Partial<
  Pick<
    ParticipationSnapshot,
    | "status"
    | "recruitmentStatus"
    | "referenceTime"
    | "participationDeadline"
    | "capacity"
    | "currentMemberCount"
    | "joinable"
  >
>;

/**
 * A join/cancel the server refused with a known reason. `latest` lets the
 * screen update counts and status without another request.
 */
export class ParticipationRejected extends Error {
  constructor(
    public readonly code: string,
    public readonly latest?: LatestPublicState,
  ) {
    super(REJECTION_MESSAGES[code] ?? "참여 요청이 거절되었습니다.");
    this.name = "ParticipationRejected";
  }
}

/** Applies a refusal's public state; the viewer's relation is left as it was. */
export function withLatestState(
  snapshot: ParticipationSnapshot,
  latest: LatestPublicState,
): ParticipationSnapshot {
  const next = { ...snapshot };
  for (const [key, value] of Object.entries(latest)) {
    if (value !== undefined) (next as Record<string, unknown>)[key] = value;
  }
  if (next.currentMemberCount > next.capacity) return snapshot;
  return next;
}

export function getParticipationAvailability(
  snapshot: ParticipationSnapshot,
  nowMs: number,
): {
  action: "join" | "rejoin" | "cancel" | null;
  reason: string | null;
  deadline: number;
} {
  const deadline = participationDeadlineMs(snapshot);
  const unavailable = { action: null, reason: null, deadline };
  const hasTimezone = /(?:Z|[+-]\d{2}:\d{2})$/i;

  if (
    !hasTimezone.test(snapshot.referenceTime) ||
    !hasTimezone.test(snapshot.serverTime) ||
    !Number.isFinite(deadline) ||
    !Number.isFinite(Date.parse(snapshot.serverTime)) ||
    !Number.isFinite(nowMs) ||
    (snapshot.type !== "TAXI" && snapshot.type !== "DELIVERY") ||
    !Number.isInteger(snapshot.capacity) ||
    snapshot.capacity < 2 ||
    snapshot.capacity > (snapshot.type === "TAXI" ? 4 : 10) ||
    !Number.isInteger(snapshot.currentMemberCount) ||
    snapshot.currentMemberCount < 1 ||
    snapshot.currentMemberCount > snapshot.capacity ||
    (snapshot.viewerRelation === "JOINED" && snapshot.currentMemberCount < 2)
  ) {
    return {
      ...unavailable,
      reason: "모집 정보를 확인할 수 없습니다. 다시 조회해 주세요.",
    };
  }

  if (snapshot.viewerRelation === "GUEST") {
    return { ...unavailable, reason: "로그인 후 참여할 수 있습니다." };
  }
  if (snapshot.viewerRelation === "AUTHOR") {
    return {
      ...unavailable,
      reason: "작성자는 본인 모집에 참여할 수 없습니다.",
    };
  }
  if (snapshot.status === "REMOVED") {
    return { ...unavailable, reason: "삭제된 모집입니다." };
  }
  if (snapshot.status === "CANCELLED") {
    return { ...unavailable, reason: "취소된 모집입니다." };
  }
  if (snapshot.status === "FINISHED") {
    return { ...unavailable, reason: "완료된 모집입니다." };
  }
  if (!(["OPEN", "FULL", "CLOSED"] as const).includes(snapshot.status)) {
    return {
      ...unavailable,
      reason: "모집 정보를 확인할 수 없습니다. 다시 조회해 주세요.",
    };
  }
  if (nowMs >= Date.parse(snapshot.referenceTime)) {
    return { ...unavailable, reason: "완료된 모집입니다." };
  }
  if (nowMs >= deadline) {
    return {
      ...unavailable,
      reason: `${snapshot.type === "TAXI" ? "출발" : "주문 마감"} ${cutoffMinutes(snapshot)}분 전부터 참여 신청과 취소가 마감됩니다.`,
    };
  }
  if (snapshot.viewerRelation === "JOINED") {
    return { action: "cancel", reason: null, deadline };
  }
  if (snapshot.status === "CLOSED") {
    return { ...unavailable, reason: "작성자가 모집을 마감했습니다." };
  }
  if (
    snapshot.status === "FULL" ||
    snapshot.currentMemberCount === snapshot.capacity
  ) {
    return { ...unavailable, reason: "모집 정원이 마감되었습니다." };
  }
  if (!snapshot.joinable) {
    return {
      ...unavailable,
      reason: "현재 참여할 수 없습니다. 최신 모집 정보를 확인해 주세요.",
    };
  }
  if (
    snapshot.viewerRelation === "NONE" ||
    snapshot.viewerRelation === "CANCELLED"
  ) {
    return {
      action: snapshot.viewerRelation === "CANCELLED" ? "rejoin" : "join",
      reason: null,
      deadline,
    };
  }
  return {
    ...unavailable,
    reason: "참여 정보를 확인할 수 없습니다. 다시 조회해 주세요.",
  };
}

export function hideUnavailableDetails(
  snapshot: ParticipationSnapshot,
  nowMs = Date.parse(snapshot.serverTime),
): ParticipationSnapshot {
  const visible = { ...snapshot };
  const hasAccess =
    snapshot.viewerRelation === "AUTHOR" ||
    snapshot.viewerRelation === "JOINED";
  const isActive =
    snapshot.status === "OPEN" ||
    snapshot.status === "FULL" ||
    snapshot.status === "CLOSED";

  if (!hasAccess || (!isActive && snapshot.status !== "FINISHED")) {
    delete visible.participantNames;
  }
  if (
    !hasAccess ||
    !isActive ||
    !Number.isFinite(nowMs) ||
    !Number.isFinite(Date.parse(snapshot.referenceTime)) ||
    nowMs >= Date.parse(snapshot.referenceTime)
  ) {
    delete visible.communicationUrl;
  }
  return visible;
}
