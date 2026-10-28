import type { ParticipationSnapshot } from "@/features/participation/participation";
import { toPostSummaries, type PostSummary } from "@/features/posts/posts";

export type MyTab = "participated" | "created";
export type MyRelation = "AUTHOR" | "JOINED" | "CANCELLED";

type MyHistoryPost = PostSummary & {
  status: Exclude<PostSummary["status"], "REMOVED">;
  relation: MyRelation;
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
      return { ...post, status: post.status, relation };
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
  };
}
