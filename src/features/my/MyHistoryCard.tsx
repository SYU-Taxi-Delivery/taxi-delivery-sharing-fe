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
import { BagArt, ClockIcon, TaxiArt } from "@/features/ui/art";
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
          <Link href={detailHref} className={styles.titleLink}>
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
          </Link>
        </h3>
        {item.type === "DELIVERY" && (
          <p className={styles.muted}>수령 장소 · {item.pickupLocation}</p>
        )}
      </div>

      {/* Secondary: what is left and who is in, one small muted line. */}
      <p className={styles.meta} data-testid="seat-summary">
        {available && (
          <span className={styles.seats} data-last={remaining === 1}>
            {remaining}자리 남음
          </span>
        )}
        <span>
          현재 {item.currentMemberCount} / {item.capacity}명 · 작성자 포함
        </span>
        {item.authorName && !author && <span>작성자 {item.authorName}</span>}
      </p>

      {author && (
        <p className={styles.cutoff} data-closed={!cancellable}>
          {cancellable
            ? `참여자는 ${untilText(availability.deadline, nowMs)} 취소할 수 있어요`
            : "참여자 취소 마감됨"}
        </p>
      )}

      {/* One full-width primary action, then 참여 취소 on its own row. */}
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
          <div className={styles.cancelRow}>
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
              className={styles.cutoff}
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
