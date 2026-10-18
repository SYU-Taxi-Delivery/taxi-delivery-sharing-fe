import type { PostListOperations } from "./posts";

export class PostsNotConnectedError extends Error {
  constructor() {
    super("모집 목록 연동이 아직 준비되지 않았습니다.");
    this.name = "PostsNotConnectedError";
  }
}

/**
 * Placeholder until GET /api/posts filters, paging and DTO are agreed in #18.
 * Replace with an apiFetch-based adapter that maps the DTO into PostPage.
 */
export const postListOperations: PostListOperations = {
  list: async () => {
    throw new PostsNotConnectedError();
  },
};
