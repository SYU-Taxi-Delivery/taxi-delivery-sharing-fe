"use client";

import Link from "next/link";
import { useId } from "react";
import {
  cutoffMinutes,
  getParticipationAvailability,
} from "@/features/participation/participation";
import { effectiveStatus } from "@/features/posts/detail/postDetail";
import { postStatusLabel } from "@/features/posts/posts";
import { toMySnapshot, type MyHistoryItem } from "./myHistory";
import styles from "./my.module.css";
import { useAppPath } from "@/features/demo/AppProviders";
import { BagArt, ClockIcon, SeatSlots, TaxiArt } from "@/features/ui/art";
import { formatDate } from "@/lib/dateFormat";

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
  const path = useAppPath();
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
      data-closed={!available}
      aria-labelledby={titleId}
    >
      <div className={styles.cardHeader}>
        <div className={styles.badges}>
          <span className={styles.type}>
            {item.type === "TAXI" ? <TaxiArt /> : <BagArt />}
            {item.type === "TAXI" ? "택시" : "배달"}
          </span>
          {/* One compact tag, two states: mine (filled half) and the
              post's (outlined half). Screen readers hear each name. */}
          <span className={styles.stateTag}>
            <span className={styles.relation}>
              <span className={styles.srOnly}>
                {author ? "내 글, " : "내 참여, "}
              </span>
              {author
                ? "작성한 글"
                : item.relation === "JOINED"
                  ? active
                    ? "참여 중"
                    : "참여 이력"
                  : "참여 취소됨"}
            </span>
            <span className={styles.status}>
              <span className={styles.srOnly}>모집, </span>
              {label}
            </span>
          </span>
        </div>
        {item.authorName && (
          <span className={styles.meta}>작성자 {item.authorName}</span>
        )}
      </div>
      <div>
        <h2 id={titleId} className={styles.cardTitle}>
          {item.type === "TAXI" ? (
            <>
              <span className={styles.stop}>
                {item.departure}
                <span className={styles.srOnly}>에서</span>
              </span>
              <span className={styles.stop} data-end="true">
                {item.destination}
                <span className={styles.srOnly}>까지</span>
              </span>
            </>
          ) : (
            item.restaurantName
          )}
        </h2>
        {item.type === "DELIVERY" && (
          <p className={styles.muted}>수령 장소 · {item.pickupLocation}</p>
        )}
        <SeatSlots
          className={styles.seatSlots}
          total={item.capacity}
          filled={item.currentMemberCount}
        />
        <p className={styles.meta}>
          <span>
            {item.currentMemberCount} / {item.capacity}명 · 작성자 포함
          </span>
          {available && (
            <span className={styles.seats}>
              {item.capacity - item.currentMemberCount}자리 남음
            </span>
          )}
        </p>
      </div>
      <div>
        {/* Same order as the post list: clock, time, then date · 출발 */}
        <p className={styles.schedule}>
          <ClockIcon className={styles.scheduleIcon} />
          <span className={styles.scheduleTime}>
            {time.format(Date.parse(item.referenceTime))}
          </span>
          <span className={styles.scheduleDate}>
            {formatDate(Date.parse(item.referenceTime))} ·{" "}
            {item.type === "TAXI" ? "출발" : "주문 마감"}
          </span>
        </p>
        {active && (author || item.relation === "JOINED") && (
          <p className={styles.meta}>
            {nowMs < availability.deadline
              ? `${author ? "참여자 취소 기한" : "참여 취소 기한"} ${time.format(availability.deadline)} · ${item.type === "TAXI" ? "출발" : "주문 마감"} ${cutoffMinutes(item)}분 전`
              : `참여 취소 마감 · ${item.type === "TAXI" ? "출발" : "주문 마감"} ${cutoffMinutes(item)}분 전부터 취소할 수 없어요.`}
          </p>
        )}
      </div>
      <div className={styles.actions}>
        <Link
          href={path(`/posts/${encodeURIComponent(item.id)}`)}
          className={styles.button}
        >
          {author && active ? "모집 관리" : "상세 보기"}
        </Link>
        {availability.action === "cancel" && (
          <button
            type="button"
            className={styles.button}
            data-tone="danger"
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
