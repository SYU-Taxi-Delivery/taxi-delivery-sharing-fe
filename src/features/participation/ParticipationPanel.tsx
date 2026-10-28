"use client";

import Image from "next/image";
import { Noto_Sans_KR } from "next/font/google";
import { useId, useRef } from "react";
import type { ParticipationController } from "./useParticipation";
import styles from "./participation.module.css";

const notoSansKr = Noto_Sans_KR({
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

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

export function ParticipationPanel({
  participation,
}: {
  participation: ParticipationController;
}) {
  const { snapshot, availability, nowMs, busy, needsRefresh, feedback } =
    participation;
  const labelId = useId();
  const reasonId = useId();
  const dialogLabelId = useId();
  const dialogDescriptionId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const cancelTrigger = useRef<HTMLButtonElement>(null);
  const returnButton = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const timeClosed = nowMs >= availability.deadline;
  const active = ["OPEN", "FULL", "CLOSED"].includes(snapshot.status);
  const joined = snapshot.viewerRelation === "JOINED";
  const author = snapshot.viewerRelation === "AUTHOR";
  const remaining = Math.max(
    0,
    snapshot.capacity - snapshot.currentMemberCount,
  );
  const referenceTime = Date.parse(snapshot.referenceTime);
  const hasTime = Number.isFinite(referenceTime);
  const timeFinished =
    snapshot.status === "FINISHED" || (active && nowMs >= referenceTime);
  const today =
    hasTime &&
    Number.isFinite(nowMs) &&
    dateFormat.format(referenceTime) === dateFormat.format(nowMs);
  const actionLabel = joined
    ? "참여 취소"
    : snapshot.viewerRelation === "CANCELLED"
      ? "다시 참여하기"
      : "참여하기";
  const status = timeFinished
    ? "모집 완료"
    : {
        OPEN: timeClosed ? "참여 마감" : "모집 중",
        FULL: "정원 마감",
        CLOSED: "모집 마감",
        CANCELLED: "모집 취소",
        FINISHED: "모집 완료",
        REMOVED: "삭제된 모집",
      }[snapshot.status];

  function returnFocus() {
    const target = cancelTrigger.current;
    if (target && !target.disabled) target.focus();
    else heading.current?.focus();
  }

  function confirmCancellation() {
    dialog.current?.close();
    void participation.cancel();
  }

  if (snapshot.status === "REMOVED") {
    return <p role="status">관리자에 의해 삭제된 모집이에요.</p>;
  }

  return (
    <section
      className={`${styles.panel} ${notoSansKr.className}`}
      aria-labelledby={labelId}
      aria-busy={busy}
    >
      <div className={styles.summary}>
        {joined &&
          !timeFinished &&
          (snapshot.status !== "OPEN" || timeClosed) && (
            <p className={styles.muted}>{status}</p>
          )}
        <h2 id={labelId} ref={heading} tabIndex={-1} className={styles.heading}>
          {timeFinished
            ? status
            : joined
              ? "참여 중이에요"
              : snapshot.status === "OPEN" && !timeClosed
                ? `${remaining}자리 남았어요`
                : status}
        </h2>
        <p className={styles.muted}>
          현재 {snapshot.currentMemberCount} / {snapshot.capacity}명 · 작성자
          포함
          <br />
          정원이 차면 자동으로 마감돼요.
        </p>
      </div>
      <div className={styles.divider} aria-hidden="true" />
      <div className={styles.schedule}>
        <Image src="/participation/clock.svg" width={20} height={20} alt="" />
        <p>
          {today ? "오늘 " : ""}
          {hasTime ? timeFormat.format(referenceTime) : "시각 확인 필요"}{" "}
          {snapshot.type === "TAXI" ? "출발" : "주문 마감"}
          <br />
          {hasTime ? dateFormat.format(referenceTime) : "다시 조회해 주세요."}
        </p>
      </div>
      {availability.reason && <p id={reasonId}>{availability.reason}</p>}
      {active &&
        !timeFinished &&
        !author &&
        snapshot.viewerRelation !== "GUEST" && (
          <button
            type="button"
            ref={joined ? cancelTrigger : undefined}
            className={styles.primary}
            disabled={busy || needsRefresh || availability.action === null}
            aria-describedby={availability.reason ? reasonId : undefined}
            onClick={() => {
              if (joined) {
                dialog.current?.showModal();
                returnButton.current?.focus();
              } else void participation.join();
            }}
          >
            {busy ? "처리 중…" : actionLabel}
          </button>
        )}
      {active && !timeFinished && Number.isFinite(availability.deadline) && (
        <p className={styles.help}>
          참여 신청·취소는 {timeFormat.format(availability.deadline)} 이전까지
          가능해요.
          <br />
          {snapshot.type === "TAXI" ? "출발" : "주문 마감"} 10분 전부터
          마감돼요.
        </p>
      )}
      {busy && <p role="status">참여 상태를 확인하고 있어요.</p>}
      {feedback && (
        <p
          role={feedback.tone === "error" ? "alert" : "status"}
          className={feedback.tone === "error" ? styles.error : styles.success}
        >
          {feedback.message}
        </p>
      )}
      {needsRefresh && (
        <button
          type="button"
          className={styles.secondary}
          disabled={busy}
          onClick={() => void participation.refresh()}
        >
          최신 상태 다시 조회
        </button>
      )}
      {joined && (
        <dialog
          ref={dialog}
          className={`${styles.dialog} ${notoSansKr.className}`}
          aria-labelledby={dialogLabelId}
          aria-describedby={dialogDescriptionId}
          onClose={returnFocus}
          onCancel={(event) => {
            event.preventDefault();
            dialog.current?.close();
          }}
        >
          <div className={styles.dialogHeading}>
            <h2 id={dialogLabelId}>내 참여를 취소할까요?</h2>
            <button
              type="button"
              className={styles.close}
              aria-label="참여 취소 확인창 닫기"
              onClick={() => dialog.current?.close()}
            >
              <Image
                src="/participation/close.svg"
                width={20}
                height={20}
                alt=""
              />
            </button>
          </div>
          <p id={dialogDescriptionId} className={styles.dialogDescription}>
            내 참여만 취소돼요.
            <br />
            취소 후 명단과 소통 링크를 볼 수 없어요.
          </p>
          <div className={styles.target}>
            <p className={styles.targetTitle}>{snapshot.title}</p>
            <p className={styles.targetMeta}>
              {snapshot.type === "TAXI" ? "택시" : "배달"}
              <br />
              {hasTime
                ? dateFormat.format(referenceTime)
                : "시각 확인 필요"}{" "}
              {hasTime ? timeFormat.format(referenceTime) : ""} · 현재{" "}
              {snapshot.currentMemberCount} / {snapshot.capacity}명
            </p>
          </div>
          {availability.action !== "cancel" && availability.reason && (
            <p role="alert">{availability.reason}</p>
          )}
          <div className={styles.dialogActions}>
            <button
              type="button"
              className={styles.secondary}
              ref={returnButton}
              onClick={() => dialog.current?.close()}
            >
              돌아가기
            </button>
            <button
              type="button"
              className={styles.primary}
              disabled={
                busy || needsRefresh || availability.action !== "cancel"
              }
              onClick={() => void confirmCancellation()}
            >
              내 참여 취소
            </button>
          </div>
        </dialog>
      )}
    </section>
  );
}
