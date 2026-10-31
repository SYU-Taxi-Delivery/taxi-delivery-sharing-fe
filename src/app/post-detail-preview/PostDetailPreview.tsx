"use client";

import { useMemo, useState } from "react";
import { ApiError } from "@/lib/api";
import type { AuthOperations } from "@/features/auth/auth";
import { AuthProvider } from "@/features/auth/AuthProvider";
import {
  PostDetailError,
  type PostDetailOperations,
} from "@/features/posts/detail/postDetail";
import { PostDetailScreen } from "@/features/posts/detail/PostDetailScreen";
import { createPreview as createCommentsPreview } from "../comments-preview/CommentsPreview";

const auth: AuthOperations = {
  me: async () => ({ id: "1", displayName: "김하늘", role: "STUDENT" }),
  login: async () => {},
  logout: async () => {},
};

const scenarios = {
  viewer: "비참여자 · 택시 모집 중",
  delivery: "비참여자 · 배달(주문 안내)",
  joined: "참여 중 · 명단·링크",
  cancelledMember: "참여 취소한 학생",
  reported: "이미 신고한 모집",
  reportDuplicate: "신고 시 중복 응답",
  author: "작성자 · 모집 중 3/4",
  authorFull: "작성자 · 정원 마감",
  authorClosed: "작성자 · 직접 마감",
  closeConflict: "작성자 · 마감 중 상태 변경",
  finished: "완료된 모집(최종 참여자)",
  cancelled: "작성자가 취소한 모집",
  removed: "삭제된 모집",
  notFound: "없는 모집",
} as const;
type Scenario = keyof typeof scenarios;

const pause = () =>
  new Promise<void>((resolve) => window.setTimeout(resolve, 400));

function initialState(scenario: Scenario) {
  const now = Date.now();
  const hours = scenario === "finished" ? -1 : 2;
  const reference = new Date(now + hours * 3_600_000);
  reference.setSeconds(0, 0);
  const author = scenario.startsWith("author") || scenario === "closeConflict";
  const joined = scenario === "joined" || scenario === "finished";
  const base = {
    id: "preview-detail",
    title:
      scenario === "delivery"
        ? "점심 배달 같이 시켜요"
        : "정문에서 태릉입구역까지 같이 가요",
    description:
      "수업 끝나고 태릉입구역으로 이동해요.\n출발 5분 전, 정문 바깥 택시 승차 장소에서 만나요.",
    status:
      scenario === "authorFull"
        ? "FULL"
        : scenario === "authorClosed"
          ? "CLOSED"
          : scenario === "cancelled"
            ? "CANCELLED"
            : scenario === "removed"
              ? "REMOVED"
              : "OPEN",
    referenceTime: reference.toISOString(),
    createdAt: new Date(now - 2 * 3_600_000).toISOString(),
    capacity: 4,
    currentMemberCount:
      scenario === "authorFull" ? 4 : author ? 3 : joined ? 3 : 2,
    relation: author
      ? "AUTHOR"
      : joined
        ? "JOINED"
        : scenario === "cancelledMember"
          ? "CANCELLED"
          : "NONE",
    authorName: author ? "김하늘" : "박지민",
    reported: scenario === "reported",
    // The preview server sends names and links to everyone; the screen must hide them.
    participantNames: author
      ? ["김하늘", "윤서준", "강다은"]
      : ["박지민", "이서연", ...(joined ? ["김하늘"] : [])],
    communicationUrl: "https://open.kakao.com/o/preview",
    email: "someone@syuin.ac.kr",
    studentNumber: "2024101234",
  };
  return scenario === "delivery"
    ? {
        ...base,
        type: "DELIVERY",
        restaurantName: "정문 김밥",
        pickupLocation: "학생회관 앞",
        orderGuide: "메뉴는 각자 고르고 배달비는 나눠 내요.",
      }
    : {
        ...base,
        type: "TAXI",
        departure: "삼육대학교 정문",
        destination: "태릉입구역 7번 출구",
      };
}

export function PostDetailPreview({
  postId = "preview-detail",
}: {
  postId?: string;
}) {
  const initialScenario: Scenario =
    postId.startsWith("created-") ||
    ["preview-created", "preview-edit"].includes(postId)
      ? "author"
      : postId.startsWith("participated-")
        ? "joined"
        : /^preview-\d+$/.test(postId) &&
            (Number(postId.slice(8)) - 1) % 3 === 1
          ? "delivery"
          : "viewer";
  const [scenario, setScenario] = useState<Scenario>(initialScenario);
  const [version, setVersion] = useState(0);
  const [comments] = useState(() => createCommentsPreview("normal"));

  const operations = useMemo<PostDetailOperations>(() => {
    const state: Record<string, unknown> = {
      ...initialState(scenario),
      id: postId,
    };
    const snapshot = () => {
      const count = state.currentMemberCount as number;
      const capacity = state.capacity as number;
      const joinable =
        state.status === "OPEN" &&
        count < capacity &&
        Date.now() < Date.parse(state.referenceTime as string) - 600_000;
      return { ...state, joinable, serverTime: new Date().toISOString() };
    };
    return {
      load: async () => {
        await pause();
        if (scenario === "notFound") throw new ApiError(404, "");
        return snapshot();
      },
      join: async () => {
        await pause();
        state.relation = "JOINED";
        state.currentMemberCount = (state.currentMemberCount as number) + 1;
        state.participantNames = ["박지민", "이서연", "김하늘"];
      },
      leave: async () => {
        await pause();
        state.relation = "CANCELLED";
        state.currentMemberCount = (state.currentMemberCount as number) - 1;
      },
      close: async () => {
        await pause();
        if (scenario === "closeConflict") {
          state.status = "FULL";
          state.currentMemberCount = 4;
          throw new PostDetailError("conflict");
        }
        state.status = "CLOSED";
      },
      cancel: async () => {
        await pause();
        state.status = "CANCELLED";
      },
      report: async () => {
        await pause();
        if (scenario === "reportDuplicate") {
          throw new PostDetailError("duplicateReport");
        }
      },
    };
  }, [scenario, postId]);

  return (
    <AuthProvider operations={auth}>
      <div className="flex flex-wrap items-center gap-3 bg-yellow-100 px-4 py-2 text-xs">
        <span>모집 상세 데모 · 새로고침하면 초기화돼요.</span>
        <label className="flex items-center gap-1">
          상황
          <select
            className="rounded border px-1"
            value={scenario}
            onChange={(event) => {
              setScenario(event.target.value as Scenario);
              setVersion((value) => value + 1);
            }}
          >
            {Object.entries(scenarios).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <PostDetailScreen
        key={version}
        postId={postId}
        listPath="/posts-preview"
        operations={operations}
        commentOperations={comments.operations}
      />
    </AuthProvider>
  );
}
