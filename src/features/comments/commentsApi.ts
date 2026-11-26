import { ApiError } from "@/lib/api";
import {
  backendGet,
  backendSend,
  backendSendData,
  errorCode,
  InvalidBackendResponse,
} from "@/lib/backend";
import { CommentsError, toComments, type CommentsOperations } from "./comments";

const path = (postId: string) =>
  `/api/posts/${encodeURIComponent(postId)}/comments`;

function fromBackendComment(value: unknown): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return value;
  const raw = value as Record<string, unknown>;
  if (raw.isDeleted === true) return { isDeleted: true };
  return {
    id: raw.commentId,
    authorName: raw.authorName,
    content: raw.content,
    createdAt: raw.createdAt,
    isMine: raw.isMine,
  };
}

function toCommentError(error: unknown): unknown {
  if (!(error instanceof ApiError)) return error;
  const code = errorCode(error);
  if (
    error.status === 405 ||
    (error.status === 404 && (code === "API_NOT_FOUND" || code === null))
  ) {
    return new CommentsError("notConnected");
  }
  if (
    (error.status === 404 && code === "POST_NOT_FOUND") ||
    (error.status === 400 && code === "INVALID_POST_ID")
  ) {
    return new CommentsError("notFound");
  }
  if (error.status === 403 && code === "COMMENT_FORBIDDEN")
    return new CommentsError("forbidden");
  if (error.status === 409 && code === "COMMENT_CLOSED")
    return new CommentsError("closed");
  if (
    error.status === 400 &&
    (code === "INVALID_COMMENT" ||
      code === "INVALID_COMMENT_ID" ||
      code === "INVALID_REQUEST")
  ) {
    return new CommentsError("invalid");
  }
  return error;
}

export const commentApiOperations: CommentsOperations = {
  async list(postId) {
    try {
      const { data } = await backendGet<{ content?: unknown }>(path(postId));
      if (!Array.isArray(data?.content)) throw new CommentsError("invalid");
      return { content: data.content.map(fromBackendComment) };
    } catch (error) {
      throw toCommentError(error);
    }
  },

  async create(postId, content) {
    try {
      const { data } = await backendSendData<unknown>("POST", path(postId), {
        content,
      });
      // A malformed success response leaves the result uncertain. The UI
      // reloads the list to confirm it before allowing another submission.
      try {
        const saved = toComments({ content: [fromBackendComment(data)] });
        if (saved.length !== 1) throw new InvalidBackendResponse();
      } catch {
        throw new CommentsError("unknownOutcome");
      }
    } catch (error) {
      throw toCommentError(error);
    }
  },

  async remove(postId, commentId) {
    try {
      const data = await backendSend(
        "DELETE",
        `${path(postId)}/${encodeURIComponent(commentId)}`,
      );
      if (data !== undefined) throw new InvalidBackendResponse();
    } catch (error) {
      // A retry after a lost DELETE response may find the comment already gone.
      if (
        error instanceof ApiError &&
        error.status === 404 &&
        errorCode(error) === "COMMENT_NOT_FOUND"
      ) {
        return;
      }
      throw toCommentError(error);
    }
  },
};
