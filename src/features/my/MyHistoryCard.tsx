"use client";

import Image from "next/image";
import Link from "next/link";
import { useId } from "react";
import { getParticipationAvailability } from "@/features/participation/participation";
import { effectiveStatus } from "@/features/posts/detail/postDetail";
import { postStatusLabel } from "@/features/posts/posts";
import { toMySnapshot, type MyHistoryItem } from "./myHistory";
import styles from "./my.module.css";

const dateTime = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "numeric",
  day: "numeric",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const time = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export type LiveHistoryItem = Exclude<MyHistoryItem, { status: "REMOVED" }>;

export function MyHistoryCard({
  item,
  serverTime,
  nowMs,
  busy,
  onCancel,
}: {
  item: LiveHistoryItem;
  serverTime: string;
  nowMs: number;
  busy: boolean;
  onCancel: (trigger: HTMLButtonElement) => void;
}) {
  const titleId = useId();
  const snapshot = toMySnapshot(item, serverTime);
  const availability = getParticipationAvailability(snapshot, nowMs);
  const status = effectiveStatus(item, nowMs);
  const { label, available } = postStatusLabel({
    ...item,
    status,
    joinable: item.joinable && nowMs < availability.deadline,
  });
  const active = ["OPEN", "FULL", "CLOSED"].includes(status);
  const muted = !available || item.relation === "CANCELLED";
  const author = item.relation === "AUTHOR";

  return (
    <article
      className={styles.card}
      data-muted={muted}
      aria-labelledby={titleId}
    >
      <div className={styles.cardHeader}>
        <div className={styles.badges}>
          <span className={styles.type}>
            {item.type === "TAXI" ? "택시" : "배달"}
          </span>
          <span className={styles.relation}>
            {author
              ? "작성한 글"
              : item.relation === "JOINED"
                ? active
                  ? "참여 중"
                  : "참여 이력"
                : "참여 취소됨"}
          </span>
          <span className={styles.status}>{label}</span>
        </div>
        {item.authorName && (
          <span className={styles.meta}>작성자 {item.authorName}</span>
        )}
      </div>
      <div>
        <h2 id={titleId} className={styles.cardTitle}>
          {item.type === "TAXI" ? (
            <>
              {item.departure}
              <span className={styles.srOnly}>에서</span>
              <Image
                src={muted ? "/my/arrow-muted.svg" : "/my/arrow.svg"}
                width={16}
                height={16}
                alt=""
              />
              {item.destination}
              <span className={styles.srOnly}>까지</span>
            </>
          ) : (
            item.restaurantName
          )}
        </h2>
        {item.type === "DELIVERY" && (
          <p className={styles.muted}>수령 장소 · {item.pickupLocation}</p>
        )}
        <p className={styles.meta}>
          {item.currentMemberCount} / {item.capacity}명 · 작성자 포함
          {available && (
            <>
              {" "}
              ·{" "}
              <span className={styles.seats}>
                {item.capacity - item.currentMemberCount}자리 남음
              </span>
            </>
          )}
        </p>
      </div>
      <div>
        <p className={styles.schedule}>
          {dateTime.format(Date.parse(item.referenceTime))} ·{" "}
          {item.type === "TAXI" ? "출발" : "주문 마감"}
        </p>
        {active && (author || item.relation === "JOINED") && (
          <p className={styles.meta}>
            {nowMs < availability.deadline
              ? `${author ? "참여자 취소 기한" : "참여 취소 기한"} ${time.format(availability.deadline)} · 기준시각 10분 전`
              : "참여 취소 마감 · 기준시각 10분 전부터 취소할 수 없어요."}
          </p>
        )}
      </div>
      <div className={styles.actions}>
        <Link
          href={`/posts/${encodeURIComponent(item.id)}`}
          className={styles.button}
        >
          {author && active ? "모집 관리" : "상세 보기"}
        </Link>
        {availability.action === "cancel" && (
          <button
            type="button"
            className={styles.button}
            disabled={busy}
            onClick={(event) => onCancel(event.currentTarget)}
          >
            참여 취소
          </button>
        )}
      </div>
    </article>
  );
}
