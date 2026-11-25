"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { postStatusLabel, type PostSummary } from "./posts";
import styles from "./posts.module.css";
import { useAppPath } from "@/features/demo/AppProviders";
import { ClockIcon, DeliveryArt, TaxiArt } from "@/features/ui/art";
import { dayLabel, formatDate } from "@/lib/dateFormat";

const timeFormat = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const noSubscribe = () => () => {};

/**
 * Refresh relative dates at Seoul midnight and when a suspended page resumes.
 * Server render and hydration get null so words like "오늘" never mismatch.
 */
export function useClientNow(): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const schedule = () =>
      window.setTimeout(
        refresh,
        86_400_000 - ((Date.now() + 9 * 3_600_000) % 86_400_000),
      );
    let timer = schedule();
    function refresh() {
      window.clearTimeout(timer);
      setNow(Date.now());
      timer = schedule();
    }
    function resume() {
      if (document.visibilityState === "visible") refresh();
    }
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", resume);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", resume);
    };
  }, []);
  return useSyncExternalStore(
    noSubscribe,
    () => now,
    () => null,
  );
}

/** "오늘", "내일", "모레" or "11/16 (월)"; the plain date until `now` is known. */
export function postDayText(time: number, now: number | null): string {
  return now === null ? formatDate(time) : dayLabel(time, now);
}

/** Keeps "1번 출구" (and "7번출구"-like pairs) on one line. */
const keepExit = (place: string) =>
  place.replace(/(\d+번)\s+(출구)/g, "$1\u00a0$2");

/*
 * One pod on the board, three bands on a white card:
 *   top    — the type tile and the place (taxi: 출발 → 도착, wrapping
 *            naturally; delivery: the restaurant over a small 수령 line)
 *   middle — a light green band: clock + time on the left, a pale yellow
 *            seats badge on the right, a faint rule between them
 *   bottom — a thin rule, then 유형 · 모집 상태 · 작성자 on one line
 * The whole card is one link. The post form's preview renders the same card
 * without the link (`preview`).
 */
export function PostCard({
  post,
  now,
  preview = false,
  hideStatus = false,
  statusNow,
}: {
  post: PostSummary;
  /**
   * Server-aligned time from the list. With it the status follows the cutoff
   * and T the way the detail page does; without it, the saved status stays.
   */
  statusNow?: number | null;
  /** Current time from the list screen; the card reads its own otherwise. */
  now?: number | null;
  /** Form preview: the same card as a plain block, not a link. */
  preview?: boolean;
  /** Edit preview: the saved status is not known here, so leave it out. */
  hideStatus?: boolean;
}) {
  const path = useAppPath();
  const ownNow = useClientNow();
  const clock = now === undefined ? ownNow : now;
  // The device clock only supplies relative date text below; the status
  // moves only with the list's server-aligned clock.
  const { label, reason, available } = postStatusLabel(
    post,
    statusNow ?? undefined,
  );
  const reference = Date.parse(post.referenceTime);
  const remaining = post.capacity - post.currentMemberCount;
  const taxi = post.type === "TAXI";
  const day = postDayText(reference, clock);
  const joined = post.viewerJoined === true && label !== "삭제된 모집";
  // Closed cards keep the band; the badge then names why, if the status
  // line below does not already say it.
  const badge = available
    ? `${remaining}자리 남음`
    : reason && reason !== label
      ? reason
      : null;

  const body = (
    <>
      <span className={styles.cardTop}>
        <span className={styles.sticker}>
          {taxi ? <TaxiArt /> : <DeliveryArt />}
        </span>
        <span className={styles.cardHead}>
          {taxi ? (
            <span className={styles.cardTitle}>
              {keepExit(post.departure ?? "")}
              <span className={styles.srOnly}>에서</span>
              {"\u00a0"}
              <span className={styles.arrow} aria-hidden="true">
                →
              </span>{" "}
              {keepExit(post.destination ?? "")}
              <span className={styles.srOnly}>까지</span>
            </span>
          ) : (
            <span className={styles.cardTitle}>{post.restaurantName}</span>
          )}
          {!taxi && (
            <span className={styles.pickup}>
              <span className={styles.srOnly}>, </span>
              수령 · {keepExit(post.pickupLocation ?? "")}
            </span>
          )}
        </span>
      </span>
      <span className={styles.timeBand}>
        <span className={styles.when}>
          <ClockIcon className={styles.whenIcon} />
          <span>
            {day} {timeFormat.format(reference)} {taxi ? "출발" : "주문 마감"}
          </span>
        </span>
        {badge && (
          <span
            className={styles.seats}
            data-last={available && remaining === 1}
            data-closed={!available}
          >
            <span className={styles.srOnly}>, </span>
            {badge}
          </span>
        )}
      </span>
      <span className={styles.cardMeta}>
        <span className={styles.chip}>{taxi ? "택시" : "배달"}</span>
        {!hideStatus && (
          <>
            <span className={styles.dot} aria-hidden="true">
              ·
            </span>
            <span className={styles.status}>{label}</span>
          </>
        )}
        {joined && <span className={styles.joinedChip}>참여 중</span>}
        {post.authorName && (
          <>
            <span className={styles.dot} aria-hidden="true">
              ·
            </span>
            <span className={styles.author}>
              <span className={styles.srOnly}>작성자 </span>
              {post.authorName}
            </span>
          </>
        )}
      </span>
    </>
  );

  if (preview) {
    return (
      <div
        className={styles.card}
        data-available={available}
        data-type={taxi ? "taxi" : "delivery"}
        data-preview="true"
      >
        {body}
      </div>
    );
  }
  return (
    <Link
      href={path(`/posts/${encodeURIComponent(post.id)}`)}
      className={styles.card}
      data-post-id={post.id}
      data-available={available}
      data-type={taxi ? "taxi" : "delivery"}
    >
      {body}
    </Link>
  );
}
