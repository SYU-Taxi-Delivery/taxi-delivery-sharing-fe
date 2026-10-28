import { ApiError } from "@/lib/api";
import {
  InvalidBackendResponse,
  backendGet,
  backendSend,
  errorCode,
  serverTimeNow,
} from "@/lib/backend";
import { PostDetailError, type PostDetailOperations } from "./postDetail";

export class PostDetailNotConnectedError extends Error {
  constructor() {
    super("모집 상세 연동이 아직 준비되지 않았습니다.");
    this.name = "PostDetailNotConnectedError";
  }
}

const notConnected = async (): Promise<never> => {
  throw new PostDetailNotConnectedError();
};

/** GET /api/posts/{postId} data (docs/post-api.md §3). */
export type BackendDetail = Record<string, unknown> & {
  postId?: unknown;
  postStatus?: unknown;
  content?: unknown;
  author?: { displayName?: unknown };
  viewer?: {
    isAuthor?: unknown;
    myParticipationStatus?: unknown;
  };
};

const path = (id: string) => `/api/posts/${encodeURIComponent(id)}`;

/** Maps 404/403/409 to PostDetailError; 401 and unknown failures pass through. */
export function toDetailError(error: unknown): unknown {
  if (!(error instanceof ApiError) || error.status === 401) return error;
  const code = errorCode(error);
  if (error.status === 404 || code === "INVALID_POST_ID") {
    return new PostDetailError("notFound");
  }
  if (error.status === 403 && code !== "CSRF_INVALID") {
    return new PostDetailError("forbidden");
  }
  if (error.status === 409) return new PostDetailError("conflict");
  return error;
}

export async function loadBackendDetail(
  id: string,
): Promise<{ detail: BackendDetail; evaluatedAt: string }> {
  try {
    const { data, evaluatedAt } = await backendGet<BackendDetail>(path(id));
    if (typeof data !== "object" || data === null)
      throw new InvalidBackendResponse();
    return { detail: data, evaluatedAt };
  } catch (error) {
    throw toDetailError(error);
  }
}

export function relationOf(detail: BackendDetail) {
  if (detail.viewer?.isAuthor === true) return "AUTHOR";
  return detail.viewer?.myParticipationStatus;
}

/** Author first, then JOINED members; only the author and JOINED may read it. */
async function participantNames(
  id: string,
): Promise<{ names?: string[]; evaluatedAt: string } | undefined> {
  try {
    const { data, evaluatedAt } = await backendGet<{
      author?: { displayName?: unknown };
      participants?: { displayName?: unknown }[];
    }>(`${path(id)}/participants`);
    if (!Array.isArray(data?.participants)) return { evaluatedAt };
    return {
      evaluatedAt,
      names: [data.author, ...data.participants].map((member) =>
        typeof member?.displayName === "string" ? member.displayName : "",
      ),
    };
  } catch (error) {
    if (
      error instanceof ApiError &&
      (error.status === 401 || error.status === 403)
    )
      throw error;
    // Names are optional; the page still shows counts without them.
    return undefined;
  }
}

/** Backend detail → the shape toPostDetail validates. */
export function fromBackendDetail(
  detail: BackendDetail,
  evaluatedAt: string,
  names?: string[],
): Record<string, unknown> {
  const { postId, postStatus, content, author, ...rest } = detail;
  return {
    ...rest,
    id: postId,
    status: postStatus,
    description: content,
    authorName: author?.displayName,
    relation: relationOf(detail),
    serverTime: evaluatedAt,
    ...(names ? { participantNames: names } : {}),
    // There is no report API yet, so nothing is known to be reported.
    reported: false,
  };
}

export const postDetailOperations: PostDetailOperations = {
  load: async (id) => {
    const { detail, evaluatedAt } = await loadBackendDetail(id);
    const now = serverTimeNow(evaluatedAt);
    const relation = relationOf(detail);
    const participants =
      (relation === "AUTHOR" || relation === "JOINED") &&
      detail.postStatus !== "CANCELLED"
        ? await participantNames(id)
        : undefined;
    const serverTime = new Date(
      Math.max(now(), Date.parse(participants?.evaluatedAt ?? evaluatedAt)),
    ).toISOString();
    return fromBackendDetail(detail, serverTime, participants?.names);
  },
  // No backend endpoints yet for author close/cancel and reports.
  close: notConnected,
  cancel: notConnected,
  join: async (id) => {
    try {
      await backendSend("POST", `${path(id)}/participants`);
    } catch (error) {
      throw toDetailError(error);
    }
  },
  leave: async (id) => {
    try {
      await backendSend("DELETE", `${path(id)}/participants`);
    } catch (error) {
      throw toDetailError(error);
    }
  },
  report: notConnected,
};
