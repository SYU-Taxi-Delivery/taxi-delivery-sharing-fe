"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import styles from "./demo.module.css";

const DISMISSED = "syu-demo-prompt-dismissed";

export function DemoPrompt() {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(DISMISSED)) return;
    } catch {
      // The prompt can open when browser storage is unavailable.
    }
    dialog.current?.showModal?.();
    closeButton.current?.focus();
  }, []);

  function close() {
    try {
      sessionStorage.setItem(DISMISSED, "true");
    } catch {
      // Closing the prompt does not require browser storage.
    }
    dialog.current?.close?.();
  }

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby="demo-title"
      aria-describedby="demo-description"
      onClose={close}
    >
      <h2 id="demo-title" className={styles.title}>
        혹시 데모를 보러 오셨나요?
      </h2>
      <p id="demo-description" className={styles.description}>
        가입 없이 모집글과 참여 과정을 둘러볼 수 있어요. 데모에는 예시 데이터가
        표시돼요.
      </p>
      <div className={styles.actions}>
        <Link href="/posts-preview" className={styles.primary} onClick={close}>
          보러가기
        </Link>
        <button
          ref={closeButton}
          type="button"
          className={styles.secondary}
          onClick={close}
        >
          닫기
        </button>
      </div>
    </dialog>
  );
}
