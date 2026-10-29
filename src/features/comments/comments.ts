import type { PostStatus } from "@/features/posts/posts";

/** Minimum screen data; ownership and deletion are enforced by the server. */
export type CommentItem = {
  id: string;
  authorName: string;
  content: string;
  createdAt: string;
  isMine: boolean;
};

// UI callbacks only; URI, authentication and DTO mapping await the API contract.
export type CommentsOperations = {
  list: (postId: string) => Promise<unknown>;
  create: (postId: string, content: string) => Promise<void>;
  remove: (postId: string, commentId: string) => Promise<void>;
};

export class CommentsError extends Error {
  constructor(
    readonly kind:
      | "notConnected"
      | "invalid"
      | "forbidden"
      | "notFound"
      | "closed"
      | "unknownOutcome",
  ) {
    super(kind);
    this.name = "CommentsError";
  }
}

const notConnected = async (): Promise<never> => {
  throw new CommentsError("notConnected");
};

export const commentsOperations: CommentsOperations = {
  list: notConnected,
  create: notConnected,
  remove: notConnected,
};

export const COMMENT_MAX = 500;

export function normalizeComment(content: string): string {
  return content.normalize("NFC").trim();
}

export function commentContentError(content: string): string | null {
  const length = Array.from(normalizeComment(content)).length;
  if (length === 0) return "댓글 내용을 입력해 주세요.";
  return length > COMMENT_MAX
    ? `댓글은 ${COMMENT_MAX}자 이내로 입력해 주세요.`
    : null;
}

const text = (value: unknown) =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null;
const isoInstant =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i;
const isInstant = (value: string) =>
  isoInstant.test(value) && Number.isFinite(Date.parse(value));

/** The adapter supplies createdAt/id ASC; opaque IDs are not sorted here. */
export function toComments(value: unknown): CommentItem[] {
  if (typeof value !== "object" || value === null)
    throw new CommentsError("invalid");
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw.content)) throw new CommentsError("invalid");

  const content: CommentItem[] = [];
  const ids = new Set<string>();
  for (const value of raw.content) {
    if (typeof value !== "object" || value === null || Array.isArray(value))
      throw new CommentsError("invalid");
    const item = value as Record<string, unknown>;
    if ("isDeleted" in item && typeof item.isDeleted !== "boolean")
      throw new CommentsError("invalid");
    if (item.isDeleted === true) continue;

    const id = text(item.id);
    const authorName = text(item.authorName);
    const body =
      typeof item.content === "string" ? normalizeComment(item.content) : null;
    const createdAt = text(item.createdAt);
    if (
      !id ||
      ids.has(id) ||
      !authorName ||
      body === null ||
      commentContentError(body) ||
      !createdAt ||
      !isInstant(createdAt) ||
      typeof item.isMine !== "boolean"
    ) {
      throw new CommentsError("invalid");
    }
    ids.add(id);
    content.push({
      id,
      authorName,
      content: body,
      createdAt,
      isMine: item.isMine,
    });
  }
  return content;
}

/** Comments remain writable after the participation cutoff, until exactly T. */
export function canWriteComment(
  status: PostStatus,
  referenceTime: string,
  nowMs: number,
): boolean {
  return (
    (status === "OPEN" || status === "FULL" || status === "CLOSED") &&
    isInstant(referenceTime) &&
    Number.isFinite(nowMs) &&
    nowMs < Date.parse(referenceTime)
  );
}

export function commentsErrorMessage(error: unknown): string {
  if (error instanceof CommentsError) {
    switch (error.kind) {
      case "notConnected":
        return "댓글 연동을 준비하고 있어요. 잠시 후 다시 이용해 주세요.";
      case "invalid":
        return "댓글 정보를 확인할 수 없어요. 새로 불러온 후 다시 시도해 주세요.";
      case "forbidden":
        return "댓글을 이용할 권한이 없어요. 최신 정보를 확인해 주세요.";
      case "notFound":
        return "모집이나 댓글을 찾을 수 없어요. 최신 정보를 확인해 주세요.";
      case "closed":
        return "모집이 종료되어 새 댓글을 작성할 수 없어요.";
    }
  }
  return "요청이 처리됐는지 확인하지 못했어요. 댓글을 새로 불러와 결과를 확인해 주세요.";
}
