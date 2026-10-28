import { ApiError } from "@/lib/api";
import {
  InvalidBackendResponse,
  backendSendData,
  errorCode,
} from "@/lib/backend";
import { PostDetailError } from "../detail/postDetail";
import { loadBackendDetail, relationOf } from "../detail/postDetailApi";
import type { PostStatus } from "../posts";
import {
  PostFormError,
  toSeoulParts,
  type FieldName,
  type EditablePost,
  type PostFormOperations,
  type PostRequest,
} from "./postDraft";

export class PostFormNotConnectedError extends Error {
  constructor() {
    super("모집글 작성 연동이 아직 준비되지 않았습니다.");
    this.name = "PostFormNotConnectedError";
  }
}

/** Screen request → POST/PATCH body; the screen's description is `content`. */
export function toBackendBody(
  request: Partial<PostRequest>,
  { includeType }: { includeType: boolean },
): Record<string, unknown> {
  const { description, type, ...rest } = request;
  return {
    ...(includeType ? { type } : {}),
    ...rest,
    ...(description !== undefined ? { content: description } : {}),
  };
}

/** Backend `details.field` → form field; the screen calls content "description". */
const FIELDS: Record<string, FieldName> = {
  title: "title",
  content: "description",
  communicationUrl: "communicationUrl",
  departure: "departure",
  destination: "destination",
  restaurantName: "restaurantName",
  pickupLocation: "pickupLocation",
  orderGuide: "orderGuide",
  capacity: "capacity",
  referenceTime: "time",
};

function invalidField(error: ApiError): FieldName | undefined {
  try {
    const field = (
      JSON.parse(error.body) as { error?: { details?: { field?: unknown } } }
    ).error?.details?.field;
    return typeof field === "string" ? FIELDS[field] : undefined;
  } catch {
    return undefined;
  }
}

/** Backend error codes (docs/post-api.md) → form error kinds; 401 passes through. */
export function toFormError(error: unknown): unknown {
  if (!(error instanceof ApiError) || error.status === 401) return error;
  switch (errorCode(error)) {
    case "INVALID_POST_FIELD": {
      const field = invalidField(error);
      return new PostFormError(
        "invalid",
        field
          ? {
              [field]:
                "서버에서 받지 않은 값이에요. 입력 내용을 확인해 주세요.",
            }
          : {},
      );
    }
    case "INVALID_REQUEST":
    case "POST_TYPE_IMMUTABLE":
      return new PostFormError("invalid");
    case "POST_REFERENCE_TIME_TOO_EARLY":
      return new PostFormError("time");
    case "POST_TIME_CONFLICT":
      return new PostFormError("duplicate");
    case "POST_CORE_FIELDS_LOCKED":
    case "POST_CANCELLED":
    case "POST_FINISHED":
      return new PostFormError("conflict");
    case "FORBIDDEN_OPERATION":
      return new PostFormError("forbidden");
    case "POST_NOT_FOUND":
    case "INVALID_POST_ID":
      return new PostFormError("notFound");
    default:
      return error;
  }
}

const text = (value: unknown) => (typeof value === "string" ? value : "");

export const postFormOperations: PostFormOperations = {
  // No similar-post search API yet; an empty result lets writing continue.
  findSimilar: async () => [],
  create: async (request) => {
    try {
      const { data } = await backendSendData<{ postId?: unknown }>(
        "POST",
        "/api/posts",
        toBackendBody(request, { includeType: true }),
      );
      if (typeof data?.postId !== "string") throw new InvalidBackendResponse();
      return data.postId;
    } catch (error) {
      throw toFormError(error);
    }
  },
  load: async (id) => {
    let loaded;
    try {
      loaded = await loadBackendDetail(id);
    } catch (error) {
      if (error instanceof PostDetailError) {
        throw new PostFormError(
          error.kind === "forbidden" ? "forbidden" : "notFound",
        );
      }
      throw error;
    }
    const { detail } = loaded;
    const type = detail.type;
    const referenceMs = Date.parse(text(detail.referenceTime));
    const capacity = detail.capacity;
    const current = detail.currentMemberCount;
    if (
      (type !== "TAXI" && type !== "DELIVERY") ||
      typeof detail.postId !== "string" ||
      !Number.isFinite(referenceMs) ||
      !Number.isSafeInteger(capacity) ||
      !Number.isSafeInteger(current)
    ) {
      throw new InvalidBackendResponse();
    }
    const { date, time } = toSeoulParts(referenceMs);
    const empty = { date, time: "", capacity: 4 };
    const result: EditablePost = {
      id: detail.postId,
      status: detail.postStatus as PostStatus,
      isAuthor: relationOf(detail) === "AUTHOR",
      // currentMemberCount includes the author.
      otherJoinedCount: (current as number) - 1,
      currentMemberCount: current as number,
      draft: {
        type,
        common: {
          title: text(detail.title),
          description: text(detail.content),
          communicationUrl: text(detail.communicationUrl),
        },
        taxi:
          type === "TAXI"
            ? {
                departure: text(detail.departure),
                destination: text(detail.destination),
                date,
                time,
                capacity: capacity as number,
              }
            : { departure: "", destination: "", ...empty },
        delivery:
          type === "DELIVERY"
            ? {
                restaurantName: text(detail.restaurantName),
                pickupLocation: text(detail.pickupLocation),
                date,
                time,
                capacity: capacity as number,
                orderGuide: text(detail.orderGuide),
              }
            : {
                restaurantName: "",
                pickupLocation: "",
                orderGuide: "",
                ...empty,
              },
      },
    };
    return result;
  },
  update: async (id, request) => {
    try {
      // type is immutable after creation; sending it is rejected.
      await backendSendData(
        "PATCH",
        `/api/posts/${encodeURIComponent(id)}`,
        toBackendBody(request, { includeType: false }),
      );
    } catch (error) {
      throw toFormError(error);
    }
  },
};
