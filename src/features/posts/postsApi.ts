import { InvalidBackendResponse, backendGet } from "@/lib/backend";
import { cleanSearch, PAGE_SIZE, type PostListOperations } from "./posts";
import { timeRange } from "./search";

export class PostsNotConnectedError extends Error {
  constructor() {
    super("모집 목록 연동이 아직 준비되지 않았습니다.");
    this.name = "PostsNotConnectedError";
  }
}

/** Backend list item → the shape toPostSummary validates. */
export function fromBackendSummary(value: unknown): unknown {
  if (typeof value !== "object" || value === null) return value;
  const { postId, postStatus, author, ...rest } = value as Record<
    string,
    unknown
  >;
  const displayName = (author as { displayName?: unknown } | null | undefined)
    ?.displayName;
  return {
    ...rest,
    id: postId,
    status: postStatus,
    ...(rest.authorName === undefined && typeof displayName === "string"
      ? { authorName: displayName }
      : {}),
  };
}

/**
 * GET /api/posts. Without a status the backend returns active OPEN/FULL posts.
 * "참여 가능" asks the server for joinable=true (OPEN, seats left, before the
 * cutoff); status=OPEN is sent too so an older server without the joinable
 * filter still leaves out full and closed posts.
 */
export const postListOperations: PostListOperations = {
  list: async (query) => {
    const search = cleanSearch(query);
    const { type, joinableOnly, page } = search;
    const params = new URLSearchParams({
      page: String(page),
      size: String(PAGE_SIZE),
    });
    if (type !== "ALL") params.set("type", type);
    if (joinableOnly) {
      params.set("joinable", "true");
      params.set("status", "OPEN");
    }
    // Place matching (spaces, case, "역") and direction are the server's.
    for (const key of [
      "q",
      "departure",
      "destination",
      "restaurant",
      "pickup",
      "direction",
    ] as const) {
      if (search[key]) params.set(key, search[key]);
    }
    const { from, to } = timeRange(search, Date.now());
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (search.sort === "RECENT") params.set("sort", "RECENT");
    const { data } = await backendGet<Record<string, unknown>>(
      `/api/posts?${params}`,
    );
    if (typeof data !== "object" || data === null || !Array.isArray(data.items))
      throw new InvalidBackendResponse();
    return {
      content: data.items.map(fromBackendSummary),
      totalElements: data.totalElements,
      totalPages: data.totalPages,
      number: data.page,
      size: data.size,
    };
  },
};
