"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/features/auth/AuthProvider";
import { useParticipation } from "@/features/participation/useParticipation";
import { ConfirmDialog } from "@/features/posts/detail/ConfirmDialog";
import {
  toMySnapshot,
  type MyHistory,
  type MyHistoryOperations,
} from "./myHistory";
import type { LiveHistoryItem } from "./MyHistoryCard";
import styles from "./my.module.css";

/** One selected cancellation controller, rather than one subscription per card. */
export function ParticipationCancellation({
  item,
  serverTime,
  operations,
  refresh,
  onCancelled,
  onUnavailable,
  onBlockedChange,
  restoreFocus,
}: {
  item: LiveHistoryItem;
  serverTime: string;
  operations: MyHistoryOperations;
  refresh: () => Promise<MyHistory>;
  onCancelled: (id: string) => void;
  onUnavailable: () => void;
  onBlockedChange: (blocked: boolean) => void;
  restoreFocus: () => void;
}) {
  const { handleUnauthorized } = useAuth();
  const [open, setOpen] = useState(true);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const callbacks = useMemo(
    () => ({
      join: async () => {
        throw new Error("참여 신청은 상세 화면에서 진행해 주세요.");
      },
      cancel: async () => {
        try {
          await operations.leave(item.id);
        } catch (error) {
          if (
            mounted.current &&
            error instanceof ApiError &&
            error.status === 401
          )
            handleUnauthorized();
          throw error;
        }
        if (mounted.current) onCancelled(item.id);
      },
      refresh: async () => {
        const history = await refresh();
        const latest = history.content.find((entry) => entry.id === item.id);
        if (!latest || latest.status === "REMOVED") {
          if (mounted.current) onUnavailable();
          throw new Error("이 모집의 최신 참여 정보를 확인할 수 없습니다.");
        }
        return toMySnapshot(latest, history.serverTime);
      },
    }),
    [
      operations,
      item.id,
      refresh,
      onCancelled,
      onUnavailable,
      handleUnauthorized,
    ],
  );
  const participation = useParticipation(
    toMySnapshot(item, serverTime),
    callbacks,
  );
  useEffect(() => {
    onBlockedChange(participation.busy || participation.needsRefresh);
  }, [participation.busy, participation.needsRefresh, onBlockedChange]);
  useEffect(() => () => onBlockedChange(false), [onBlockedChange]);
  useEffect(() => {
    if (
      !participation.busy &&
      participation.feedback &&
      document.activeElement === document.body
    )
      restoreFocus();
  }, [participation.busy, participation.feedback, restoreFocus]);

  return (
    <>
      {participation.busy && (
        <p role="status" className={styles.notice}>
          참여 상태를 확인하고 있어요.
        </p>
      )}
      {participation.feedback && (
        <div className={styles.notice}>
          <p
            role={participation.feedback.tone === "error" ? "alert" : "status"}
          >
            {participation.feedback.message}
          </p>
          {participation.needsRefresh && (
            <button
              type="button"
              className={styles.button}
              disabled={participation.busy}
              onClick={() => void participation.refresh()}
            >
              다시 조회하기
            </button>
          )}
        </div>
      )}
      <ConfirmDialog
        open={open}
        title="내 참여를 취소할까요?"
        confirmLabel="참여 취소하기"
        danger
        onClose={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false);
          void participation.cancel();
        }}
      >
        <p>{participation.snapshot.title}</p>
        <p>
          취소하면 자리를 잃을 수 있어요. 참가자 명단과 소통 링크도 볼 수 없게
          돼요.
        </p>
      </ConfirmDialog>
    </>
  );
}
