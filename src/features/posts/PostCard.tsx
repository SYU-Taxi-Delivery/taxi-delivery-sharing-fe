"use client";

import Link from "next/link";
import { postStatusLabel, type PostSummary } from "./posts";
import styles from "./posts.module.css";
import { useAppPath } from "@/features/demo/AppProviders";
import { BagArt, ClockIcon, SeatSlots, TaxiArt } from "@/features/ui/art";
import { formatDate } from "@/lib/dateFormat";

const timeFormat = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/*
 * One pod on the board: a taxi or bag sticker, the route as two stops, the
 * time, and seat slots filled to the real headcount (the "n / m명" text stays
 * next to them). The whole row is one link.
 */
export function PostCard({ post }: { post: PostSummary }) {
  const path = useAppPath();
  const { label, reason, available } = postStatusLabel(post);
  const reference = Date.parse(post.referenceTime);
  const remaining = post.capacity - post.currentMemberCount;
  const taxi = post.type === "TAXI";

  return (
    <Link
      href={path(`/posts/${encodeURIComponent(post.id)}`)}
      className={styles.card}
      data-available={available}
      data-type={taxi ? "taxi" : "delivery"}
    >
      <span className={styles.sticker}>{taxi ? <TaxiArt /> : <BagArt />}</span>
      <span className={styles.cardBody}>
        <span className={styles.chips}>
          <span className={styles.chip}>{taxi ? "택시" : "배달"}</span>
          <span className={styles.status}>{label}</span>
        </span>
        <span className={styles.cardTitle}>
          {taxi ? (
            <>
              <span className={styles.stop}>
                {post.departure}
                <span className={styles.srOnly}>에서</span>
              </span>
              <span className={styles.stop} data-end="true">
                {post.destination}
                <span className={styles.srOnly}>까지</span>
              </span>
            </>
          ) : (
            <>
              <span className={styles.stop}>{post.restaurantName}</span>
              <span className={styles.stop} data-end="true">
                <span className={styles.stopMeta}>
                  수령 장소 · {post.pickupLocation}
                </span>
              </span>
            </>
          )}
        </span>
        <span className={styles.when}>
          <ClockIcon className={styles.whenIcon} />
          <span className={styles.time}>{timeFormat.format(reference)}</span>
          <span className={styles.meta}>
            {formatDate(reference)} · {taxi ? "출발" : "주문 마감"}
          </span>
        </span>
        <span className={styles.figures}>
          <SeatSlots
            className={styles.seatSlots}
            total={post.capacity}
            filled={post.currentMemberCount}
          />
          <span className={styles.people}>
            {post.currentMemberCount} / {post.capacity}명
          </span>
          {available ? (
            <span className={styles.seats} data-last={remaining === 1}>
              {remaining}자리 남음
            </span>
          ) : (
            // The status chip above already says it; repeat only extra detail.
            reason &&
            reason !== label && <span className={styles.meta}>{reason}</span>
          )}
        </span>
        {post.authorName && (
          <span className={styles.author}>
            <span className={styles.avatar} aria-hidden="true">
              {post.authorName.slice(-2)}
            </span>
            {post.authorName}
          </span>
        )}
      </span>
    </Link>
  );
}
