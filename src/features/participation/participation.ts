export type ParticipationStatus =
  "OPEN" | "FULL" | "CLOSED" | "CANCELLED" | "FINISHED" | "REMOVED";

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
