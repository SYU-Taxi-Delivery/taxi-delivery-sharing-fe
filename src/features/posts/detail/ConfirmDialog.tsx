"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import styles from "./detail.module.css";

/**
 * Modal confirmation (Q-CONFIRM). Opening never sends a request; 돌아가기,
 * Escape and X close it and return focus to the control that opened it.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  confirmDisabled = false,
  danger = false,
  onConfirm,
  onClose,
  restoreFocus,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  confirmDisabled?: boolean;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  restoreFocus?: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const back = useRef<HTMLButtonElement>(null);
  const opener = useRef<Element | null>(null);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      opener.current = document.activeElement;
      element.showModal();
      back.current?.focus();
    } else if (!open && element.open) {
      element.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={() => {
        if (restoreFocus) restoreFocus();
        else if (opener.current instanceof HTMLElement) opener.current.focus();
      }}
    >
      <div className={styles.dialogHeading}>
        <h2 id={titleId}>{title}</h2>
        <button
          type="button"
          className={styles.close}
          aria-label={`${title} 닫기`}
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <div id={bodyId} className={styles.dialogBody}>
        {children}
      </div>
      <div className={styles.actions}>
        <button
          ref={back}
          type="button"
          className={styles.secondary}
          onClick={onClose}
        >
          돌아가기
        </button>
        <button
          type="button"
          className={danger ? styles.danger : styles.primary}
          disabled={confirmDisabled}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
