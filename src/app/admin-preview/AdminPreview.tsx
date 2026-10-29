"use client";

import { useState } from "react";
import { AdminScreen } from "@/features/admin/AdminScreen";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { MyHistoryScreen } from "@/features/my/MyHistoryScreen";
import { PostDetailScreen } from "@/features/posts/detail/PostDetailScreen";
import { PostListScreen } from "@/features/posts/PostListScreen";
import {
  ADMIN_PREVIEW_SCENARIOS,
  createAdminPreview,
  type AdminPreviewScenario,
} from "./previewModel";

const views = {
  admin: "관리자 신고 화면",
  posts: "일반 모집 목록",
  detail: "일반 모집 상세",
  created: "작성자 모집 이력",
  participated: "참여자 참여 이력",
} as const;
type View = keyof typeof views;

function PreviewCase({
  scenario,
  view,
  postId,
}: {
  scenario: AdminPreviewScenario;
  view: View;
  postId: string;
}) {
  const [model] = useState(() => createAdminPreview(scenario));
  return (
    <AuthProvider
      key={view}
      operations={
        view === "admin"
          ? model.auth
          : view === "created"
            ? model.authorAuth
            : view === "participated"
              ? model.participantAuth
              : model.studentAuth
      }
    >
      {view === "admin" ? (
        <AdminScreen operations={model.admin} />
      ) : view === "posts" ? (
        <PostListScreen
          query={{ type: "ALL", page: 0, joinableOnly: false }}
          operations={model.posts}
        />
      ) : view === "detail" ? (
        <PostDetailScreen
          key={postId}
          postId={postId}
          operations={model.detail}
        />
      ) : (
        <MyHistoryScreen tab={view} operations={model.history} />
      )}
    </AuthProvider>
  );
}

export function AdminPreview() {
  const [scenario, setScenario] = useState<AdminPreviewScenario>("normal");
  const [view, setView] = useState<View>("admin");
  const [postId, setPostId] = useState("p1");
  return (
    <>
      <aside className="flex flex-wrap items-center gap-3 bg-yellow-100 px-4 py-2 text-sm">
        <p>
          개발 전용 모의 관리자 · 실제 신고·모집·참여 데이터는 변경하지 않아요.
        </p>
        <label>
          상황{" "}
          <select
            value={scenario}
            onChange={(event) => {
              setScenario(event.target.value as AdminPreviewScenario);
              setView("admin");
            }}
          >
            {Object.entries(ADMIN_PREVIEW_SCENARIOS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          확인 화면{" "}
          <select
            value={view}
            onChange={(event) => setView(event.target.value as View)}
          >
            {Object.entries(views).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          상세 대상{" "}
          <select
            value={postId}
            onChange={(event) => setPostId(event.target.value)}
          >
            <option value="p1">진행 중 모집</option>
            <option value="p2">완료된 모집</option>
          </select>
        </label>
      </aside>
      <PreviewCase
        key={scenario}
        scenario={scenario}
        view={view}
        postId={postId}
      />
    </>
  );
}
