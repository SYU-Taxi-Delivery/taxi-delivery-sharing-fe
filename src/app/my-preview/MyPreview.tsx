"use client";

import { useMemo, useState } from "react";
import type { AuthOperations } from "@/features/auth/auth";
import { AuthProvider } from "@/features/auth/AuthProvider";
import type {
  MyHistoryItem,
  MyHistoryOperations,
  MyTab,
} from "@/features/my/myHistory";
import { MyHistoryScreen } from "@/features/my/MyHistoryScreen";
import type { PostStatus } from "@/features/posts/posts";

const auth: AuthOperations = {
  me: async () => ({ id: "1", displayName: "김하늘", role: "STUDENT" }),
  login: async () => {},
  logout: async () => {},
};

const scenarios = {
  normal: "정상 · 상태별 이력",
  empty: "빈 이력",
  loadError: "조회 실패",
  leaveError: "참여 취소 실패",
  refreshError: "취소 성공 후 조회 1회 실패",
  boundary: "참여 취소 마감 5초 전",
} as const;
type Scenario = keyof typeof scenarios;

const statuses: PostStatus[] = [
  "OPEN",
  "FULL",
  "CLOSED",
  "FINISHED",
  "CANCELLED",
  "REMOVED",
];
const pause = () =>
  new Promise<void>((resolve) => window.setTimeout(resolve, 400));

function makeHistory(
  tab: MyTab,
  now: number,
  scenario: Scenario,
): MyHistoryItem[] {
  const rows = statuses.map((status, index): MyHistoryItem => {
    const id = `${tab}-${index}`;
    const relation: MyHistoryItem["relation"] =
      tab === "created"
        ? "AUTHOR"
        : status === "CANCELLED"
          ? "CANCELLED"
          : "JOINED";
    if (status === "REMOVED") return { id, status, relation };
    const type = index % 2 === 0 ? "TAXI" : "DELIVERY";
    const capacity = type === "TAXI" ? 4 : 6;
    const referenceTime = new Date(
      now +
        (status === "FINISHED"
          ? -3_600_000
          : scenario === "boundary" && index === 0
            ? 605_000
            : 7_200_000 + index * 600_000),
    ).toISOString();
    const base = {
      id,
      status,
      relation,
      referenceTime,
      capacity,
      currentMemberCount: status === "FULL" ? capacity : 3,
      joinable: status === "OPEN" && now < Date.parse(referenceTime) - 600_000,
      authorName: tab === "created" ? "김하늘" : "박지민",
    };
    return type === "TAXI"
      ? {
          ...base,
          type,
          departure: "삼육대학교 정문",
          destination: "태릉입구역 7번 출구",
        }
      : {
          ...base,
          type,
          restaurantName: "정문 김밥",
          pickupLocation: "학생회관 앞",
        };
  });
  if (tab === "participated") {
    const open = rows[0];
    rows.push({ ...open, id: "participated-cancelled", relation: "CANCELLED" });
  }
  return rows;
}

export function MyPreview({ tab }: { tab: MyTab }) {
  const [{ scenario, startedAt }, setScenario] = useState(() => ({
    scenario: "normal" as Scenario,
    startedAt: Date.now(),
  }));
  const operations = useMemo<MyHistoryOperations>(() => {
    const histories = {
      participated: makeHistory("participated", startedAt, scenario),
      created: makeHistory("created", startedAt, scenario),
    };
    const refreshFailure = { pending: false };
    return {
      list: async (requestedTab) => {
        await pause();
        if (scenario === "loadError" || refreshFailure.pending) {
          refreshFailure.pending = false;
          throw new TypeError("Failed to fetch");
        }
        return {
          content:
            scenario === "empty"
              ? []
              : histories[requestedTab].map((item) => ({ ...item })),
          serverTime: new Date().toISOString(),
        };
      },
      leave: async (id) => {
        await pause();
        if (scenario === "leaveError") throw new TypeError("Failed to fetch");
        const item = histories.participated.find((row) => row.id === id);
        if (
          !item ||
          item.status === "REMOVED" ||
          item.relation !== "JOINED" ||
          !["OPEN", "FULL", "CLOSED"].includes(item.status) ||
          Date.now() >= Date.parse(item.referenceTime) - 600_000
        ) {
          throw new Error("현재 참여를 취소할 수 없습니다.");
        }
        item.relation = "CANCELLED";
        item.currentMemberCount -= 1;
        if (item.status === "FULL") item.status = "OPEN";
        item.joinable =
          item.status === "OPEN" &&
          Date.now() < Date.parse(item.referenceTime) - 600_000;
        refreshFailure.pending = scenario === "refreshError";
      },
    };
  }, [scenario, startedAt]);

  return (
    <AuthProvider operations={auth}>
      <div className="flex flex-wrap items-center gap-3 bg-yellow-100 px-4 py-2 text-xs">
        <span>참여·모집 내역 데모 · 상황 변경·새로고침 시 초기화돼요.</span>
        <label className="flex items-center gap-1">
          상황
          <select
            value={scenario}
            onChange={(event) =>
              setScenario({
                scenario: event.target.value as Scenario,
                startedAt: Date.now(),
              })
            }
            className="rounded border px-1"
          >
            {Object.entries(scenarios).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <MyHistoryScreen
        key={scenario}
        tab={tab}
        basePath="/my-preview"
        operations={operations}
      />
    </AuthProvider>
  );
}
