"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ApiError } from "@/lib/api";
import {
  normalizeReportDetail,
  PostDetailError,
  REPORT_DETAIL_MAX,
  REPORT_REASONS,
  reportDetailError,
  type ReportReason,
  type ReportRequest,
} from "./postDetail";
import styles from "./detail.module.css";

export type ReportOutcome = "submitted" | "duplicate";

function failureMessage(error: unknown): string {
  if (error instanceof PostDetailError) {
    switch (error.kind) {
      case "duplicateReport":
        return "이미 신고한 모집이에요. 같은 모집은 한 번만 신고할 수 있어요.";
      case "ownPost":
        return "본인이 작성한 모집은 신고할 수 없어요.";
      case "notFound":
        return "삭제되었거나 없는 모집이라 신고할 수 없어요.";
      case "invalid":
        return "신고 사유와 상세 내용을 확인해 주세요.";
      case "forbidden":
        return "이 모집을 신고할 권한이 없어요.";
      default:
        break;
    }
  }
  if (error instanceof Error && error.name === "PostDetailNotConnectedError") {
    return "신고 연동을 준비하고 있어요. 잠시 후 다시 이용해 주세요.";
  }
  return "신고를 보내지 못했어요. 입력한 내용은 그대로 있으니 다시 시도해 주세요.";
}

/** Report form (REPORT-001~002). Submitting never hides the post by itself. */
export function ReportDialog({
  open,
  onSubmit,
  onDone,
  onClose,
  onUnauthorized,
}: {
  open: boolean;
  onSubmit: (request: ReportRequest) => Promise<void>;
  onDone: (outcome: ReportOutcome) => void;
  onClose: () => void;
  onUnauthorized: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);
  const firstReason = useRef<HTMLInputElement>(null);
  const locked = useRef(false);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [detail, setDetail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const baseId = useId();
  const id = (name: string) => `${baseId}-${name}`;

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      opener.current = document.activeElement;
      element.showModal();
      firstReason.current?.focus();
    } else if (!open && element.open) {
      element.close();
    }
  }, [open]);

  const reasonError =
    submitted && !reason ? "신고 사유를 선택해 주세요." : null;
  const detailError = reportDetailError(detail);
  const used = Array.from(normalizeReportDetail(detail)).length;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current) return;
    setSubmitted(true);
    if (!reason) {
      firstReason.current?.focus();
      return;
    }
    if (detailError) {
      document.getElementById(id("detail"))?.focus();
      return;
    }
    locked.current = true;
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ reason, detail: normalizeReportDetail(detail) || null });
      onDone("submitted");
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 401) {
        onUnauthorized();
        return;
      }
      if (
        failure instanceof PostDetailError &&
        failure.kind === "duplicateReport"
      ) {
        onDone("duplicate");
        return;
      }
      setError(failureMessage(failure));
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby={id("title")}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onClose={() => {
        if (opener.current instanceof HTMLElement) opener.current.focus();
      }}
    >
      <form
        noValidate
        onSubmit={(event) => void submit(event)}
        aria-busy={busy}
      >
        <div className={styles.dialogHeading}>
          <h2 id={id("title")}>모집글 신고</h2>
          <button
            type="button"
            className={styles.close}
            aria-label="모집글 신고 닫기"
            disabled={busy}
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <p className={styles.dialogBody}>
          신고 내용은 운영자만 확인해요. 신고만으로 모집이 숨겨지지는 않아요.
        </p>
        <fieldset
          className={styles.reasons}
          aria-describedby={reasonError ? id("reason-error") : undefined}
        >
          <legend className={styles.label}>신고 사유</legend>
          {REPORT_REASONS.map((item, index) => (
            <label key={item.value} className={styles.reason}>
              <input
                ref={index === 0 ? firstReason : undefined}
                type="radio"
                name="reason"
                value={item.value}
                checked={reason === item.value}
                disabled={busy}
                onChange={() => setReason(item.value)}
              />
              {item.label}
            </label>
          ))}
          {reasonError && (
            <p id={id("reason-error")} className={styles.error}>
              {reasonError}
            </p>
          )}
        </fieldset>
        <div className={styles.field}>
          <div className={styles.labelRow}>
            <label htmlFor={id("detail")} className={styles.label}>
              상세 내용 (선택)
            </label>
            <span
              id={id("count")}
              className={styles.counter}
              data-over={used > REPORT_DETAIL_MAX}
            >
              {used}/{REPORT_DETAIL_MAX}자
            </span>
          </div>
          <textarea
            id={id("detail")}
            className={styles.textarea}
            value={detail}
            readOnly={busy}
            placeholder="운영자가 확인할 내용을 적어 주세요."
            aria-invalid={detailError ? true : undefined}
            aria-describedby={
              detailError ? `${id("detail-error")} ${id("count")}` : id("count")
            }
            onChange={(event) => setDetail(event.target.value)}
          />
          {detailError && (
            <p id={id("detail-error")} className={styles.error}>
              {detailError}
            </p>
          )}
        </div>
        {error && (
          <p role="alert" className={styles.alert}>
            {error}
          </p>
        )}
        {busy && (
          <p role="status" className={styles.help}>
            신고를 보내고 있어요.
          </p>
        )}
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.secondary}
            disabled={busy}
            onClick={onClose}
          >
            취소
          </button>
          <button type="submit" className={styles.danger} disabled={busy}>
            {busy ? "보내는 중…" : "신고하기"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
