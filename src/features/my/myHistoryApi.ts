import { ApiError } from "@/lib/api";
import {
  InvalidBackendResponse,
  backendGet,
  errorCode,
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

type HistoryPost = Record<string, unknown> & {
  postId?: unknown;
  isRemoved?: unknown;
};
type HistoryItem = {
  participationStatus?: unknown;
  post?: HistoryPost;
};

/**
 * Newer servers send the whole public post in the history (places, counts,
 * author, recruitmentStatus). joinable is not part of it; it is exactly
 * RECRUITING ("OPEN, seats left, before the cutoff").
 */
function fromHistoryPost(post: HistoryPost, relation: unknown) {
  const summary = fromBackendSummary(post) as Record<string, unknown>;
  return {
    ...summary,
    joinable:
      typeof post.joinable === "boolean"
        ? post.joinable
        : post.recruitmentStatus === "RECRUITING",
    relation,
  };
}

const hasFullPost = (post: HistoryPost) =>
  typeof post.type === "string" && typeof post.recruitmentStatus === "string";

/** 404 without POST_NOT_FOUND / 405: this server has no such endpoint yet. */
const missingEndpoint = (error: unknown) =>
  error instanceof ApiError &&
  (error.status === 405 ||
    (error.status === 404 && errorCode(error) !== "POST_NOT_FOUND"));

/** 작성한 글: GET /api/users/me/posts (list items + my link while active). */
async function listCreated() {
  try {
    const { data, evaluatedAt } = await backendGet<{ items?: unknown }>(
      `/api/users/me/posts?page=0&size=${HISTORY_SIZE}`,
    );
    if (!Array.isArray(data?.items)) throw new InvalidBackendResponse();
    return {
      content: data.items.map((item) => ({
        ...(fromBackendSummary(item) as object),
        relation: "AUTHOR",
      })),
      serverTime: evaluatedAt,
    };
  } catch (error) {
    if (missingEndpoint(error)) throw new MyHistoryNotConnectedError();
    throw error;
  }
}

/**
 * Participated tab: GET /api/users/me/participations. Newer servers include
 * the post's public fields; for older ones, whose post summary has no places,
 * counts or joinable, each post's detail is read as well.
 */
export const myHistoryOperations: MyHistoryOperations = {
  list: async (tab) => {
    if (tab === "created") return listCreated();
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
        if (hasFullPost(item.post!))
          return fromHistoryPost(item.post!, relation);
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
