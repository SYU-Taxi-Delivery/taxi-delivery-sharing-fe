"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { roleLabels } from "./auth";
import { useAuth } from "./AuthProvider";
import styles from "./auth.module.css";

/** Signed-in user's name button with role and logout (AC-UI-ACCOUNT-01, -02). */
export function AccountMenu({
  afterLogout = "/login",
}: {
  afterLogout?: string;
}) {
  const { user, loggingOut, logout } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  if (!user) return null;

  async function signOut() {
    await logout();
    router.replace(afterLogout);
  }

  return (
    <div ref={container} className={styles.account}>
      <button
        ref={trigger}
        type="button"
        className={styles.menuButton}
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
      >
        {user.displayName}님
      </button>
      {open && (
        <div id={menuId} className={styles.menu}>
          <p>
            <span className="font-bold">{user.displayName}</span>
            <br />
            <span className={styles.muted}>{roleLabels[user.role]}</span>
          </p>
          {/* Only a menu entry; the server still answers 403 to non-admins. */}
          {user.role === "ADMIN" && (
            <Link href="/admin" className={styles.secondary}>
              관리자 화면
            </Link>
          )}
          <button
            type="button"
            className={styles.primary}
            disabled={loggingOut}
            onClick={() => void signOut()}
          >
            {loggingOut ? "로그아웃 중…" : "로그아웃"}
          </button>
        </div>
      )}
    </div>
  );
}
