"use client";

import Image from "next/image";
import Link from "next/link";
import { postStatusLabel, type PostSummary } from "./posts";
import styles from "./posts.module.css";
import { useAppPath } from "@/features/demo/AppProviders";

const dateFormat = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "numeric",
  day: "numeric",
  weekday: "short",
});
const timeFormat = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

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
    >
      <span className={styles.icon} aria-hidden="true">
        <Image
          src={taxi ? "/posts/taxi.svg" : "/posts/delivery.svg"}
          width={24}
          height={24}
          alt=""
        />
      </span>
      <span className={styles.cardBody}>
        <span>
          <span className={styles.cardTitle}>
            {taxi ? (
              <>
                {post.departure}
                <span className={styles.srOnly}>에서</span>
                <Image src="/posts/arrow.svg" width={16} height={16} alt="" />
                {post.destination}
                <span className={styles.srOnly}>까지</span>
              </>
            ) : (
              post.restaurantName
            )}
          </span>
          <span className={styles.chips}>
            <span className={styles.chip}>{taxi ? "택시" : "배달"}</span>
            <span className={styles.status}>{label}</span>
          </span>
          <span className={`${styles.meta} block`}>
            {!taxi && <>수령 장소 · {post.pickupLocation}</>}
            {!taxi && post.authorName && <br />}
            {post.authorName}
          </span>
        </span>
        <span className={styles.figures}>
          <span>
            <span className={`${styles.time} block`}>
              {timeFormat.format(reference)}
            </span>
            <span className={`${styles.meta} block`}>
              {dateFormat.format(reference)} · {taxi ? "출발" : "주문 마감"}
            </span>
          </span>
          <span>
            <span className={`${styles.people} block`}>
              {post.currentMemberCount} / {post.capacity}명
            </span>
            {available ? (
              <span
                className={`${styles.seats} block`}
                data-last={remaining === 1}
              >
                {remaining}자리 남음
              </span>
            ) : (
              reason && <span className={`${styles.meta} block`}>{reason}</span>
            )}
          </span>
        </span>
      </span>
      <Image
        className={styles.chevron}
        src="/posts/chevron.svg"
        width={20}
        height={20}
        alt=""
      />
    </Link>
  );
}
