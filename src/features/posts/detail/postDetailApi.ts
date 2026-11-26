import { ApiError } from "@/lib/api";
import {
  InvalidBackendResponse,
  backendGet,
  backendSend,
  errorCode,
  errorDetails,
  serverTimeNow,
} from "@/lib/backend";
import {
  ParticipationRejected,
  REJECTION_MESSAGES,
  REJECTION_STATUSES,
  toRecruitmentStatus,
  type LatestPublicState,
} from "@/features/participation/participation";
import { PostDetailError, type PostDetailOperations } from "./postDetail";

export class PostDetailNotConnectedError extends Error {
  constructor() {
    super("모집 상세 연동이 아직 준비되지 않았습니다.");
    this.name = "PostDetailNotConnectedError";
  }
}

/** GET /api/posts/{postId} data (docs/post-api.md §3). */
export type BackendDetail = Record<string, unknown> & {
  postId?: unknown;
  postStatus?: unknown;
  content?: unknown;
  author?: { displayName?: unknown };
  viewer?: {
    isAuthor?: unknown;
    myParticipationStatus?: unknown;
    reported?: unknown;
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
    reported: detail.viewer?.reported === true,
  };
}

const STATUSES = ["OPEN", "FULL", "CLOSED", "CANCELLED", "FINISHED", "REMOVED"];
const offsetInstant = /(?:Z|[+-]\d{2}:\d{2})$/i;

/** `error.details.post` of a 409 → the fields the screen can trust. */
export function latestPublicState(
  value: unknown,
): LatestPublicState | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const raw = value as Record<string, unknown>;
  const count = (key: string) =>
    Number.isSafeInteger(raw[key]) && (raw[key] as number) >= 0
      ? { [key]: raw[key] as number }
      : {};
  const time = (key: string) =>
    typeof raw[key] === "string" &&
    offsetInstant.test(raw[key]) &&
    Number.isFinite(Date.parse(raw[key]))
      ? { [key]: raw[key] }
      : {};
  const latest: LatestPublicState = {
    ...(STATUSES.includes(raw.postStatus as string)
      ? { status: raw.postStatus as LatestPublicState["status"] }
      : {}),
    ...(toRecruitmentStatus(raw.recruitmentStatus)
      ? { recruitmentStatus: toRecruitmentStatus(raw.recruitmentStatus) }
      : {}),
    ...time("referenceTime"),
    ...time("participationDeadline"),
    ...count("capacity"),
    ...count("currentMemberCount"),
    ...(typeof raw.joinable === "boolean" ? { joinable: raw.joinable } : {}),
  };
  return Object.keys(latest).length > 0 ? latest : undefined;
}

/**
 * Join/cancel failures: a refusal with a known reason (409 conflicts, the
 * 403 author rules, 404 no record, 503 busy) becomes ParticipationRejected,
 * carrying the post's latest public state when the server sent it; the rest
 * as toDetailError.
 */
export function toParticipationError(error: unknown): unknown {
  const code = errorCode(error);
  if (
    error instanceof ApiError &&
    REJECTION_STATUSES.includes(error.status) &&
    code &&
    code in REJECTION_MESSAGES
  ) {
    return new ParticipationRejected(
      code,
      latestPublicState(errorDetails(error)?.post),
    );
  }
  return toDetailError(error);
}

/**
 * A 404 without POST_NOT_FOUND (API_NOT_FOUND, no code) or a 405 can mean
 * an older server does not offer this management or reporting endpoint yet.
 */
function toDetailMutationError(error: unknown): unknown {
  if (
    error instanceof ApiError &&
    (error.status === 405 ||
      (error.status === 404 && errorCode(error) !== "POST_NOT_FOUND"))
  ) {
    return new PostDetailNotConnectedError();
  }
  return toDetailError(error);
}

/**
 * A repeated close/cancel whose first response was lost comes back as 409 with
 * the state it asked for (POST_CLOSED / POST_CANCELLED). That is "already
 * done", not a failure (#34), so it resolves like the first success.
 */
async function manage(id: string, action: "close" | "cancel") {
  try {
    await backendSend("POST", `${path(id)}/${action}`);
  } catch (error) {
    const done = action === "close" ? "POST_CLOSED" : "POST_CANCELLED";
    if (
      error instanceof ApiError &&
      error.status === 409 &&
      errorCode(error) === done
    )
      return;
    throw toDetailMutationError(error);
  }
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
  /** POST /api/posts/{id}/close: OPEN/FULL → CLOSED with the current members. */
  close: (id) => manage(id, "close"),
  /** POST /api/posts/{id}/cancel: the whole schedule, every member cancelled. */
  cancel: (id) => manage(id, "cancel"),
  report: async (id, request) => {
    try {
      await backendSend("POST", `${path(id)}/reports`, request);
    } catch (error) {
      if (error instanceof ApiError) {
        const code = errorCode(error);
        if (error.status === 409 && code === "DUPLICATE_REPORT") {
          throw new PostDetailError("duplicateReport");
        }
        if (error.status === 403 && code === "SELF_REPORT_NOT_ALLOWED") {
          throw new PostDetailError("ownPost");
        }
        if (
          error.status === 400 &&
          (code === "INVALID_REPORT" || code === "INVALID_REQUEST")
        ) {
          throw new PostDetailError("invalid");
        }
      }
      throw toDetailMutationError(error);
    }
  },
  join: async (id) => {
    try {
      await backendSend("POST", `${path(id)}/participants`);
    } catch (error) {
      throw toParticipationError(error);
    }
  },
  leave: async (id) => {
    try {
      await backendSend("DELETE", `${path(id)}/participants`);
    } catch (error) {
      throw toParticipationError(error);
    }
  },
};
