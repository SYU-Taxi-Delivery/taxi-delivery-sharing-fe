import type { ParticipationSnapshot } from "@/features/participation/participation";
import { toPostSummaries, type PostSummary } from "@/features/posts/posts";

export type MyTab = "participated" | "created";
export type MyRelation = "AUTHOR" | "JOINED" | "CANCELLED";

type MyHistoryPost = PostSummary & {
  status: Exclude<PostSummary["status"], "REMOVED">;
  relation: MyRelation;
  /** Sent only while I am the author or a current member of an active schedule. */
  communicationUrl?: string;
};

/** Screen model, not a server DTO; removed posts retain no original content. */
export type MyHistoryItem =
  MyHistoryPost | { id: string; status: "REMOVED"; relation: MyRelation };

export type MyHistory = {
  content: MyHistoryItem[];
  serverTime: string;
};

// UI callbacks; authentication, URIs and DTO mapping belong to the API adapter (#18).
export type MyHistoryOperations = {
  list: (tab: MyTab) => Promise<unknown>;
  leave: (id: string) => Promise<void>;
};

export class InvalidMyHistoryData extends Error {
  constructor() {
    super("내 모집 이력을 확인할 수 없습니다.");
    this.name = "InvalidMyHistoryData";
  }
}

const text = (value: unknown) =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null;
const isoInstant =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i;

/** One current relation per post; duplicate event rows are not a history list. */
export function toMyHistory(value: unknown, tab: MyTab): MyHistory {
  if (typeof value !== "object" || value === null)
    throw new InvalidMyHistoryData();
  const raw = value as Record<string, unknown>;
  const serverTime = text(raw.serverTime);
  if (
    !Array.isArray(raw.content) ||
    !serverTime ||
    !isoInstant.test(serverTime) ||
    !Number.isFinite(Date.parse(serverTime))
  ) {
    throw new InvalidMyHistoryData();
  }

  try {
    const content = raw.content.map((value): MyHistoryItem => {
      if (typeof value !== "object" || value === null)
        throw new InvalidMyHistoryData();
      const item = value as Record<string, unknown>;
      const relation = item.relation;
      if (
        (relation !== "AUTHOR" &&
          relation !== "JOINED" &&
          relation !== "CANCELLED") ||
        (tab === "created" ? relation !== "AUTHOR" : relation === "AUTHOR")
      ) {
        throw new InvalidMyHistoryData();
      }
      if (item.status === "REMOVED") {
        const id =
          text(item.id) ??
          (Number.isSafeInteger(item.id) && (item.id as number) > 0
            ? String(item.id)
            : null);
        if (!id) throw new InvalidMyHistoryData();
        return { id, status: "REMOVED", relation };
      }
      const [post] = toPostSummaries([item]);
      if (post.status === "REMOVED") throw new InvalidMyHistoryData();
      const url = text(item.communicationUrl);
      return {
        ...post,
        status: post.status,
        relation,
        // Only https links are ever rendered as a link.
        ...(url && /^https:\/\//i.test(url) && relation !== "CANCELLED"
          ? { communicationUrl: url }
          : {}),
      };
    });
    if (new Set(content.map((item) => item.id)).size !== content.length)
      throw new InvalidMyHistoryData();
    return { content, serverTime };
  } catch {
    throw new InvalidMyHistoryData();
  }
}

export function parseMyTab(value: string | string[] | undefined): MyTab {
  return (Array.isArray(value) ? value[0] : value) === "created"
    ? "created"
    : "participated";
}

/** Participation policy input; list responses never expose names or chat links. */
export function toMySnapshot(
  item: MyHistoryPost,
  serverTime: string,
): ParticipationSnapshot {
  return {
    postId: item.id,
    type: item.type,
    title:
      item.type === "TAXI"
        ? `${item.departure} → ${item.destination}`
        : item.restaurantName,
    status: item.status,
    referenceTime: item.referenceTime,
    serverTime,
    currentMemberCount: item.currentMemberCount,
    capacity: item.capacity,
    viewerRelation: item.relation,
    joinable: item.joinable,
    participationDeadline: item.participationDeadline,
    ...(item.recruitmentStatus
      ? { recruitmentStatus: item.recruitmentStatus }
      : {}),
  };
}

export type LiveMyHistoryItem = Exclude<MyHistoryItem, { status: "REMOVED" }>;

/** Why a record sits in 지난 이력, in the order the chip should win. */
export type PastReason = "REMOVED" | "LEFT" | "CANCELLED" | "FINISHED";

export const pastReasonLabel: Record<PastReason, string> = {
  REMOVED: "삭제됨",
  LEFT: "참여 취소함",
  CANCELLED: "모집 취소",
  FINISHED: "일정 종료",
};

/**
 * Upcoming = still running (OPEN/FULL/CLOSED before its reference time) and
 * still mine (author or joined). Everything else is history.
 */
export function pastReason(
  item: MyHistoryItem,
  nowMs: number,
): PastReason | null {
  if (item.status === "REMOVED") return "REMOVED";
  if (item.relation === "CANCELLED") return "LEFT";
  if (item.status === "CANCELLED") return "CANCELLED";
  if (item.status === "FINISHED" || nowMs >= Date.parse(item.referenceTime))
    return "FINISHED";
  return null;
}

/** Upcoming soonest first; history newest first, removed records last. */
export function splitMyHistory(
  content: MyHistoryItem[],
  nowMs: number,
): { upcoming: LiveMyHistoryItem[]; past: MyHistoryItem[] } {
  const upcoming: LiveMyHistoryItem[] = [];
  const past: MyHistoryItem[] = [];
  for (const item of content) {
    if (item.status !== "REMOVED" && pastReason(item, nowMs) === null)
      upcoming.push(item);
    else past.push(item);
  }
  const at = (item: MyHistoryItem) =>
    item.status === "REMOVED" ? -Infinity : Date.parse(item.referenceTime);
  upcoming.sort((a, b) => at(a) - at(b));
  // Stable sort keeps the server order among removed records.
  past.sort((a, b) => (at(b) === at(a) ? 0 : at(b) > at(a) ? 1 : -1));
  return { upcoming, past };
}
