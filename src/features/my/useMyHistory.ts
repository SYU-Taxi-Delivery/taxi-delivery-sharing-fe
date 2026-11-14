"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/features/auth/AuthProvider";
import { ApiError } from "@/lib/api";
import {
  participationDeadlineMs,
  type LatestPublicState,
} from "@/features/participation/participation";
import {
  toMyHistory,
  type MyHistory,
  type MyHistoryOperations,
  type MyTab,
} from "./myHistory";

const DAY_MS = 86_400_000;
const SEOUL_OFFSET_MS = 9 * 3_600_000;

type Scope = {
  tab: MyTab;
  operations: MyHistoryOperations;
  attempt: number;
};
type Result = {
  scope: Scope;
  history: MyHistory | null;
  error: string | null;
  forbidden: boolean;
  /** The tab has no server API yet, so retrying cannot help. */
  notConnected?: boolean;
};

const notConnected = (error: unknown) =>
  error instanceof Error && error.name === "MyHistoryNotConnectedError";

function errorMessage(error: unknown) {
  if (notConnected(error)) {
    return "작성한 글 목록은 아직 준비 중이에요. 내가 쓴 모집글은 모집글 목록에서 확인할 수 있어요.";
  }
  if (error instanceof Error && error.name === "InvalidMyHistoryData") {
    return "내 이력 정보를 확인할 수 없어요. 다시 불러와 주세요.";
  }
  return "내 이력을 불러오지 못했어요. 네트워크를 확인한 후 다시 시도해 주세요.";
}

export function useMyHistory(tab: MyTab, operations: MyHistoryOperations) {
  const { handleUnauthorized } = useAuth();
  const [attempt, setAttempt] = useState(0);
  const scope = useMemo(
    () => ({ tab, operations, attempt }),
    [tab, operations, attempt],
  );
  const [result, setResult] = useState<Result | null>(null);
  const activeScope = useRef<Scope | null>(null);
  const sequence = useRef(0);
  const clock = useRef({ serverMs: 0, observedAt: 0 });
  const [nowMs, setNowMs] = useState(0);

  const serverNow = useCallback(
    () => clock.current.serverMs + performance.now() - clock.current.observedAt,
    [],
  );

  const read = useCallback(
    async (foreground: boolean): Promise<MyHistory> => {
      if (activeScope.current !== scope)
        throw new Error("이전 이력 요청입니다.");
      const requestId = ++sequence.current;
      const current = () =>
        activeScope.current === scope && requestId === sequence.current;
      try {
        const history = toMyHistory(await operations.list(tab), tab);
        if (!current()) throw new Error("이전 이력 요청입니다.");
        clock.current = {
          serverMs: Date.parse(history.serverTime),
          observedAt: performance.now(),
        };
        setNowMs(clock.current.serverMs);
        setResult({ scope, history, error: null, forbidden: false });
        return history;
      } catch (error) {
        if (current()) {
          if (error instanceof ApiError && error.status === 401) {
            setResult({ scope, history: null, error: null, forbidden: false });
            handleUnauthorized();
          } else if (error instanceof ApiError && error.status === 403) {
            setResult({ scope, history: null, error: null, forbidden: true });
          } else if (foreground) {
            setResult({
              scope,
              history: null,
              error: errorMessage(error),
              forbidden: false,
              notConnected: notConnected(error),
            });
          }
        }
        throw error;
      }
    },
    [scope, operations, tab, handleUnauthorized],
  );

  useEffect(() => {
    activeScope.current = scope;
    void read(true).catch(() => {});
    return () => {
      activeScope.current = null;
      sequence.current += 1;
    };
  }, [read, scope]);

  const current = result?.scope === scope ? result : null;
  const history = current?.history ?? null;

  useEffect(() => {
    if (!history) return;
    // The card's relative dates also change at midnight on the server clock.
    let boundary =
      (Math.floor((nowMs + SEOUL_OFFSET_MS) / DAY_MS) + 1) * DAY_MS -
      SEOUL_OFFSET_MS;
    for (const item of history.content) {
      if (item.status === "REMOVED") continue;
      const referenceMs = Date.parse(item.referenceTime);
      const deadline = participationDeadlineMs(item);
      if (nowMs < deadline) boundary = Math.min(boundary, deadline);
      else if (nowMs < referenceMs) boundary = Math.min(boundary, referenceMs);
    }
    if (!Number.isFinite(boundary)) return;
    const timer = window.setTimeout(
      () => setNowMs(serverNow()),
      Math.min(Math.max(0, boundary - serverNow()), 2_147_483_647),
    );
    return () => window.clearTimeout(timer);
  }, [history, nowMs, serverNow]);

  const markCancelled = useCallback(
    (id: string) => {
      if (activeScope.current !== scope) return;
      sequence.current += 1;
      setResult((previous) => {
        if (previous?.scope !== scope || !previous.history) return previous;
        return {
          ...previous,
          history: {
            ...previous.history,
            content: previous.history.content.map((item) =>
              item.id === id && item.relation === "JOINED"
                ? { ...item, relation: "CANCELLED" }
                : item,
            ),
          },
        };
      });
    },
    [scope],
  );

  const refresh = useCallback(() => read(false), [read]);
  const recheck = useCallback(() => void read(true).catch(() => {}), [read]);

  const applyLatest = useCallback(
    (id: string, latest: LatestPublicState) => {
      if (activeScope.current !== scope) return;
      sequence.current += 1;
      const changes = Object.fromEntries(
        Object.entries(latest).filter(([, value]) => value !== undefined),
      ) as LatestPublicState;
      setResult((previous) => {
        if (previous?.scope !== scope || !previous.history) return previous;
        return {
          ...previous,
          history: {
            ...previous.history,
            content: previous.history.content.map((item) => {
              if (item.id !== id || item.status === "REMOVED") return item;
              const status = changes.status ?? item.status;
              if (status === "REMOVED")
                return { id, status, relation: item.relation };
              const next = { ...item, ...changes, status };
              if (next.currentMemberCount > next.capacity) return item;
              if (next.status === "CANCELLED" || next.status === "FINISHED")
                delete next.communicationUrl;
              return next;
            }),
          },
        };
      });
    },
    [scope],
  );

  return {
    history,
    loading: current === null,
    error: current?.error ?? null,
    forbidden: current?.forbidden ?? false,
    notConnected: current?.notConnected ?? false,
    nowMs,
    serverNow,
    retry: () => setAttempt((value) => value + 1),
    refresh,
    recheck,
    markCancelled,
    applyLatest,
  };
}
