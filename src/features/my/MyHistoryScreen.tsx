"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AccessDenied, RequireAuth } from "@/features/auth/RequireAuth";
import { AppShell } from "@/features/posts/AppShell";
import common from "@/features/posts/posts.module.css";
import type { MyHistoryOperations, MyTab } from "./myHistory";
import { myHistoryOperations } from "./myHistoryApi";
import { MyHistoryCard, type LiveHistoryItem } from "./MyHistoryCard";
import { ParticipationCancellation } from "./ParticipationCancellation";
import { useMyHistory } from "./useMyHistory";
import styles from "./my.module.css";
import { useAppPath } from "@/features/demo/AppProviders";

const tabs: { tab: MyTab; label: string }[] = [
  { tab: "participated", label: "참여한 글" },
  { tab: "created", label: "작성한 글" },
];

export function MyHistoryScreen({
  tab,
  basePath = "/my",
  operations = myHistoryOperations,
}: {
  tab: MyTab;
  basePath?: string;
  operations?: MyHistoryOperations;
}) {
  const path = useAppPath();
  return (
    <AppShell current="my">
      <h1 className={common.title}>내 참여 · 모집</h1>
      <p className={`${common.muted} mt-1`}>참여한 글·작성한 글 관리</p>
      <RequireAuth loginLabel="로그인하고 내 내역 보기">
        <Link href={path("/posts/new")} className={common.cta}>
          <Image src="/my/plus.svg" width={18} height={18} alt="" /> 모집글 쓰기
        </Link>
        <History
          key={tab}
          tab={tab}
          basePath={basePath}
          operations={operations}
        />
      </RequireAuth>
    </AppShell>
  );
}

function History({
  tab,
  basePath,
  operations,
}: {
  tab: MyTab;
  basePath: string;
  operations: MyHistoryOperations;
}) {
  const path = useAppPath();
  const {
    history,
    loading,
    error,
    forbidden,
    nowMs,
    serverNow,
    retry,
    refresh,
    markCancelled,
  } = useMyHistory(tab, operations);
  const [selection, setSelection] = useState<{
    item: LiveHistoryItem;
    serverTime: string;
    operations: MyHistoryOperations;
    attempt: number;
    restoreFocus: () => void;
  } | null>(null);
  const [blocked, setBlocked] = useState(false);
  const selected = selection?.operations === operations ? selection : null;
  const clearSelection = useCallback(() => setSelection(null), []);

  useEffect(() => {
    if (selected) return;
    let active = true;
    const recheck = () => {
      if (document.visibilityState === "visible")
        void refresh().catch(() => {
          if (active) retry();
        });
    };
    window.addEventListener("focus", recheck);
    document.addEventListener("visibilitychange", recheck);
    return () => {
      active = false;
      window.removeEventListener("focus", recheck);
      document.removeEventListener("visibilitychange", recheck);
    };
  }, [selected, refresh, retry]);

  return (
    <>
      <nav className={styles.tabs} aria-label="내 이력">
        {tabs.map((entry) => (
          <Link
            key={entry.tab}
            href={path(
              entry.tab === "participated"
                ? basePath
                : `${basePath}?tab=created`,
            )}
            scroll={false}
            className={styles.tab}
            aria-current={entry.tab === tab ? "page" : undefined}
          >
            {entry.label}
          </Link>
        ))}
      </nav>
      {selected && !forbidden && (
        <ParticipationCancellation
          key={`${selected.item.id}:${selected.attempt}`}
          item={selected.item}
          serverTime={selected.serverTime}
          operations={operations}
          refresh={refresh}
          onCancelled={markCancelled}
          onUnavailable={clearSelection}
          onBlockedChange={setBlocked}
          restoreFocus={selected.restoreFocus}
        />
      )}
      <section
        aria-label={`${tab === "created" ? "작성한" : "참여한"} 모집 이력`}
        aria-busy={loading}
      >
        {loading ? (
          <p role="status" className={common.state}>
            이력을 불러오고 있어요.
          </p>
        ) : forbidden ? (
          <AccessDenied />
        ) : error ? (
          <div className={common.state}>
            <p role="alert">{error}</p>
            <button type="button" className={styles.button} onClick={retry}>
              다시 불러오기
            </button>
          </div>
        ) : history && history.content.length > 0 ? (
          <ul className={styles.list}>
            {history.content.map((item) => (
              <li key={item.id} tabIndex={-1}>
                {item.status === "REMOVED" ? (
                  <p className={styles.tombstone}>관리자에 의해 삭제된 모집</p>
                ) : (
                  <MyHistoryCard
                    item={item}
                    serverTime={history.serverTime}
                    nowMs={nowMs}
                    busy={blocked}
                    onCancel={(trigger) => {
                      const row = trigger.closest("li");
                      setSelection((previous) => ({
                        item,
                        operations,
                        serverTime: new Date(serverNow()).toISOString(),
                        attempt: (previous?.attempt ?? 0) + 1,
                        restoreFocus: () => {
                          if (trigger.isConnected && !trigger.disabled)
                            trigger.focus();
                          else row?.focus();
                        },
                      }));
                    }}
                  />
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div className={common.state}>
            <p role="status">
              {tab === "created"
                ? "아직 작성한 모집이 없어요."
                : "아직 참여한 모집이 없어요."}
            </p>
            <Link
              href={path(tab === "created" ? "/posts/new" : "/posts")}
              className={styles.button}
            >
              {tab === "created" ? "모집글 쓰기" : "모집글 둘러보기"}
            </Link>
          </div>
        )}
      </section>
      <aside className={styles.help}>
        <Image src="/my/info.svg" width={20} height={20} alt="" />
        <div>
          <p>참여 취소: 각 카드에 표시된 참여 취소 기한까지 가능해요.</p>
          <p>작성한 글의 상세에서 수정·모집 마감·모집 취소가 가능해요.</p>
          <Link href={path("/posts")}>모집글 목록으로</Link>
        </div>
      </aside>
    </>
  );
}
