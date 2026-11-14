"use client";

import { useMemo, useState } from "react";
import type { AuthOperations } from "@/features/auth/auth";
import { AuthProvider } from "@/features/auth/AuthProvider";
import type { MyHistoryOperations, MyTab } from "@/features/my/myHistory";
import { MyHistoryScreen } from "@/features/my/MyHistoryScreen";
import { DevTools } from "@/features/demo/DevTools";
import {
  DEMO_VIEWER,
  demoHistory,
  demoHistoryItem,
  demoLeave,
  demoParticipationError,
  demoStatus,
  resetDemoPosts,
  updateDemoPost,
} from "@/features/demo/demoPosts";

const auth: AuthOperations = {
  me: async () => DEMO_VIEWER,
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

const pause = () =>
  new Promise<void>((resolve) => window.setTimeout(resolve, 400));

/** The soonest upcoming post I joined; the boundary scenario moves it. */
function firstJoinedDemoPost(now: number) {
  return demoHistory("participated")
    .filter(
      (post) =>
        post.relation === "JOINED" && demoStatus(post, now) !== "FINISHED",
    )
    .sort((a, b) => Date.parse(a.referenceTime) - Date.parse(b.referenceTime))
    .find((post) => post.state !== "REMOVED");
}

/**
 * Switching the scenario starts the shared demo data over, so the list and
 * detail screens change together with this one.
 */
function startScenario(scenario: Scenario) {
  const now = Date.now();
  resetDemoPosts(now);
  if (scenario !== "boundary") return;
  const target = firstJoinedDemoPost(now);
  if (target) {
    updateDemoPost(target.id, (post) => ({
      ...post,
      referenceTime: new Date(now + 605_000).toISOString(),
    }));
  }
}

export function MyPreview({ tab }: { tab: MyTab }) {
  const [scenario, setScenario] = useState<Scenario>("normal");
  const operations = useMemo<MyHistoryOperations>(() => {
    const refreshFailure = { pending: false };
    return {
      list: async (requestedTab) => {
        await pause();
        if (scenario === "loadError" || refreshFailure.pending) {
          refreshFailure.pending = false;
          throw new TypeError("Failed to fetch");
        }
        const now = Date.now();
        return {
          content:
            scenario === "empty"
              ? []
              : demoHistory(requestedTab).map((post) =>
                  demoHistoryItem(post, now),
                ),
          serverTime: new Date(now).toISOString(),
        };
      },
      leave: async (id) => {
        await pause();
        if (scenario === "leaveError") throw new TypeError("Failed to fetch");
        try {
          demoLeave(id);
        } catch (error) {
          throw demoParticipationError(error, id);
        }
        refreshFailure.pending = scenario === "refreshError";
      },
    };
  }, [scenario]);

  return (
    <AuthProvider operations={auth}>
      <DevTools>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span>
            참여·모집 내역 데모 · 목록·상세와 같은 데이터예요. 상황을 바꾸거나
            새로고침하면 모든 데모 화면이 처음 상태로 돌아가요.
          </span>
          <label className="flex items-center gap-1">
            상황
            <select
              value={scenario}
              onChange={(event) => {
                const next = event.target.value as Scenario;
                startScenario(next);
                setScenario(next);
              }}
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
      </DevTools>
      <MyHistoryScreen
        key={scenario}
        tab={tab}
        basePath="/my-preview"
        operations={operations}
      />
    </AuthProvider>
  );
}
