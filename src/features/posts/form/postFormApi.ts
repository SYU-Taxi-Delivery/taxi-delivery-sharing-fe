import type { PostFormOperations } from "./postDraft";

export class PostFormNotConnectedError extends Error {
  constructor() {
    super("모집글 작성 연동이 아직 준비되지 않았습니다.");
    this.name = "PostFormNotConnectedError";
  }
}

const notConnected = async (): Promise<never> => {
  throw new PostFormNotConnectedError();
};

/**
 * Placeholder until POST/PATCH /api/posts and the similar search are agreed in #18.
 * The adapter maps problem responses to PostFormError kinds; do not guess URIs.
 */
export const postFormOperations: PostFormOperations = {
  findSimilar: notConnected,
  create: notConnected,
  load: notConnected,
  update: notConnected,
};
