"use client";

import Image from "next/image";
import { useId, useRef, type ReactNode } from "react";
import { cutoffMinutes } from "./participation";
import type { ParticipationController } from "./useParticipation";
import { ParticipationMotion } from "./ParticipationMotion";
import styles from "./participation.module.css";
import { ClockIcon, SeatSlots } from "@/features/ui/art";
import { dayTime, formatDate } from "@/lib/dateFormat";

const timeFormat = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function ParticipationPanel({
  participation,
  schedule = true,
  joinedAction,
}: {
  participation: ParticipationController;
  /**
   * Show the time box and the cutoff rule. The post detail passes false: its
   * summary already shows both times, so the panel keeps only the seats.
   */
  schedule?: boolean;
  /**
   * While joined, the bar's one primary action (the post detail: 오픈채팅 열기
   * or 모임 장소 보기). The caller then places <ParticipationCancel> in its
   * own 참여자 안내 section; without it the bar keeps 참여 취소.
   */
  joinedAction?: ReactNode;
}) {
  const { snapshot, availability, nowMs, busy, needsRefresh, feedback } =
    participation;
  const labelId = useId();
  const reasonId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const timeClosed = nowMs >= availability.deadline;
  const active = ["OPEN", "FULL", "CLOSED"].includes(snapshot.status);
  const joined = snapshot.viewerRelation === "JOINED";
  const author = snapshot.viewerRelation === "AUTHOR";
  const remaining = Math.max(
    0,
    snapshot.capacity - snapshot.currentMemberCount,
  );
  // The seat that just changed after a confirmed join/cancel gets a small pop.
  const motion = participation.motion;
  const popSeat = motion
    ? motion.action === "join"
      ? snapshot.currentMemberCount - 1
      : snapshot.currentMemberCount
    : undefined;
  const referenceTime = Date.parse(snapshot.referenceTime);
  const hasTime = Number.isFinite(referenceTime);
  const timeFinished =
    snapshot.status === "FINISHED" || (active && nowMs >= referenceTime);
  const actionLabel =
    snapshot.viewerRelation === "CANCELLED" ? "다시 참여하기" : "참여하기";
  const status = timeFinished
    ? "일정 종료"
    : {
        OPEN: timeClosed ? "신청 마감" : "모집 중",
        FULL: "정원 마감",
        CLOSED: "작성자 마감",
        CANCELLED: "모집 취소",
        FINISHED: "일정 종료",
        REMOVED: "삭제된 모집",
      }[snapshot.status];

  // The fixed bar: only while there is something to do or open. Ended,
  // cancelled or author-closed posts (unless I am in it) have none.
  const bar =
    active &&
    !timeFinished &&
    !author &&
    snapshot.viewerRelation !== "GUEST" &&
    (joined || snapshot.status !== "CLOSED");
  const scheduleTerm = snapshot.type === "TAXI" ? "출발" : "주문 마감";
  const hint =
    Number.isFinite(availability.deadline) && hasTime
      ? joined
        ? ["참여 중", `${dayTime(referenceTime, nowMs)} ${scheduleTerm}`]
        : [
            snapshot.status === "OPEN" && !timeClosed
              ? `${remaining}자리 남음`
              : status,
            `${dayTime(availability.deadline, nowMs)}까지 신청`,
          ]
      : null;

  if (snapshot.status === "REMOVED") {
    return <p role="status">관리자에 의해 삭제된 모집이에요.</p>;
  }

  return (
    <section
      className={styles.panel}
      aria-labelledby={labelId}
      aria-busy={busy}
      data-closed={timeFinished || snapshot.status !== "OPEN" || timeClosed}
      data-sticky-action={bar ? "true" : undefined}
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
        <SeatSlots
          key={motion?.id ?? "seats"}
          className={styles.seats}
          total={snapshot.capacity}
          filled={snapshot.currentMemberCount}
          pop={popSeat}
        />
        <p className={styles.muted}>
          현재 {snapshot.currentMemberCount} / {snapshot.capacity}명 · 작성자
          포함
          <br />
          정원이 차면 자동으로 마감돼요.
        </p>
      </div>
      {schedule && (
        <div className={styles.schedule}>
          <ClockIcon className={styles.scheduleIcon} />
          <p>
            {hasTime ? dayTime(referenceTime, nowMs) : "시각 확인 필요"}{" "}
            {snapshot.type === "TAXI" ? "출발" : "주문 마감"}
            <br />
            {hasTime ? formatDate(referenceTime) : "다시 조회해 주세요."}
          </p>
        </div>
      )}
      {availability.reason && <p id={reasonId}>{availability.reason}</p>}
      {bar && (
        <div className={styles.action} data-bottom-action="true">
          {hint && (
            /* Phones: two short lines beside the button */
            <p className={styles.actionHint} data-bottom-hint="true">
              <span>{hint[0]}</span>
              <span>{hint[1]}</span>
            </p>
          )}
          {joined && joinedAction ? (
            joinedAction
          ) : joined ? (
            <ParticipationCancel
              participation={participation}
              variant="bar"
              onFocusFallback={() => heading.current?.focus()}
            />
          ) : (
            <button
              type="button"
              className={styles.primary}
              disabled={busy || needsRefresh || availability.action === null}
              aria-describedby={availability.reason ? reasonId : undefined}
              onClick={() => void participation.join()}
            >
              {busy ? "처리 중…" : actionLabel}
            </button>
          )}
        </div>
      )}
      {schedule &&
        active &&
        !timeFinished &&
        Number.isFinite(availability.deadline) && (
          <p className={styles.help}>
            참여 신청·취소는 {dayTime(availability.deadline, nowMs)} 이전까지
            가능해요.
            <br />
            {snapshot.type === "TAXI" ? "출발" : "주문 마감"}{" "}
            {cutoffMinutes(snapshot)}분 전부터 마감돼요.
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
      {/* Last in reading order; drawn in the corner kept free by .summary */}
      <ParticipationMotion
        motion={participation.motion}
        type={snapshot.type}
        joined={joined}
        busy={busy}
      />
    </section>
  );
}

/**
 * 참여 취소 with its confirmation dialog. In the bar (participation preview)
 * it is the primary button; on the post detail it sits in 참여자 안내 as a
 * secondary danger action with the cancel cutoff right beside it.
 */
export function ParticipationCancel({
  participation,
  variant = "inline",
  onFocusFallback,
}: {
  participation: ParticipationController;
  variant?: "bar" | "inline";
  /** Stable focus target for confirmation or a missing/disabled trigger. */
  onFocusFallback?: () => void;
}) {
  const { snapshot, availability, nowMs, busy, needsRefresh } = participation;
  const dialogLabelId = useId();
  const dialogDescriptionId = useId();
  const deadlineId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const returnButton = useRef<HTMLButtonElement>(null);
  const restoreTriggerOnClose = useRef(true);
  const referenceTime = Date.parse(snapshot.referenceTime);
  const hasTime = Number.isFinite(referenceTime);
  const open =
    Number.isFinite(availability.deadline) && nowMs < availability.deadline;

  function returnFocus() {
    if (!restoreTriggerOnClose.current) return;
    const target = trigger.current;
    if (target && !target.disabled) target.focus();
    else onFocusFallback?.();
  }

  const button = (
    <button
      type="button"
      ref={trigger}
      className={variant === "bar" ? styles.primary : styles.cancel}
      data-tone="danger"
      disabled={busy || needsRefresh || availability.action !== "cancel"}
      aria-describedby={variant === "inline" ? deadlineId : undefined}
      onClick={() => {
        restoreTriggerOnClose.current = true;
        dialog.current?.showModal();
        returnButton.current?.focus();
      }}
    >
      {busy ? "처리 중…" : "참여 취소"}
    </button>
  );

  return (
    <>
      {variant === "inline" ? (
        <div className={styles.cancelRow}>
          {button}
          <span id={deadlineId} className={styles.cancelDeadline}>
            {open
              ? `${dayTime(availability.deadline, nowMs)}까지 가능`
              : "취소 마감됐어요"}
          </span>
        </div>
      ) : (
        button
      )}
      <dialog
        ref={dialog}
        className={styles.dialog}
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
            {hasTime ? formatDate(referenceTime) : "시각 확인 필요"}{" "}
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
            disabled={busy || needsRefresh || availability.action !== "cancel"}
            onClick={() => {
              // Both the trigger and its section can disappear on success.
              // Move focus before sending; a late close event or response must
              // not steal it back after the student moves elsewhere.
              restoreTriggerOnClose.current = false;
              dialog.current?.close();
              onFocusFallback?.();
              void participation.cancel();
            }}
          >
            내 참여 취소
          </button>
        </div>
      </dialog>
    </>
  );
}
