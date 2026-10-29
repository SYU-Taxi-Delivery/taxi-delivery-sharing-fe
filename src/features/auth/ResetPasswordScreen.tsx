"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { AuthLayout } from "./AuthLayout";
import {
  PasswordResetError,
  passwordResetErrorMessage,
  passwordResetOperations,
  type PasswordResetOperations,
} from "./passwordReset";
import {
  PASSWORD_MAX,
  PASSWORD_MIN,
  passwordConfirmError,
  passwordError,
} from "./signup";
import styles from "./auth.module.css";

export function ResetPasswordScreen({
  token,
  operations = passwordResetOperations,
}: {
  token?: string;
  operations?: PasswordResetOperations;
}) {
  return (
    <ResetPasswordForm key={token} token={token} operations={operations} />
  );
}

function ResetPasswordForm({
  token,
  operations,
}: {
  token?: string;
  operations: PasswordResetOperations;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{
    password?: string;
    confirm?: string;
  }>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [rejectedLink, setRejectedLink] = useState(false);
  const locked = useRef(false);
  const passwordInput = useRef<HTMLInputElement>(null);
  const confirmInput = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const id = useId();
  const invalidLink = !token?.trim() || rejectedLink;

  useEffect(() => {
    if (done || invalidLink) heading.current?.focus();
  }, [done, invalidLink]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current || !token?.trim() || rejectedLink) return;
    const next = {
      password: passwordError(password) ?? undefined,
      confirm: passwordConfirmError(password, confirm) ?? undefined,
    };
    setErrors(next);
    setError(null);
    if (next.password) return passwordInput.current?.focus();
    if (next.confirm) return confirmInput.current?.focus();

    locked.current = true;
    setBusy(true);
    try {
      await operations.resetPassword({
        token,
        password: password.normalize("NFC"),
      });
      setDone(true);
    } catch (failure) {
      if (
        failure instanceof PasswordResetError &&
        failure.kind === "invalidLink"
      ) {
        setRejectedLink(true);
      } else {
        setError(passwordResetErrorMessage(failure));
        passwordInput.current?.focus();
      }
    } finally {
      setPassword("");
      setConfirm("");
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
          tabIndex={done || invalidLink ? -1 : undefined}
        >
          {done
            ? "비밀번호를 변경했어요"
            : invalidLink
              ? "재설정 링크를 확인해 주세요"
              : "새 비밀번호 설정"}
        </h1>
        {done ? (
          <p role="status" className={styles.muted}>
            새 비밀번호로 다시 로그인해 주세요.
          </p>
        ) : invalidLink ? (
          <>
            <p role="alert" className={styles.error}>
              {passwordResetErrorMessage(new PasswordResetError("invalidLink"))}
            </p>
            <Link href="/forgot-password" className={styles.primary}>
              새 재설정 링크 받기
            </Link>
          </>
        ) : (
          <>
            <p className={styles.muted}>
              다른 서비스에서 쓰지 않는 비밀번호로 설정해 주세요.
            </p>
            <form
              className={styles.form}
              noValidate
              aria-busy={busy}
              onSubmit={(event) => void submit(event)}
            >
              <div className={styles.field}>
                <label htmlFor={`${id}-password`} className={styles.label}>
                  새 비밀번호
                </label>
                <input
                  ref={passwordInput}
                  id={`${id}-password`}
                  className={styles.input}
                  type="password"
                  name="new-password"
                  autoComplete="new-password"
                  value={password}
                  readOnly={busy}
                  aria-invalid={errors.password ? true : undefined}
                  aria-describedby={`${id}-help${errors.password ? ` ${id}-password-error` : ""}`}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setErrors((current) => ({
                      ...current,
                      password: undefined,
                    }));
                    setError(null);
                  }}
                />
                {errors.password && (
                  <p id={`${id}-password-error`} className={styles.fieldError}>
                    {errors.password}
                  </p>
                )}
                <p id={`${id}-help`} className={styles.help}>
                  {PASSWORD_MIN}~{PASSWORD_MAX}자로 입력해 주세요. 공백도 사용할
                  수 있어요.
                </p>
              </div>
              <div className={styles.field}>
                <label htmlFor={`${id}-confirm`} className={styles.label}>
                  새 비밀번호 확인
                </label>
                <input
                  ref={confirmInput}
                  id={`${id}-confirm`}
                  className={styles.input}
                  type="password"
                  name="confirm-password"
                  autoComplete="new-password"
                  value={confirm}
                  readOnly={busy}
                  aria-invalid={errors.confirm ? true : undefined}
                  aria-describedby={
                    errors.confirm ? `${id}-confirm-error` : undefined
                  }
                  onChange={(event) => {
                    setConfirm(event.target.value);
                    setErrors((current) => ({
                      ...current,
                      confirm: undefined,
                    }));
                    setError(null);
                  }}
                />
                {errors.confirm && (
                  <p id={`${id}-confirm-error`} className={styles.fieldError}>
                    {errors.confirm}
                  </p>
                )}
              </div>
              <button type="submit" className={styles.primary} disabled={busy}>
                {busy ? "변경 중…" : "비밀번호 변경"}
              </button>
              {busy && (
                <p role="status" className={styles.muted}>
                  비밀번호를 변경하고 있어요.
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
        <Link href="/login" className={styles.secondary}>
          로그인으로 돌아가기
        </Link>
      </section>
    </AuthLayout>
  );
}
