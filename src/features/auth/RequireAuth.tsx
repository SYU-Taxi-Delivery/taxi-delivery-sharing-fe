"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, type ReactNode } from "react";
import { loginHref, type UserRole } from "./auth";
import { useAuth } from "./AuthProvider";
import styles from "./auth.module.css";

/** Server 403 answer, or a role the screen does not allow (AC-AUTH-004-07). */
export function AccessDenied() {
  const titleId = useId();
  return (
    <section className={styles.notice} aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.noticeTitle}>
        접근 권한이 없어요
      </h2>
      <p className={styles.muted}>
        이 화면은 권한이 있는 사용자만 볼 수 있어요.
      </p>
      <Link href="/" className={styles.secondary}>
        홈으로 돌아가기
      </Link>
    </section>
  );
}

/**
 * Renders children only for a signed-in user, and for `role` when given.
 * This is a screen guard; the server still decides every protected request.
 */
export function RequireAuth({
  role,
  children,
}: {
  role?: UserRole;
  children: ReactNode;
}) {
  const { status, user, notice, check } = useAuth();
  const pathname = usePathname();
  const titleId = useId();

  if (status === "checking") {
    return (
      <p role="status" className={styles.muted}>
        로그인 상태를 확인하고 있어요.
      </p>
    );
  }

  if (status === "unavailable") {
    return (
      <section className={styles.notice} aria-labelledby={titleId}>
        <h2 id={titleId} className={styles.noticeTitle}>
          로그인 상태를 확인하지 못했어요
        </h2>
        <p role="alert" className={styles.muted}>
          네트워크를 확인한 후 다시 시도해 주세요.
        </p>
        <button
          type="button"
          className={styles.secondary}
          onClick={() => void check()}
        >
          다시 확인
        </button>
      </section>
    );
  }

  if (status !== "authenticated" || !user) {
    return (
      <section className={styles.notice} aria-labelledby={titleId}>
        <h2 id={titleId} className={styles.noticeTitle}>
          {status === "expired" ? "로그인이 만료됐어요" : "로그인이 필요해요"}
        </h2>
        <p
          role={status === "expired" ? "alert" : undefined}
          className={styles.muted}
        >
          {status === "expired"
            ? (notice?.message ?? "다시 로그인해 주세요.")
            : "삼육대학교 학생만 이용할 수 있어요. 학교 이메일로 로그인해 주세요."}
        </p>
        <Link href={loginHref(pathname ?? "/")} className={styles.primary}>
          로그인하러 가기
        </Link>
      </section>
    );
  }

  if (role && user.role !== role) return <AccessDenied />;

  return children;
}
