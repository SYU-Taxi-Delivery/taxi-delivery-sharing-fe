import {
  InvalidBackendResponse,
  backendGet,
  serverTimeNow,
} from "@/lib/backend";
import { PostDetailError } from "@/features/posts/detail/postDetail";
import {
  loadBackendDetail,
  postDetailOperations,
  relationOf,
} from "@/features/posts/detail/postDetailApi";
import { fromBackendSummary } from "@/features/posts/postsApi";
import type { MyHistoryOperations } from "./myHistory";

export class MyHistoryNotConnectedError extends Error {
  constructor() {
    super("내 모집 이력 연동이 아직 준비되지 않았습니다.");
    this.name = "MyHistoryNotConnectedError";
  }
}

/** Newest 50 records; the screen has no paging yet. */
const HISTORY_SIZE = 50;

type HistoryItem = {
  participationStatus?: unknown;
  post?: { postId?: unknown; isRemoved?: unknown };
};

/**
 * Participated tab: GET /api/users/me/participations. Its post summary has no
 * places, counts or joinable, so each post's detail is read as well. The
 * created tab has no backend API yet.
 */
export const myHistoryOperations: MyHistoryOperations = {
  list: async (tab) => {
    if (tab === "created") throw new MyHistoryNotConnectedError();
    const { data, evaluatedAt } = await backendGet<{ items?: unknown }>(
      `/api/users/me/participations?page=0&size=${HISTORY_SIZE}`,
    );
    const clocks = [serverTimeNow(evaluatedAt)];
    if (!Array.isArray(data?.items)) throw new InvalidBackendResponse();
    const content = await Promise.all(
      (data.items as HistoryItem[]).map(async (item) => {
        const id = item?.post?.postId;
        const relation = item?.participationStatus;
        if (item?.post?.isRemoved === true) {
          return { id, status: "REMOVED", relation };
        }
        if (typeof id !== "string") throw new InvalidBackendResponse();
        try {
          const { detail, evaluatedAt: detailTime } =
            await loadBackendDetail(id);
          clocks.push(serverTimeNow(detailTime));
          return {
            ...(fromBackendSummary(detail) as object),
            relation: relationOf(detail),
          };
        } catch (error) {
          // Removed after the list was read.
          if (error instanceof PostDetailError && error.kind === "notFound") {
            return { id, status: "REMOVED", relation };
          }
          throw error;
        }
      }),
    );
    return {
      content,
      serverTime: new Date(
        Math.max(...clocks.map((now) => now())),
      ).toISOString(),
    };
  },
  leave: postDetailOperations.leave,
};
