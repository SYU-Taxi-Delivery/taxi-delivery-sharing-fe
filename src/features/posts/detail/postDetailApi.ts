import type { PostDetailOperations } from "./postDetail";

export class PostDetailNotConnectedError extends Error {
  constructor() {
    super("모집 상세 연동이 아직 준비되지 않았습니다.");
    this.name = "PostDetailNotConnectedError";
  }
}

const notConnected = async (): Promise<never> => {
  throw new PostDetailNotConnectedError();
};

/**
 * Placeholder until GET /api/posts/{id}, close, cancel, participation and
 * report endpoints are agreed in #18. The adapter maps problem responses to
 * PostDetailError kinds; do not guess URIs here.
 */
export const postDetailOperations: PostDetailOperations = {
  load: notConnected,
  close: notConnected,
  cancel: notConnected,
  join: notConnected,
  leave: notConnected,
  report: notConnected,
};
