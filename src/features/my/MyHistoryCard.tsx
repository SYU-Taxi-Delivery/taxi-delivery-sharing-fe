"use client";

import Link from "next/link";
import { useId } from "react";
import { getParticipationAvailability } from "@/features/participation/participation";
import { postStatusLabel } from "@/features/posts/posts";
import {
  pastReasonLabel,
  toMySnapshot,
  type LiveMyHistoryItem,
  type PastReason,
} from "./myHistory";
import styles from "./my.module.css";
import { useAppPath } from "@/features/demo/AppProviders";
import { BagArt, ClockIcon, TaxiArt } from "@/features/ui/art";
import { dayLabel, formatDate, seoulDayDiff } from "@/lib/dateFormat";

const time = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export type LiveHistoryItem = LiveMyHistoryItem;

const titleText = (item: LiveHistoryItem) =>
  item.type === "TAXI"
    ? `${item.departure} → ${item.destination}`
    : item.restaurantName;

/** "23:49까지", or "내일 23:49까지" when the cutoff is not today. */
function untilText(deadline: number, nowMs: number) {
  const day =
    seoulDayDiff(deadline, nowMs) === 0 ? "" : `${dayLabel(deadline, nowMs)} `;
  return `${day}${time.format(deadline)}까지`;
}

/** Upcoming card: time, place, cancel cutoff, then actions. */
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
  const availability = getParticipationAvailability(
    toMySnapshot(item, serverTime),
    nowMs,
  );
  const { label, available } = postStatusLabel({
    ...item,
    joinable: item.joinable && nowMs < availability.deadline,
  });
  const author = item.relation === "AUTHOR";
  const referenceMs = Date.parse(item.referenceTime);
  const verb = item.type === "TAXI" ? "출발" : "주문 마감";
  const cancellable = nowMs < availability.deadline;

  return (
    <article className={styles.card} aria-labelledby={titleId}>
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
            {author ? "작성한 글" : "참여 중"}
          </span>
          <span className={styles.status}>
            <span className={styles.srOnly}>모집, </span>
            {label}
          </span>
        </span>
      </div>

      <p className={styles.when}>
        <ClockIcon className={styles.scheduleIcon} />
        <span>
          {dayLabel(referenceMs, nowMs)} {time.format(referenceMs)} {verb}
        </span>
      </p>

      <div className={styles.place}>
        <h3 id={titleId} className={styles.cardTitle}>
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
        </h3>
        {item.type === "DELIVERY" && (
          <p className={styles.muted}>수령 장소 · {item.pickupLocation}</p>
        )}
      </div>

      <p className={styles.cutoff} data-closed={!cancellable}>
        {cancellable
          ? `${author ? "참여자는 " : ""}${untilText(availability.deadline, nowMs)} 취소할 수 있어요`
          : author
            ? "참여자 취소 마감됨"
            : "취소 마감됨"}
      </p>

      <p className={styles.meta}>
        <span>
          {item.currentMemberCount} / {item.capacity}명 · 작성자 포함
        </span>
        {available && (
          <span className={styles.seats}>
            {item.capacity - item.currentMemberCount}자리 남음
          </span>
        )}
        {item.authorName && !author && <span>작성자 {item.authorName}</span>}
      </p>

      <div className={styles.actions}>
        <Link
          href={path(`/posts/${encodeURIComponent(item.id)}`)}
          className={styles.button}
        >
          {author ? "모집 관리" : "상세 보기"}
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

/** 지난 이력: one compact row (title, date, status chip). */
export function MyHistoryRow({
  item,
  reason,
}: {
  item: LiveHistoryItem | { id: string; status: "REMOVED" };
  reason: PastReason;
}) {
  const path = useAppPath();
  const chip = (
    <span className={styles.chip} data-reason={reason}>
      {pastReasonLabel[reason]}
    </span>
  );
  if (item.status === "REMOVED") {
    // Removed posts keep no title, time or link (ADMIN-003).
    return (
      <div className={styles.row} data-removed="true">
        <span className={styles.rowMain}>
          <span className={styles.rowTitle}>관리자에 의해 삭제된 모집</span>
        </span>
        {chip}
      </div>
    );
  }
  return (
    <Link
      href={path(`/posts/${encodeURIComponent(item.id)}`)}
      className={styles.row}
    >
      <span className={styles.rowMain}>
        <span className={styles.rowTitle}>
          <span className={styles.rowType}>
            {item.type === "TAXI" ? "택시" : "배달"}
          </span>
          {titleText(item)}
        </span>
        <span className={styles.rowDate}>
          {formatDate(Date.parse(item.referenceTime), { time: true })}
        </span>
      </span>
      {chip}
    </Link>
  );
}
