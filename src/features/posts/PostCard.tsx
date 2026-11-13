"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { postStatusLabel, type PostSummary } from "./posts";
import styles from "./posts.module.css";
import { useAppPath } from "@/features/demo/AppProviders";
import { BagArt, TaxiArt } from "@/features/ui/art";
import { dayLabel, formatDate } from "@/lib/dateFormat";

const timeFormat = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const noSubscribe = () => () => {};

/**
 * The browser's clock, read once per mount. Server render and hydration get
 * null (so relative words like "오늘" never mismatch the server HTML); the
 * client re-renders with the real time right after.
 */
export function useClientNow(): number | null {
  const [now] = useState(() => Date.now());
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
 * One pod on the board, read top-down on a phone: where (route or
 * restaurant), then when + seats left side by side, then type · status ·
 * author in small grey text. The whole row is one link. The post form's
 * preview renders the same card without the link (`preview`).
 */
export function PostCard({
  post,
  now,
  preview = false,
  hideStatus = false,
}: {
  post: PostSummary;
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
  const { label, reason, available } = postStatusLabel(
    post,
    clock ?? undefined,
  );
  const reference = Date.parse(post.referenceTime);
  const remaining = post.capacity - post.currentMemberCount;
  const taxi = post.type === "TAXI";
  const day = postDayText(reference, clock);
  const joined = post.viewerJoined === true && label !== "삭제된 모집";

  const body = (
    <>
      <span className={styles.sticker}>{taxi ? <TaxiArt /> : <BagArt />}</span>
      <span className={styles.cardBody}>
        <span className={styles.cardTitle}>
          {taxi ? (
            <>
              {post.departure}
              <span className={styles.srOnly}>에서</span>
              <span className={styles.arrow} aria-hidden="true">
                {" → "}
              </span>
              {post.destination}
              <span className={styles.srOnly}>까지</span>
            </>
          ) : (
            <>
              {post.restaurantName}
              <span className={styles.arrow} aria-hidden="true">
                {" · "}
              </span>
              <span className={styles.srOnly}>, 수령 장소 </span>
              {post.pickupLocation}
            </>
          )}
        </span>
        <span className={styles.facts}>
          <span className={styles.when}>
            {day} {timeFormat.format(reference)} {taxi ? "출발" : "주문 마감"}
          </span>
          {available ? (
            <span className={styles.seats} data-last={remaining === 1}>
              {remaining}자리 남음
            </span>
          ) : (
            // The status in the line below already says it; add only detail.
            reason &&
            reason !== label && <span className={styles.reason}>{reason}</span>
          )}
        </span>
        <span className={styles.cardMeta}>
          <span className={styles.chip}>{taxi ? "택시" : "배달"}</span>
          {!hideStatus && (
            <>
              <span aria-hidden="true">·</span>
              <span className={styles.status}>{label}</span>
            </>
          )}
          {joined && <span className={styles.joinedChip}>참여 중</span>}
          {post.authorName && (
            <>
              <span aria-hidden="true">·</span>
              <span className={styles.author}>{post.authorName}</span>
            </>
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
