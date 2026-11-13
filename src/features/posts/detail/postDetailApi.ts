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
 * Join/cancel failures: a 409 with a known reason becomes ParticipationRejected
 * carrying the post's latest public state; the rest as toDetailError.
 */
export function toParticipationError(error: unknown): unknown {
  const code = errorCode(error);
  if (
    error instanceof ApiError &&
    error.status === 409 &&
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
 * Author close/cancel: a 404 that is not POST_NOT_FOUND (API_NOT_FOUND, no
 * code) or a 405 means this server does not offer the endpoint yet.
 */
function toManageError(error: unknown): unknown {
  if (
    error instanceof ApiError &&
    (error.status === 405 ||
      (error.status === 404 && errorCode(error) !== "POST_NOT_FOUND"))
  ) {
    return new PostDetailNotConnectedError();
  }
  return toDetailError(error);
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
  close: async (id) => {
    try {
      await backendSend("POST", `${path(id)}/close`);
    } catch (error) {
      throw toManageError(error);
    }
  },
  /** POST /api/posts/{id}/cancel: the whole schedule, every member cancelled. */
  cancel: async (id) => {
    try {
      await backendSend("POST", `${path(id)}/cancel`);
    } catch (error) {
      throw toManageError(error);
    }
  },
  // There is no report API yet, so report is omitted and the screen says so.
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
