"use client";

import { useMemo, useState } from "react";
import { AuthProvider } from "@/features/auth/AuthProvider";
import type { AuthOperations } from "@/features/auth/auth";
import {
  PAGE_SIZE,
  type PostListOperations,
  type PostQuery,
} from "@/features/posts/posts";
import { PostListScreen } from "@/features/posts/PostListScreen";
import { DevTools } from "@/features/demo/DevTools";
import { DEMO_VIEWER, listDemoPosts } from "@/features/demo/demoPosts";

type Scenario = "normal" | "empty" | "error" | "invalid";

const auth: AuthOperations = {
  me: async () => DEMO_VIEWER,
  login: async () => {},
  logout: async () => {},
};

const pause = () =>
  new Promise<void>((resolve) => window.setTimeout(resolve, 400));

export function PostsPreview({ query }: { query: PostQuery }) {
  const [scenario, setScenario] = useState<Scenario>("normal");
  const operations = useMemo<PostListOperations>(
    () => ({
      list: async (query) => {
        const { page } = query;
        await pause();
        if (scenario === "error") throw new TypeError("Failed to fetch");
        const matched =
          scenario === "empty" ? [] : listDemoPosts(query, Date.now());
        const content = matched.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
        return {
          content:
            scenario === "invalid"
              ? content.map((post, index) =>
                  index === 0 ? { ...post, capacity: undefined } : post,
                )
              : content,
          totalElements: matched.length,
          totalPages: Math.ceil(matched.length / PAGE_SIZE),
          number: page,
          size: PAGE_SIZE,
        };
      },
    }),
    [scenario],
  );

  return (
    <AuthProvider operations={auth}>
      <DevTools>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span>
            모집 목록 데모 · 상세·내 활동과 같은 데이터예요. 새로고침하면 처음
            상태로 돌아가요.
          </span>
          <label className="flex items-center gap-1">
            상황
            <select
              value={scenario}
              onChange={(event) => setScenario(event.target.value as Scenario)}
              className="rounded border px-1"
            >
              <option value="normal">정상</option>
              <option value="empty">빈 목록</option>
              <option value="error">조회 실패</option>
              <option value="invalid">잘못된 데이터</option>
            </select>
          </label>
        </div>
      </DevTools>
      <PostListScreen
        query={query}
        basePath="/posts-preview"
        operations={operations}
      />
    </AuthProvider>
  );
}
