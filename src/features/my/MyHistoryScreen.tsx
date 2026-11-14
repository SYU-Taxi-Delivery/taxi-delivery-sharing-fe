"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useId, useState } from "react";
import { AccessDenied, RequireAuth } from "@/features/auth/RequireAuth";
import { AppShell } from "@/features/posts/AppShell";
import common from "@/features/posts/posts.module.css";
import {
  pastReason,
  splitMyHistory,
  type MyHistory,
  type MyHistoryOperations,
  type MyTab,
} from "./myHistory";
import { myHistoryOperations } from "./myHistoryApi";
import {
  MyHistoryCard,
  MyHistoryRow,
  type LiveHistoryItem,
} from "./MyHistoryCard";
import { ParticipationCancellation } from "./ParticipationCancellation";
import { useMyHistory } from "./useMyHistory";
import styles from "./my.module.css";
import { useAppPath } from "@/features/demo/AppProviders";
import { SpotArt } from "@/features/ui/SpotArt";
import { InfoIcon } from "@/features/ui/art";

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
    <AppShell current="my" wide>
      {/* Title + subtitle on the left, 모집글 쓰기 on the right of the same
          row; everything after spans the full width (my.module.css .page). */}
      <div className={styles.page}>
        <div className={styles.pageTitle}>
          <h1 className={common.title}>내 참여 · 모집</h1>
          <p className={common.lead}>참여한 글·작성한 글 관리</p>
        </div>
        <RequireAuth loginLabel="로그인하고 내 내역 보기">
          <Link
            href={path("/posts/new")}
            className={`${common.headingCta} ${styles.writeCta}`}
          >
            <Image src="/my/plus.svg" width={16} height={16} alt="" /> 모집글
            쓰기
          </Link>
          <History
            key={tab}
            tab={tab}
            basePath={basePath}
            operations={operations}
          />
        </RequireAuth>
      </div>
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
    notConnected,
    nowMs,
    serverNow,
    retry,
    refresh,
    recheck,
    markCancelled,
    applyLatest,
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
    if (selected || loading || notConnected) return;
    const recheckWhenVisible = () => {
      if (document.visibilityState === "visible") recheck();
    };
    window.addEventListener("focus", recheckWhenVisible);
    document.addEventListener("visibilitychange", recheckWhenVisible);
    return () => {
      window.removeEventListener("focus", recheckWhenVisible);
      document.removeEventListener("visibilitychange", recheckWhenVisible);
    };
  }, [selected, loading, notConnected, recheck]);

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
        <span className={styles.tabThumb} aria-hidden="true" />
      </nav>
      {selected && !forbidden && (
        <ParticipationCancellation
          key={`${selected.item.id}:${selected.attempt}`}
          item={selected.item}
          serverTime={selected.serverTime}
          operations={operations}
          refresh={refresh}
          onCancelled={markCancelled}
          onLatest={applyLatest}
          onUnavailable={clearSelection}
          onBlockedChange={setBlocked}
          restoreFocus={selected.restoreFocus}
        />
      )}
      <div aria-busy={loading}>
        {loading ? (
          <p role="status" className={common.state}>
            이력을 불러오고 있어요.
          </p>
        ) : forbidden ? (
          <AccessDenied />
        ) : error ? (
          <div className={common.state}>
            {notConnected ? (
              <>
                <p role="status">{error}</p>
                <Link href={path("/posts")} className={styles.button}>
                  모집글 목록 보기
                </Link>
              </>
            ) : (
              <>
                <p role="alert">{error}</p>
                <button type="button" className={styles.button} onClick={retry}>
                  다시 시도
                </button>
              </>
            )}
          </div>
        ) : history && history.content.length > 0 ? (
          <Groups
            tab={tab}
            history={history}
            nowMs={nowMs}
            busy={blocked}
            onCancel={(item, trigger) => {
              setSelection((previous) => ({
                item,
                operations,
                serverTime: new Date(serverNow()).toISOString(),
                attempt: (previous?.attempt ?? 0) + 1,
                // A cancelled card moves to 지난 이력, so the row is looked
                // up again by id when focus comes back.
                restoreFocus: () => {
                  if (trigger.isConnected && !trigger.disabled) trigger.focus();
                  else
                    document
                      .querySelector<HTMLElement>(
                        `[data-history-id="${CSS.escape(item.id)}"]`,
                      )
                      ?.focus();
                },
              }));
            }}
          />
        ) : (
          <div className={common.state}>
            <SpotArt />
            <p role="status">
              {tab === "created"
                ? "아직 작성한 모집이 없어요."
                : "아직 참여한 모집이 없어요."}
            </p>
            <Link
              href={path(tab === "created" ? "/posts/new" : "/posts")}
              className={styles.button}
            >
              {tab === "created" ? "모집글 쓰기" : "모집 둘러보기"}
            </Link>
          </div>
        )}
      </div>
      <aside className={styles.help}>
        <span className={styles.helpIcon} aria-hidden="true">
          <InfoIcon />
        </span>
        <div>
          <p>참여 취소: 각 카드에 표시된 참여 취소 기한까지 가능해요.</p>
          <p>
            작성한 글은 상세 화면의 &lsquo;내 모집글 관리&rsquo;에서 관리해요.
          </p>
          <Link href={path("/posts")}>모집글 목록으로</Link>
        </div>
      </aside>
    </>
  );
}

function Groups({
  tab,
  history,
  nowMs,
  busy,
  onCancel,
}: {
  tab: MyTab;
  history: MyHistory;
  nowMs: number;
  busy: boolean;
  onCancel: (item: LiveHistoryItem, trigger: HTMLButtonElement) => void;
}) {
  const path = useAppPath();
  const upcomingId = useId();
  const pastId = useId();
  const { upcoming, past } = splitMyHistory(history.content, nowMs);
  return (
    <>
      <section className={styles.group} aria-labelledby={upcomingId}>
        <h2 id={upcomingId} className={styles.groupTitle}>
          다가오는 일정{" "}
          <span className={styles.count}>
            {upcoming.length}
            <span className={styles.srOnly}>건</span>
          </span>
        </h2>
        {upcoming.length > 0 ? (
          <ul className={styles.list}>
            {upcoming.map((item) => (
              <li key={item.id} tabIndex={-1} data-history-id={item.id}>
                <MyHistoryCard
                  item={item}
                  serverTime={history.serverTime}
                  nowMs={nowMs}
                  busy={busy}
                  onCancel={(trigger) => onCancel(item, trigger)}
                />
              </li>
            ))}
          </ul>
        ) : (
          <div className={styles.groupEmpty}>
            <p>다가오는 일정이 없어요.</p>
            <Link
              href={path(tab === "created" ? "/posts/new" : "/posts")}
              className={styles.button}
            >
              {tab === "created" ? "모집글 쓰기" : "모집 둘러보기"}
            </Link>
          </div>
        )}
      </section>
      {past.length > 0 && (
        <section className={styles.group} aria-labelledby={pastId}>
          <h2 id={pastId} className={styles.groupTitle}>
            지난 이력{" "}
            <span className={styles.count}>
              {past.length}
              <span className={styles.srOnly}>건</span>
            </span>
          </h2>
          <ul className={styles.rows}>
            {past.map((item) => (
              <li key={item.id} tabIndex={-1} data-history-id={item.id}>
                <MyHistoryRow
                  item={item}
                  reason={pastReason(item, nowMs) ?? "FINISHED"}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
