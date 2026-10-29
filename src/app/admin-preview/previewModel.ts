import { ApiError } from "@/lib/api";
import { serverTimeNow } from "@/lib/backend";
import {
  AdminError,
  type AdminOperations,
  type AdminReportDetail,
  type AdminReportSummary,
  type RemovalResult,
} from "@/features/admin/admin";
import type { AuthOperations } from "@/features/auth/auth";
import { AuthNotConnectedError } from "@/features/auth/authApi";
import type { MyHistoryOperations } from "@/features/my/myHistory";
import {
  PostDetailError,
  type PostDetail,
  type PostDetailOperations,
} from "@/features/posts/detail/postDetail";
import { PostDetailNotConnectedError } from "@/features/posts/detail/postDetailApi";
import {
  PAGE_SIZE,
  type PostListOperations,
  type PostStatus,
  type PostSummary,
} from "@/features/posts/posts";

export const ADMIN_PREVIEW_SCENARIOS = {
  normal: "관리자 · 정상 신고",
  empty: "빈 신고 목록",
  listFailure: "목록 1회 실패 후 재시도",
  missing: "없는 신고 상세",
  processFailure: "처리 1회 거절 후 재시도",
  conflict: "다른 관리자가 먼저 처리",
  unknownOutcome: "처리 후 응답 유실 · 결과 확인",
  malformedSuccess: "처리 후 잘못된 응답 · 결과 확인",
  removeFailure: "모집 숨김 1회 거절 후 재시도",
  student: "일반 학생 · 관리자 진입 제한",
  anonymous: "비로그인 · 관리자 진입 제한",
  expired: "조회 중 로그인 만료",
  forbidden: "서버 관리자 권한 거절",
  removed: "이미 숨긴 모집",
} as const;
export type AdminPreviewScenario = keyof typeof ADMIN_PREVIEW_SCENARIOS;

type PreviewPost = {
  id: string;
  type: "TAXI" | "DELIVERY";
  title: string;
  content: string;
  status: PostStatus;
  referenceTime: string;
  participation: "JOINED" | "CANCELLED";
};

const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 200));

function studentIdentity(id: string, displayName: string): AuthOperations {
  let signedIn = true;
  return {
    me: async () => (signedIn ? { id, displayName, role: "STUDENT" } : null),
    login: async () => {
      throw new AuthNotConnectedError();
    },
    logout: async () => {
      signedIn = false;
    },
  };
}

/** One mock server state shared by moderation and the existing student screens. */
export function createAdminPreview(scenario: AdminPreviewScenario) {
  const startedAt = Date.now();
  const now = serverTimeNow(new Date(startedAt).toISOString());
  const timestamp = () => new Date(now()).toISOString();
  const posts = new Map<string, PreviewPost>([
    [
      "p1",
      {
        id: "p1",
        type: "TAXI",
        title: "정문에서 석계역까지 같이 가요",
        content: "정문 택시 승차 장소에서 만나요.",
        status: "OPEN",
        referenceTime: new Date(startedAt + 3_600_000).toISOString(),
        participation: "JOINED",
      },
    ],
    [
      "p2",
      {
        id: "p2",
        type: "DELIVERY",
        title: "점심 배달 같이 주문해요",
        content: "학생회관 앞에서 주문한 음식을 받아요.",
        status: "FINISHED",
        referenceTime: new Date(startedAt - 3_600_000).toISOString(),
        participation: "JOINED",
      },
    ],
  ]);
  const reports = new Map<string, AdminReportDetail>();
  const seed = (
    id: string,
    postId: string,
    resolved = false,
  ): AdminReportDetail => {
    const post = posts.get(postId)!;
    return {
      id,
      status: resolved ? "RESOLVED" : "PENDING",
      reason: id === "r3" ? "FALSE_RECRUITMENT" : "INAPPROPRIATE",
      createdAt: new Date(startedAt - 120_000).toISOString(),
      postId,
      postTitle: post.title,
      postStatus: post.status,
      detail: resolved ? null : "모집 내용을 검토해 주세요.",
      reporterId: `reporter-${id}`,
      processedAt: resolved ? new Date(startedAt - 60_000).toISOString() : null,
      processedBy: resolved ? "preview-admin" : null,
      postContent: post.content,
      referenceTime: post.referenceTime,
    };
  };
  if (scenario !== "empty") {
    for (const report of [
      seed("r1", "p1"),
      seed("r2", "p1", true),
      seed("r3", "p2"),
    ])
      reports.set(report.id, report);
  }
  let signedIn = scenario !== "anonymous";
  let failedList = false;
  let failedProcess = false;
  let failedRemove = false;
  const authorize = () => {
    if (scenario === "expired") signedIn = false;
    if (!signedIn) throw new ApiError(401, "");
    if (scenario === "student" || scenario === "forbidden")
      throw new AdminError("forbidden");
  };
  const reportById = (id: string) => {
    const report = reports.get(id);
    if (!report) throw new AdminError("notFound");
    return report;
  };
  const summary = (report: AdminReportDetail): AdminReportSummary => ({
    id: report.id,
    status: report.status,
    reason: report.reason,
    createdAt: report.createdAt,
    postId: report.postId,
    postTitle: report.postTitle,
    postStatus: report.postStatus,
  });
  const hidePost = (postId: string): RemovalResult => {
    const post = posts.get(postId);
    if (!post) throw new AdminError("notFound");
    if (post.status === "REMOVED") throw new AdminError("conflict");
    const finished =
      post.status === "FINISHED" || now() >= Date.parse(post.referenceTime);
    post.status = "REMOVED";
    if (!finished) post.participation = "CANCELLED";
    for (const report of reports.values()) {
      if (report.postId !== postId) continue;
      report.postStatus = "REMOVED";
      report.postTitle = null;
      report.postContent = null;
      report.referenceTime = null;
    }
    return {
      postId,
      status: "REMOVED",
      participationEffect: finished ? "PRESERVED_HISTORY" : "CANCELLED_ACTIVE",
      removedAt: timestamp(),
      removedBy: "preview-admin",
    };
  };
  if (scenario === "removed") hidePost("p1");

  const auth: AuthOperations = {
    me: async () =>
      signedIn
        ? {
            id: "preview-admin",
            displayName: "검토 관리자",
            role: scenario === "student" ? "STUDENT" : "ADMIN",
          }
        : null,
    login: async () => {
      throw new AuthNotConnectedError();
    },
    logout: async () => {
      signedIn = false;
    },
  };
  const admin: AdminOperations = {
    list: async () => {
      await pause();
      authorize();
      if (scenario === "listFailure" && !failedList) {
        failedList = true;
        throw new Error("preview list failure");
      }
      return { content: [...reports.values()].map(summary) };
    },
    load: async (id) => {
      await pause();
      authorize();
      if (scenario === "missing") throw new AdminError("notFound");
      return { ...reportById(id) };
    },
    process: async (id, resolution) => {
      await pause();
      authorize();
      const report = reportById(id);
      if (resolution !== "RESOLVED" && resolution !== "REJECTED")
        throw new AdminError("invalid");
      if (report.status !== "PENDING") throw new AdminError("conflict");
      if (scenario === "processFailure" && !failedProcess) {
        failedProcess = true;
        throw new AdminError("invalid");
      }
      report.status = scenario === "conflict" ? "REJECTED" : resolution;
      report.processedAt = timestamp();
      report.processedBy =
        scenario === "conflict" ? "preview-other-admin" : "preview-admin";
      if (scenario === "conflict") throw new AdminError("conflict");
      if (scenario === "unknownOutcome") throw new AdminError("unknownOutcome");
      if (scenario === "malformedSuccess")
        return { ...report, processedAt: null };
      return { ...report };
    },
    removePost: async (postId) => {
      await pause();
      authorize();
      if (scenario === "removeFailure" && !failedRemove) {
        failedRemove = true;
        throw new AdminError("invalid");
      }
      return hidePost(postId);
    },
  };
  const card = (post: PreviewPost): PostSummary => {
    const base = {
      id: post.id,
      status: post.status,
      referenceTime: post.referenceTime,
      capacity: 4,
      currentMemberCount: 2,
      joinable:
        post.status === "OPEN" &&
        now() < Date.parse(post.referenceTime) - 600_000,
      authorName: "모집 작성자",
    };
    return post.type === "TAXI"
      ? {
          ...base,
          type: "TAXI",
          departure: "삼육대학교 정문",
          destination: "석계역",
        }
      : {
          ...base,
          type: "DELIVERY",
          restaurantName: "정문 김밥",
          pickupLocation: "학생회관 앞",
        };
  };
  const notConnected = async (): Promise<never> => {
    throw new PostDetailNotConnectedError();
  };
  const detail: PostDetailOperations = {
    load: async (id): Promise<PostDetail> => {
      await pause();
      const post = posts.get(id);
      if (!post || post.status === "REMOVED")
        throw new PostDetailError("notFound");
      return {
        ...card(post),
        title: post.title,
        authorName: "모집 작성자",
        description: post.content,
        serverTime: timestamp(),
        relation: "NONE",
        reported: false,
      };
    },
    close: notConnected,
    cancel: notConnected,
    join: notConnected,
    leave: notConnected,
    report: notConnected,
  };
  const postList: PostListOperations = {
    list: async (query) => {
      await pause();
      const available = [...posts.values()]
        .filter((post) => post.status !== "REMOVED")
        .map(card)
        .filter(
          (post) =>
            (query.type === "ALL" || query.type === post.type) &&
            (!query.joinableOnly || post.joinable),
        );
      return {
        content: available.slice(
          query.page * PAGE_SIZE,
          (query.page + 1) * PAGE_SIZE,
        ),
        totalElements: available.length,
        totalPages: Math.ceil(available.length / PAGE_SIZE),
        number: query.page,
        size: PAGE_SIZE,
      };
    },
  };
  const history: MyHistoryOperations = {
    list: async (tab) => {
      await pause();
      return {
        content: [...posts.values()].map((post) => {
          const relation = tab === "created" ? "AUTHOR" : post.participation;
          return post.status === "REMOVED"
            ? { id: post.id, status: "REMOVED", relation }
            : { ...card(post), relation };
        }),
        serverTime: timestamp(),
      };
    },
    leave: notConnected,
  };
  return {
    admin,
    auth,
    studentAuth: studentIdentity("preview-viewer", "일반 학생"),
    authorAuth: studentIdentity("preview-author", "모집 작성자"),
    participantAuth: studentIdentity("preview-participant", "모집 참가자"),
    posts: postList,
    detail,
    history,
  };
}
