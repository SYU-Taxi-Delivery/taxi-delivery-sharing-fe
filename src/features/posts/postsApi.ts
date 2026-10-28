import { InvalidBackendResponse, backendGet } from "@/lib/backend";
import { PAGE_SIZE, type PostListOperations } from "./posts";

export class PostsNotConnectedError extends Error {
  constructor() {
    super("모집 목록 연동이 아직 준비되지 않았습니다.");
    this.name = "PostsNotConnectedError";
  }
}

/** Backend list item → the shape toPostSummary validates. */
export function fromBackendSummary(value: unknown): unknown {
  if (typeof value !== "object" || value === null) return value;
  const { postId, postStatus, ...rest } = value as Record<string, unknown>;
  return { ...rest, id: postId, status: postStatus };
}

/**
 * GET /api/posts. Without a status the backend returns active OPEN/FULL posts.
 * There is no joinable filter, so "참여 가능한 글만" asks for OPEN only; posts
 * past the participation deadline still show as "참여 마감".
 */
export const postListOperations: PostListOperations = {
  list: async ({ type, joinableOnly, page }) => {
    const params = new URLSearchParams({
      page: String(page),
      size: String(PAGE_SIZE),
    });
    if (type !== "ALL") params.set("type", type);
    if (joinableOnly) params.set("status", "OPEN");
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
