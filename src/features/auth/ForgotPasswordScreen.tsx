"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { loginHref, schoolEmailError, SCHOOL_EMAIL_DOMAIN } from "./auth";
import { AuthLayout } from "./AuthLayout";
import {
  passwordResetErrorMessage,
  passwordResetOperations,
  type PasswordResetOperations,
} from "./passwordReset";
import styles from "./auth.module.css";
import { useAppPath } from "@/features/demo/AppProviders";

export function ForgotPasswordScreen({
  operations = passwordResetOperations,
  next,
}: {
  operations?: PasswordResetOperations;
  next?: string;
}) {
  const path = useAppPath();
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const locked = useRef(false);
  const requested = useRef(false);
  const emailInput = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const id = useId();

  useEffect(() => {
    if (sent) heading.current?.focus();
    else if (requested.current) emailInput.current?.focus();
  }, [sent]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current) return;
    const address = email.trim();
    const validation = schoolEmailError(address);
    setFieldError(validation);
    setError(null);
    if (validation) return emailInput.current?.focus();

    locked.current = true;
    setBusy(true);
    try {
      await operations.requestLink(address);
      requested.current = true;
      setSent(true);
    } catch (failure) {
      setError(passwordResetErrorMessage(failure));
      emailInput.current?.focus();
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  return (
    <AuthLayout>
      <section className={styles.card} aria-labelledby={`${id}-title`}>
        <h1
          ref={heading}
          id={`${id}-title`}
          className={`${styles.title} ${styles.noticeTitle}`}
          tabIndex={sent ? -1 : undefined}
        >
          {sent ? "메일함을 확인해 주세요" : "비밀번호 재설정"}
        </h1>
        {sent ? (
          <>
            <p className={styles.muted} role="status">
              가입된 학교 이메일이라면 비밀번호 재설정 링크가 전송돼요. 메일이
              보이지 않으면 스팸함도 확인해 주세요.
            </p>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => setSent(false)}
            >
              다시 요청하기
            </button>
          </>
        ) : (
          <>
            {operations === passwordResetOperations && (
              <p className={styles.terms}>
                현재 재설정 메일 발송을 연결하고 있어요. 데모에서는 복구 과정을
                체험할 수 있어요.{" "}
                <Link
                  href="/password-reset-preview"
                  className={styles.textLink}
                >
                  복구 데모 보기
                </Link>
              </p>
            )}
            <p className={styles.muted}>
              가입할 때 사용한 학교 이메일을 입력해 주세요.
            </p>
            <form
              className={styles.form}
              noValidate
              aria-busy={busy}
              onSubmit={(event) => void submit(event)}
            >
              <div className={styles.field}>
                <label htmlFor={`${id}-email`} className={styles.label}>
                  학교 이메일
                </label>
                <input
                  ref={emailInput}
                  id={`${id}-email`}
                  className={styles.input}
                  type="email"
                  name="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder={`example@${SCHOOL_EMAIL_DOMAIN}`}
                  value={email}
                  readOnly={busy}
                  aria-invalid={fieldError ? true : undefined}
                  aria-describedby={`${id}-help${fieldError ? ` ${id}-error` : ""}`}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setFieldError(null);
                    setError(null);
                  }}
                />
                {fieldError && (
                  <p id={`${id}-error`} className={styles.fieldError}>
                    {fieldError}
                  </p>
                )}
                <p id={`${id}-help`} className={styles.help}>
                  삼육대학교 이메일(@{SCHOOL_EMAIL_DOMAIN}) 입력
                </p>
              </div>
              <button type="submit" className={styles.primary} disabled={busy}>
                {busy ? "요청 중…" : "재설정 링크 받기"}
              </button>
              {busy && (
                <p role="status" className={styles.muted}>
                  재설정 링크를 요청하고 있어요.
                </p>
              )}
              {error && (
                <p role="alert" className={styles.error}>
                  {error}
                </p>
              )}
            </form>
          </>
        )}
        <Link
          href={path(next ? loginHref(next) : "/login")}
          className={styles.secondary}
        >
          로그인으로 돌아가기
        </Link>
      </section>
    </AuthLayout>
  );
}
