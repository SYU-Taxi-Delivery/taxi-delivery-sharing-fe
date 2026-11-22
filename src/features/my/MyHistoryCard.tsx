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
import { GUIDE_ID } from "@/features/posts/detail/postDetail";
import { useAppPath } from "@/features/demo/AppProviders";
import { DeliveryArt, TaxiArt } from "@/features/ui/art";
import { dayLabel, dayTime, formatDate } from "@/lib/dateFormat";

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

/** "오늘 23:49까지", "내일 00:04까지": the day word is always there. */
function untilText(deadline: number, nowMs: number) {
  return `${dayTime(deadline, nowMs)}까지`;
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
  const cutoffId = useId();
  const availability = getParticipationAvailability(
    toMySnapshot(item, serverTime),
    nowMs,
  );
  const { label, available } = postStatusLabel(
    { ...item, joinable: item.joinable && nowMs < availability.deadline },
    nowMs,
  );
  const author = item.relation === "AUTHOR";
  const referenceMs = Date.parse(item.referenceTime);
  const verb = item.type === "TAXI" ? "출발" : "주문 마감";
  const cancellable = nowMs < availability.deadline;
  const remaining = item.capacity - item.currentMemberCount;
  const detailHref = path(`/posts/${encodeURIComponent(item.id)}`);
  const link =
    item.communicationUrl &&
    (author || item.relation === "JOINED") &&
    ["OPEN", "FULL", "CLOSED"].includes(item.status) &&
    nowMs < referenceMs
      ? item.communicationUrl
      : null;

  const taxi = item.type === "TAXI";
  return (
    <article
      className={styles.card}
      aria-labelledby={titleId}
      data-type={taxi ? "taxi" : "delivery"}
      data-available={available}
    >
      {/* My own relation sits on top with its own label; the post's state
          stays with the type at the bottom, so the two never read as one. */}
      <p className={styles.relationBar}>
        <span className={styles.relationLabel}>
          {author ? "내가 쓴 모집" : "내 참여"}
        </span>
        {!author && <span className={styles.relation}>참여 중</span>}
      </p>

      {/* ① when on the left, seats left on the right (same as the board) */}
      <div className={styles.head}>
        <span className={styles.sticker} aria-hidden="true">
          {taxi ? <TaxiArt /> : <DeliveryArt />}
        </span>
        <p className={styles.when}>
          <span>
            {dayLabel(referenceMs, nowMs)} {time.format(referenceMs)}{" "}
            <span className={styles.whenVerb}>{verb}</span>
          </span>
        </p>
        {available && (
          <span className={styles.seats} data-last={remaining === 1}>
            {remaining}자리 남음
          </span>
        )}
      </div>

      {/* ② the place, ③ the pickup */}
      <div className={styles.place}>
        <h3 id={titleId} className={styles.cardTitle}>
          <Link href={detailHref} className={styles.titleLink}>
            {taxi ? (
              <>
                <span className={styles.stop}>
                  <span className={styles.srOnly}>출발 </span>
                  {item.departure}
                  <span className={styles.srOnly}>에서</span>
                </span>
                <span className={styles.stop} data-end="true">
                  <span className={styles.srOnly}>도착 </span>
                  {item.destination}
                  <span className={styles.srOnly}>까지</span>
                </span>
              </>
            ) : (
              item.restaurantName
            )}
          </Link>
        </h3>
        {!taxi && (
          <p className={styles.muted}>수령 장소 · {item.pickupLocation}</p>
        )}
      </div>

      {/* ④ the headcount, then type · post status (left) and author (right) */}
      <p className={styles.meta} data-testid="seat-summary">
        현재 {item.currentMemberCount} / {item.capacity}명 · 작성자 포함
      </p>
      <p className={styles.footMeta}>
        <span>
          <span className={styles.typeWord}>{taxi ? "택시" : "배달"}</span>
          <span aria-hidden="true"> · </span>
          <span className={styles.status}>
            <span className={styles.srOnly}>모집 상태 </span>
            {label}
          </span>
        </span>
        {item.authorName && !author && (
          <span className={styles.authorName}>작성자 {item.authorName}</span>
        )}
      </p>

      {author && (
        <p className={styles.cutoff} data-closed={!cancellable}>
          {cancellable
            ? `참여자는 ${untilText(availability.deadline, nowMs)} 취소할 수 있어요`
            : "참여자 취소 마감됨"}
        </p>
      )}

      {/* The main action first; 참여 취소 is the quieter one, with its
          deadline right under the button it belongs to. */}
      <div className={styles.actions}>
        {author ? (
          <Link href={detailHref} className={styles.primaryAction}>
            모집 관리
          </Link>
        ) : link ? (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.primaryAction}
          >
            오픈채팅 <span className={styles.srOnly}>(새 창)</span>
          </a>
        ) : (
          <Link
            href={`${detailHref}#${GUIDE_ID}`}
            className={styles.primaryAction}
          >
            모임 장소 보기
          </Link>
        )}
        {!author && (
          <div className={styles.cancelGroup}>
            {availability.action === "cancel" && (
              <button
                type="button"
                className={styles.button}
                data-tone="danger"
                disabled={busy}
                aria-describedby={cutoffId}
                onClick={(event) => onCancel(event.currentTarget)}
              >
                참여 취소
              </button>
            )}
            <span
              id={cutoffId}
              className={styles.cancelCutoff}
              data-closed={!cancellable}
            >
              {cancellable
                ? `${untilText(availability.deadline, nowMs)} 가능`
                : "취소 마감됨"}
            </span>
          </div>
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
