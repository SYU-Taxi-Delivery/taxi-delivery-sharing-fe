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
import { DevTools } from "@/features/demo/DevTools";
import {
  DEMO_VIEWER,
  DemoRejection,
  demoCancel,
  demoClose,
  demoDetail,
  demoJoin,
  demoLeave,
  findDemoPost,
  regenerateDemoPost,
  removeDemoPost,
  updateDemoPost,
  type DemoPostRecord,
} from "@/features/demo/demoPosts";

const auth: AuthOperations = {
  me: async () => DEMO_VIEWER,
  login: async () => {},
  logout: async () => {},
};

/*
 * Scenarios rewrite this post's shared record, so the list and 내 활동 show
 * the same change. "목록 데이터 그대로" puts the record back as generated.
 */
const scenarios = {
  current: "목록 데이터 그대로",
  viewer: "비참여자 · 모집 중",
  joined: "참여 중 · 명단·링크",
  cancelledMember: "참여 취소한 학생",
  reported: "이미 신고한 모집",
  reportDuplicate: "신고 시 중복 응답",
  author: "작성자 · 모집 중",
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

/** Keeps `members` within what the scenario's headcount allows. */
const seats = (post: DemoPostRecord, others: number): DemoPostRecord => ({
  ...post,
  members: Array.from(
    { length: Math.max(0, others) },
    (_, index) =>
      post.members[index] ??
      ["윤서준", "강다은", "조하린", "임도현", "서지아"][index % 5],
  ),
});

function applyScenario(id: string, scenario: Scenario) {
  if (scenario === "notFound") {
    removeDemoPost(id);
    return;
  }
  const base = regenerateDemoPost(id);
  if (!base || scenario === "current") return;
  const viewer = (post: DemoPostRecord, relation: DemoPostRecord["relation"]) =>
    ({
      ...post,
      relation,
      state: "OPEN",
      authorName:
        post.authorName === DEMO_VIEWER.displayName
          ? "박지민"
          : post.authorName,
    }) satisfies DemoPostRecord;
  const author = (post: DemoPostRecord) =>
    ({
      ...post,
      relation: "AUTHOR",
      state: "OPEN",
      authorName: DEMO_VIEWER.displayName,
    }) satisfies DemoPostRecord;
  updateDemoPost(id, (post) => {
    const cap = post.capacity;
    switch (scenario) {
      case "viewer":
      case "reportDuplicate":
        return seats(
          viewer(post, "NONE"),
          Math.min(post.members.length, cap - 2),
        );
      case "reported":
        return { ...viewer(post, "NONE"), reported: true };
      case "joined":
        return seats(
          viewer(post, "JOINED"),
          Math.min(post.members.length, cap - 2),
        );
      case "cancelledMember":
        return seats(
          viewer(post, "CANCELLED"),
          Math.min(post.members.length, cap - 2),
        );
      case "author":
      case "closeConflict":
        return seats(author(post), cap - 2);
      case "authorFull":
        return seats(author(post), cap - 1);
      case "authorClosed":
        return { ...seats(author(post), cap - 2), state: "CLOSED" };
      case "finished": {
        const reference = new Date(Date.now() - 3_600_000);
        reference.setSeconds(0, 0);
        return {
          ...seats(
            viewer(post, "JOINED"),
            Math.min(post.members.length, cap - 2),
          ),
          referenceTime: reference.toISOString(),
        };
      }
      case "cancelled":
        return { ...viewer(post, "NONE"), state: "CANCELLED", members: [] };
      case "removed":
        return { ...post, state: "REMOVED" };
    }
  });
}

/** A demo refusal as the detail adapter would report it. */
function toScreenError(error: unknown): unknown {
  if (!(error instanceof DemoRejection)) return error;
  if (error.status === 404) return new PostDetailError("notFound");
  if (error.status === 403) return new PostDetailError("forbidden");
  return new PostDetailError("conflict");
}

const run = async <T,>(action: () => T): Promise<T> => {
  await pause();
  try {
    return action();
  } catch (error) {
    throw toScreenError(error);
  }
};

export function PostDetailPreview({
  postId = "preview-6",
}: {
  postId?: string;
}) {
  const [scenario, setScenario] = useState<Scenario>("current");
  const [version, setVersion] = useState(0);
  // Comments follow the post: a pickup chat for delivery, a ride chat for taxi.
  const [taxiComments] = useState(() => createCommentsPreview("normal"));
  const [deliveryComments] = useState(() => createCommentsPreview("delivery"));
  const [delivery] = useState(
    () =>
      typeof window !== "undefined" &&
      findDemoPost(postId)?.type === "DELIVERY",
  );
  const comments = delivery ? deliveryComments : taxiComments;

  const operations = useMemo<PostDetailOperations>(
    () => ({
      load: () =>
        run(() => {
          const post = findDemoPost(postId);
          if (!post) throw new ApiError(404, "");
          return demoDetail(post, Date.now());
        }),
      join: (id) =>
        run(() => {
          demoJoin(id);
        }),
      leave: (id) =>
        run(() => {
          demoLeave(id);
        }),
      close: (id) =>
        run(() => {
          if (scenario === "closeConflict") {
            // Someone took the last seat while the author was deciding.
            updateDemoPost(id, (post) => seats(post, post.capacity - 1));
            throw new PostDetailError("conflict");
          }
          demoClose(id);
        }),
      cancel: (id) =>
        run(() => {
          demoCancel(id);
        }),
      report: async (id) => {
        await pause();
        if (scenario === "reportDuplicate") {
          throw new PostDetailError("duplicateReport");
        }
        updateDemoPost(id, (post) => ({ ...post, reported: true }));
      },
    }),
    [scenario, postId],
  );

  return (
    <AuthProvider operations={auth}>
      <DevTools>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span>
            모집 상세 데모 · 목록·내 활동과 같은 데이터예요. 상황을 바꾸면 모든
            화면에 반영되고, 새로고침하면 처음 상태로 돌아가요.
          </span>
          <label className="flex items-center gap-1">
            상황
            <select
              className="rounded border px-1"
              value={scenario}
              onChange={(event) => {
                const next = event.target.value as Scenario;
                applyScenario(postId, next);
                setScenario(next);
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
      </DevTools>
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
