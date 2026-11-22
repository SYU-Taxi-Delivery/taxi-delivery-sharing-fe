"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { postStatusLabel, type PostSummary } from "./posts";
import styles from "./posts.module.css";
import { useAppPath } from "@/features/demo/AppProviders";
import { DeliveryArt, TaxiArt } from "@/features/ui/art";
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

/*
 * One pod on the board, read top-down the same way as 내 참여 cards:
 *   ① when (left) · seats left (right)
 *   ② the route on two lines (출발 → 도착) or the restaurant
 *   ③ the delivery pickup place
 *   ④ type · status (left) · author (right), small and grey, at the bottom
 * The whole row is one link. The post form's preview renders the same card
 * without the link (`preview`).
 */
export function PostCard({
  post,
  now,
  preview = false,
  hideStatus = false,
  hideType = false,
  showDay = true,
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
  /** A type tab is on: the icon already says it, so drop the word. */
  hideType?: boolean;
  /** A day heading above already says "오늘"; then only the time shows. */
  showDay?: boolean;
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
  const typeWord = taxi ? "택시" : "배달";

  const body = (
    <>
      <span className={styles.sticker}>
        {taxi ? <TaxiArt /> : <DeliveryArt />}
      </span>
      <span className={styles.cardBody}>
        <span className={styles.facts}>
          <span className={styles.when}>
            {showDay ? `${day} ` : ""}
            {timeFormat.format(reference)}{" "}
            <span className={styles.whenVerb}>
              {taxi ? "출발" : "주문 마감"}
            </span>
          </span>
          {available ? (
            <span className={styles.seats} data-last={remaining === 1}>
              {remaining}자리 남음
            </span>
          ) : (
            // The status in the bottom line already says it; add only detail.
            reason &&
            reason !== label && <span className={styles.reason}>{reason}</span>
          )}
        </span>
        <span className={styles.cardHead}>
          {taxi ? (
            <span className={styles.cardTitle} data-route="true">
              <span className={styles.stop}>
                <span className={styles.srOnly}>출발 </span>
                {post.departure}
                <span className={styles.srOnly}>에서</span>
              </span>
              <span className={styles.stop} data-end="true">
                <span className={styles.srOnly}>도착 </span>
                {post.destination}
                <span className={styles.srOnly}>까지</span>
              </span>
            </span>
          ) : (
            <span className={styles.cardTitle}>{post.restaurantName}</span>
          )}
          {!taxi && (
            <span className={styles.pickup}>
              <span className={styles.srOnly}>, </span>
              수령 · {post.pickupLocation}
            </span>
          )}
        </span>
        <span className={styles.cardMeta}>
          <span className={styles.metaMain}>
            {hideType ? (
              <span className={styles.srOnly}>{typeWord}, </span>
            ) : (
              <>
                <span className={styles.chip}>{typeWord}</span>
                {!hideStatus && <span aria-hidden="true">·</span>}
              </>
            )}
            {!hideStatus && <span className={styles.status}>{label}</span>}
            {joined && <span className={styles.joinedChip}>참여 중</span>}
          </span>
          {post.authorName && (
            <span className={styles.author}>
              <span className={styles.srOnly}>, 작성자 </span>
              {post.authorName}
            </span>
          )}
        </span>
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
