"use client";

import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { serverTimeNow } from "@/lib/backend";
import type { AuthOperations } from "@/features/auth/auth";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { RequireAuth } from "@/features/auth/RequireAuth";
import { CommentsPanel } from "@/features/comments/CommentsPanel";
import {
  CommentsError,
  type CommentItem,
  type CommentsOperations,
} from "@/features/comments/comments";
import { AppShell } from "@/features/posts/AppShell";
import type { PostStatus } from "@/features/posts/posts";
import common from "@/features/posts/posts.module.css";

const scenarios = {
  normal: "모집 중 · 비참여 사용자",
  full: "정원 마감 · 댓글 작성 가능",
  closed: "직접 마감 · 댓글 작성 가능",
  empty: "빈 댓글",
  loadFailure: "조회 1회 실패 후 재시도",
  createFailure: "등록 거절 · 입력 보존",
  lostResponse: "저장 후 응답 유실 · 결과 확인",
  deleteFailure: "삭제 1회 거절 후 재시도",
  boundary: "5초 후 출발 · 작성 종료",
  finished: "완료된 모집 · 조회와 본인 삭제",
  cancelled: "취소된 모집 · 조회와 본인 삭제",
  unauthorized: "조회 중 로그인 만료",
  forbidden: "댓글 조회 권한 없음",
  removed: "관리자 삭제 · 접근 차단",
} as const;
type Scenario = keyof typeof scenarios;

export function createPreview(scenario: Scenario) {
  const now = Date.now();
  const serverNow = serverTimeNow(new Date(now).toISOString());
  const referenceTime = new Date(
    now + (scenario === "boundary" ? 5_000 : 3_600_000),
  ).toISOString();
  let authenticated = true;
  let failedLoad = false;
  let failedDelete = false;
  let nextId = 3;
  let comments: CommentItem[] =
    scenario === "empty"
      ? []
      : [
          {
            id: "1",
            authorName: "박지민",
            content: "정문 택시 승차 장소에서 만나면 될까요?",
            createdAt: new Date(now - 120_000).toISOString(),
            isMine: false,
          },
          {
            id: "2",
            authorName: "김하늘",
            content:
              "네, 출발 5분 전에 도착할게요.\n도착하면 댓글 남겨 주세요.",
            createdAt: new Date(now - 60_000).toISOString(),
            isMine: true,
          },
        ];
  const pause = () =>
    new Promise<void>((resolve) => window.setTimeout(resolve, 400));
  const auth: AuthOperations = {
    me: async () =>
      authenticated
        ? { id: "preview-student", displayName: "김하늘", role: "STUDENT" }
        : null,
    login: async () => {},
    logout: async () => {
      authenticated = false;
    },
  };
  const operations: CommentsOperations = {
    list: async () => {
      await pause();
      if (scenario === "unauthorized") {
        authenticated = false;
        throw new ApiError(401, "");
      }
      if (scenario === "forbidden") throw new CommentsError("forbidden");
      if (scenario === "removed") throw new CommentsError("notFound");
      if (scenario === "loadFailure" && !failedLoad) {
        failedLoad = true;
        throw new Error("preview load failure");
      }
      return { content: comments.map((comment) => ({ ...comment })) };
    },
    create: async (_postId, content) => {
      await pause();
      if (scenario === "createFailure") throw new CommentsError("invalid");
      if (serverNow() >= Date.parse(referenceTime))
        throw new CommentsError("closed");
      comments.push({
        id: String(nextId++),
        authorName: "김하늘",
        content,
        createdAt: new Date(serverNow()).toISOString(),
        isMine: true,
      });
      if (scenario === "lostResponse")
        throw new CommentsError("unknownOutcome");
    },
    remove: async (_postId, id) => {
      await pause();
      if (scenario === "deleteFailure" && !failedDelete) {
        failedDelete = true;
        throw new CommentsError("invalid");
      }
      if (!comments.find((comment) => comment.id === id)?.isMine)
        throw new CommentsError("forbidden");
      comments = comments.filter((comment) => comment.id !== id);
    },
  };
  return { operations, auth, referenceTime, serverNow };
}

function PreviewCase({ scenario }: { scenario: Scenario }) {
  const [model] = useState(() => createPreview(scenario));
  const [nowMs, setNowMs] = useState(model.serverNow);
  useEffect(() => {
    const timer = window.setTimeout(
      () => setNowMs(model.serverNow()),
      Math.max(0, Date.parse(model.referenceTime) - model.serverNow()),
    );
    return () => window.clearTimeout(timer);
  }, [model]);
  const status: PostStatus =
    scenario === "removed"
      ? "REMOVED"
      : scenario === "finished" || nowMs >= Date.parse(model.referenceTime)
        ? "FINISHED"
        : scenario === "cancelled"
          ? "CANCELLED"
          : scenario === "full"
            ? "FULL"
            : scenario === "closed"
              ? "CLOSED"
              : "OPEN";

  return (
    <AuthProvider operations={model.auth}>
      <AppShell current="posts" postsPath="/posts-preview">
        <RequireAuth>
          <h1 className={common.title}>
            {status === "REMOVED"
              ? "관리자에 의해 삭제된 모집"
              : "정문에서 석계역까지 같이 가요"}
          </h1>
          <p className={`${common.muted} mb-6 mt-2`}>
            {status === "REMOVED"
              ? "삭제된 모집의 댓글은 볼 수 없어요."
              : "공개 댓글로 만날 장소와 시간을 조율해요."}
          </p>
          <CommentsPanel
            postId="preview-comments"
            status={status}
            referenceTime={model.referenceTime}
            serverNow={model.serverNow}
            operations={model.operations}
            onUnavailable={() => {}}
          />
        </RequireAuth>
      </AppShell>
    </AuthProvider>
  );
}

export function CommentsPreview() {
  const [scenario, setScenario] = useState<Scenario>("normal");
  return (
    <>
      <div className="flex flex-wrap items-center gap-3 bg-yellow-100 px-4 py-2 text-sm">
        <p>댓글 데모 · 예시 데이터로 동작해요.</p>
        <label>
          상황{" "}
          <select
            value={scenario}
            onChange={(event) => setScenario(event.target.value as Scenario)}
          >
            {Object.entries(scenarios).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <PreviewCase key={scenario} scenario={scenario} />
    </>
  );
}
