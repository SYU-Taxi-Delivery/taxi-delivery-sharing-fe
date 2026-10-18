"use client";

import { useMemo, useState } from "react";
import { AuthProvider } from "@/features/auth/AuthProvider";
import type { AuthOperations } from "@/features/auth/auth";
import {
  PAGE_SIZE,
  type PostListOperations,
  type PostQuery,
  type PostSummary,
} from "@/features/posts/posts";
import { PostListScreen } from "@/features/posts/PostListScreen";

type Scenario = "normal" | "empty" | "error" | "invalid";

const auth: AuthOperations = {
  me: async () => ({ id: "1", displayName: "김하늘", role: "STUDENT" }),
  login: async () => {},
  logout: async () => {},
};

const places = [
  "삼육대학교 정문",
  "삼육대학교 후문",
  "태릉입구역 7번 출구",
  "석계역 1번 출구",
  "화랑대역 2번 출구",
];
const restaurants = ["정문 김밥", "후문 치킨", "태릉 중식당", "기숙사 앞 분식"];
const pickups = ["정문", "후문", "기숙사 앞"];
const names = ["박지민", "최유진", "정민수", "오수빈", "이도윤", "한지우"];

function makePosts(now: number): PostSummary[] {
  return Array.from({ length: 41 }, (_, index): PostSummary => {
    const type = index % 3 === 1 ? "DELIVERY" : "TAXI";
    const referenceMs = now + (index * 12 - 25) * 60_000;
    const capacity = type === "TAXI" ? 4 : 2 + (index % 5);
    const full = index % 7 === 3;
    const current = full ? capacity : 1 + (index % (capacity - 1));
    const base = {
      id: `preview-${index + 1}`,
      status: full ? ("FULL" as const) : ("OPEN" as const),
      referenceTime: new Date(referenceMs).toISOString(),
      capacity,
      currentMemberCount: current,
      joinable: !full && current < capacity && now < referenceMs - 600_000,
      authorName: names[index % names.length],
    };
    return type === "TAXI"
      ? {
          ...base,
          type: "TAXI",
          departure: places[index % places.length],
          destination: places[(index + 2) % places.length],
        }
      : {
          ...base,
          type: "DELIVERY",
          restaurantName: restaurants[index % restaurants.length],
          pickupLocation: pickups[index % pickups.length],
        };
  }).filter((post) => Date.parse(post.referenceTime) > now);
}

const pause = () =>
  new Promise<void>((resolve) => window.setTimeout(resolve, 400));

export function PostsPreview({ query }: { query: PostQuery }) {
  const [scenario, setScenario] = useState<Scenario>("normal");
  const operations = useMemo<PostListOperations>(
    () => ({
      list: async ({ type, joinableOnly, page }) => {
        await pause();
        if (scenario === "error") throw new TypeError("Failed to fetch");
        const matched =
          scenario === "empty"
            ? []
            : makePosts(Date.now())
                .filter((post) => type === "ALL" || post.type === type)
                .filter((post) => !joinableOnly || post.joinable)
                .sort(
                  (a, b) =>
                    Date.parse(a.referenceTime) - Date.parse(b.referenceTime) ||
                    a.id.localeCompare(b.id),
                );
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
      <div className="flex flex-wrap items-center gap-3 bg-yellow-100 px-4 py-2 text-xs">
        <span>개발 전용 모의 목록 · 새로고침하면 시각 기준이 바뀌어요.</span>
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
      <PostListScreen
        query={query}
        basePath="/posts-preview"
        operations={operations}
      />
    </AuthProvider>
  );
}
