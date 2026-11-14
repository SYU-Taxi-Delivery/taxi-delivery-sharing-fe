"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getParticipationAvailability,
  hideUnavailableDetails,
  participationDeadlineMs,
  ParticipationRejected,
  REJECTION_MESSAGES,
  withLatestState,
  type ParticipationSnapshot,
} from "./participation";

// UI callbacks; the authentication, URI and response DTO belong to the API adapter.
export type ParticipationOperations = {
  join: () => Promise<void>;
  cancel: () => Promise<void>;
  refresh: () => Promise<ParticipationSnapshot>;
};

type Action = "join" | "cancel";

const requestName = (action: Action) =>
  action === "join" ? "참여 신청이" : "참여 취소가";
type Feedback = {
  tone: "success" | "error";
  message: string;
  reason?: string | null;
} | null;
type Outcome = {
  action: Action;
  confirmed: boolean;
  /** The server's own reason for refusing, shown instead of a generic line. */
  rejected?: string;
};
/** Set only after the join/cancel request itself succeeded; id changes per success. */
export type ParticipationMotion = { action: Action; id: number } | null;

export function useParticipation(
  initialSnapshot: ParticipationSnapshot,
  operations: ParticipationOperations,
) {
  const [snapshot, setSnapshot] = useState(() =>
    hideUnavailableDetails(initialSnapshot),
  );
  const [busy, setBusy] = useState(false);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const needsRefreshRef = useRef(false);
  // A focus/visibility recheck in flight; a click arriving meanwhile waits for it.
  const refreshing = useRef<Promise<void> | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [motion, setMotion] = useState<ParticipationMotion>(null);
  const snapshotRef = useRef(snapshot);
  const operationsRef = useRef(operations);
  const mounted = useRef(true);
  const locked = useRef(false);
  const sequence = useRef(0);
  const [initialClock] = useState(() => ({
    serverMs: Date.parse(initialSnapshot.serverTime),
    observedAt: performance.now(),
  }));
  const clock = useRef(initialClock);
  const [nowMs, setNowMs] = useState(initialClock.serverMs);

  useEffect(() => {
    operationsRef.current = operations;
  }, [operations]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      sequence.current += 1;
    };
  }, []);

  const serverNow = useCallback(
    () => clock.current.serverMs + performance.now() - clock.current.observedAt,
    [],
  );

  useEffect(() => {
    const referenceMs = Date.parse(snapshot.referenceTime);
    const deadline = participationDeadlineMs({
      referenceTime: snapshot.referenceTime,
      participationDeadline: snapshot.participationDeadline,
    });
    const boundary = nowMs < deadline ? deadline : referenceMs;
    const remaining = boundary - serverNow();
    if (!Number.isFinite(remaining) || nowMs >= referenceMs) return;
    const timer = window.setTimeout(
      () => {
        const now = serverNow();
        const visible = hideUnavailableDetails(snapshotRef.current, now);
        snapshotRef.current = visible;
        setSnapshot(visible);
        setNowMs(now);
      },
      Math.min(Math.max(0, remaining), 2_147_483_647),
    );
    return () => window.clearTimeout(timer);
  }, [
    snapshot.referenceTime,
    snapshot.participationDeadline,
    snapshot.serverTime,
    nowMs,
    serverNow,
  ]);

  const readLatest = useCallback(
    async (requestId: number, outcome?: Outcome) => {
      const current = () => mounted.current && sequence.current === requestId;
      try {
        const latest = await operationsRef.current.refresh();
        if (!current()) return;
        if (latest.postId !== snapshotRef.current.postId) {
          throw new Error("조회 대상이 일치하지 않습니다.");
        }
        const visible = hideUnavailableDetails(latest);
        snapshotRef.current = visible;
        clock.current = {
          serverMs: Date.parse(latest.serverTime),
          observedAt: performance.now(),
        };
        setSnapshot(visible);
        setNowMs(clock.current.serverMs);
        needsRefreshRef.current = false;
        setNeedsRefresh(false);
        if (outcome?.confirmed) {
          setFeedback({
            tone: "success",
            message:
              outcome.action === "join"
                ? "참여 신청이 완료됐어요."
                : "내 참여가 취소됐어요.",
          });
        } else if (outcome) {
          const relationMatches =
            visible.viewerRelation ===
            (outcome.action === "join" ? "JOINED" : "CANCELLED");
          const reason = relationMatches
            ? null
            : getParticipationAvailability(visible, clock.current.serverMs)
                .reason;
          setFeedback({
            tone: "error",
            reason,
            message: relationMatches
              ? outcome.action === "join"
                ? "현재 이 모집에 참여 중이에요. 최신 참여 상태를 확인했어요."
                : "현재 내 참여가 취소된 상태예요. 최신 참여 상태를 확인했어요."
              : outcome.rejected
                ? `${outcome.rejected} ${requestName(outcome.action)} 처리되지 않았어요.`
                : reason
                  ? `${requestName(outcome.action)} 처리되지 않았어요. 최신 상태를 확인했어요.`
                  : "요청 완료를 확인하지 못했어요. 최신 상태를 확인한 후 다시 시도해 주세요.",
          });
        } else {
          setFeedback(null);
        }
      } catch {
        if (!current()) return;
        needsRefreshRef.current = true;
        setNeedsRefresh(true);
        setFeedback({
          tone: "error",
          message: outcome?.confirmed
            ? `${outcome.action === "join" ? "참여 신청은 완료됐지만" : "내 참여는 취소됐지만"} 최신 정보를 확인하지 못했어요. 다시 조회해 주세요.`
            : "최신 참여 상태를 확인하지 못했어요. 다시 조회한 후 이용해 주세요.",
        });
      } finally {
        if (current()) {
          locked.current = false;
          setBusy(false);
        }
      }
    },
    [],
  );

  const reload = useCallback(
    async (silent: boolean) => {
      if (locked.current || !mounted.current) return;
      locked.current = true;
      // A background recheck keeps the buttons usable; a click waits for it.
      if (!silent) setBusy(true);
      const latest = readLatest(++sequence.current);
      refreshing.current = latest;
      try {
        await latest;
      } finally {
        if (refreshing.current === latest) refreshing.current = null;
      }
    },
    [readLatest],
  );

  const refresh = useCallback(() => reload(false), [reload]);

  useEffect(() => {
    const recheck = () => {
      if (document.visibilityState === "visible") void reload(true);
    };
    window.addEventListener("focus", recheck);
    document.addEventListener("visibilitychange", recheck);
    return () => {
      window.removeEventListener("focus", recheck);
      document.removeEventListener("visibilitychange", recheck);
    };
  }, [reload]);

  const mutate = useCallback(
    async (action: Action) => {
      // Clicking back into the window fires focus first; finish that recheck
      // instead of silently dropping the click.
      if (refreshing.current) await refreshing.current;
      if (locked.current || !mounted.current || needsRefreshRef.current) return;
      const availability = getParticipationAvailability(
        snapshotRef.current,
        serverNow(),
      );
      const allowed =
        action === "cancel"
          ? availability.action === "cancel"
          : availability.action === "join" || availability.action === "rejoin";
      if (!allowed) {
        setNowMs(serverNow());
        setFeedback({
          tone: "error",
          reason: availability.reason,
          message: availability.reason
            ? `모집 상태가 바뀌어 ${action === "cancel" ? "참여 취소를" : "참여 신청을"} 보내지 않았어요.`
            : "현재 요청할 수 없는 참여 상태예요.",
        });
        return;
      }
      locked.current = true;
      const requestId = ++sequence.current;
      setBusy(true);
      setFeedback(null);
      setMotion(null);
      let confirmed = false;
      let rejected: ParticipationRejected | null = null;
      try {
        await operationsRef.current[action]();
        confirmed = true;
      } catch (error) {
        // A lost or malformed response does not prove that the write failed;
        // only a refusal with a known reason does.
        if (error instanceof ParticipationRejected) rejected = error;
      }
      if (!mounted.current || sequence.current !== requestId) return;
      const reason = rejected && REJECTION_MESSAGES[rejected.code];
      if (rejected?.latest && reason) {
        // The refusal carries the post's latest state: show it right away
        // instead of asking the server again.
        const now = serverNow();
        const latest = hideUnavailableDetails(
          withLatestState(snapshotRef.current, rejected.latest),
          now,
        );
        snapshotRef.current = latest;
        setSnapshot(latest);
        setNowMs(now);
        setFeedback({
          tone: "error",
          message: `${reason} ${requestName(action)} 처리되지 않았어요.`,
          reason: getParticipationAvailability(latest, now).reason,
        });
        locked.current = false;
        setBusy(false);
        return;
      }
      // The celebration never waits on, or delays, the refresh below.
      if (confirmed) setMotion({ action, id: requestId });
      if (confirmed && action === "cancel") {
        const cancelled = hideUnavailableDetails({
          ...snapshotRef.current,
          viewerRelation: "CANCELLED",
        });
        snapshotRef.current = cancelled;
        setSnapshot(cancelled);
      }
      await readLatest(requestId, {
        action,
        confirmed,
        ...(reason ? { rejected: reason } : {}),
      });
    },
    [readLatest, serverNow],
  );

  return {
    snapshot,
    nowMs,
    serverNow,
    availability: getParticipationAvailability(snapshot, nowMs),
    busy,
    needsRefresh,
    feedback,
    motion,
    join: () => mutate("join"),
    cancel: () => mutate("cancel"),
    refresh,
  };
}

export type ParticipationController = ReturnType<typeof useParticipation>;
