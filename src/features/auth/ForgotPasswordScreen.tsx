"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { loginHref, schoolEmailError, SCHOOL_EMAIL_DOMAIN } from "./auth";
import { AuthLayout } from "./AuthLayout";
import {
  passwordResetFailure,
  passwordResetOperations,
  type PasswordResetOperations,
} from "./passwordReset";
import {
  CODE_TTL_MS,
  PASSWORD_MAX,
  PASSWORD_MIN,
  RESEND_INTERVAL_MS,
  codeError,
  passwordConfirmError,
  passwordError,
} from "./signup";
import styles from "./auth.module.css";
import { useAppPath } from "@/features/demo/AppProviders";

type Field = "email" | "code" | "password" | "confirm";

/**
 * Password reset by school email code: ① the email gets a 6-digit code,
 * ② the code and a new password change it. Then the user logs in again.
 */
export function ForgotPasswordScreen({
  operations = passwordResetOperations,
  next,
}: {
  operations?: PasswordResetOperations;
  next?: string;
}) {
  const path = useAppPath();
  const id = useId();
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<"request" | "confirm" | null>(null);
  const [done, setDone] = useState(false);
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const locked = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  // Focus moves after the render that shows its target.
  const pendingFocus = useRef<Field | "heading" | null>(null);
  const setFocusTarget = (target: Field | "heading") => {
    pendingFocus.current = target;
  };

  // The server ignores a repeat within 60 seconds, so the button waits too.
  const cooling = sentAt !== null && now - sentAt < RESEND_INTERVAL_MS;
  useEffect(() => {
    if (!cooling) return;
    const timer = window.setInterval(() => setNow(performance.now()), 1000);
    return () => window.clearInterval(timer);
  }, [cooling]);
  const waitSeconds =
    sentAt === null
      ? 0
      : Math.max(0, Math.ceil((RESEND_INTERVAL_MS - (now - sentAt)) / 1000));

  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    if (target === "heading") heading.current?.focus();
    else document.getElementById(`${id}-${target}`)?.focus();
  });

  async function requestCode() {
    if (locked.current || cooling) return;
    const address = (sentTo ?? email).trim();
    const invalid = schoolEmailError(address);
    setErrors(invalid ? { email: invalid } : {});
    setError(null);
    if (invalid) return setFocusTarget("email");
    locked.current = true;
    setBusy("request");
    try {
      await operations.requestCode(address);
      const sent = performance.now();
      setSentAt(sent);
      setNow(sent);
      setSentTo(address);
      setCode("");
      setNotice(
        `가입된 학교 이메일이라면 인증번호를 보냈어요. ${CODE_TTL_MS / 60_000}분 안에 입력해 주세요. 메일이 보이지 않으면 스팸함도 확인해 주세요.`,
      );
      setFocusTarget("code");
    } catch (failure) {
      const result = passwordResetFailure(failure);
      setError(result.message);
      setFocusTarget(sentTo ? "code" : "email");
    } finally {
      locked.current = false;
      setBusy(null);
    }
  }

  async function confirmReset() {
    if (locked.current || !sentTo) return;
    const next: Partial<Record<Field, string>> = {
      code: codeError(code) ?? undefined,
      password: passwordError(password) ?? undefined,
      confirm: passwordConfirmError(password, confirm) ?? undefined,
    };
    setErrors(next);
    setError(null);
    const first = (["code", "password", "confirm"] as const).find(
      (field) => next[field],
    );
    if (first) return setFocusTarget(first);
    locked.current = true;
    setBusy("confirm");
    try {
      await operations.confirm({ email: sentTo, code, password });
      setPassword("");
      setConfirm("");
      setDone(true);
      setFocusTarget("heading");
    } catch (failure) {
      const result = passwordResetFailure(failure);
      if (result.field === "code" || result.field === "password") {
        setErrors({ [result.field]: result.message });
      } else {
        setError(result.message);
      }
      if (result.newCode) setCode("");
      setPassword("");
      setConfirm("");
      setFocusTarget(result.field === "password" ? "password" : "code");
    } finally {
      locked.current = false;
      setBusy(null);
    }
  }

  function changeEmail() {
    setSentTo(null);
    setSentAt(null);
    setCode("");
    setPassword("");
    setConfirm("");
    setErrors({});
    setError(null);
    setNotice(null);
    setFocusTarget("email");
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sentTo) void confirmReset();
    else void requestCode();
  }

  const describe = (field: Field, ...extra: string[]) =>
    [errors[field] ? `${id}-${field}-error` : null, ...extra]
      .filter(Boolean)
      .join(" ") || undefined;
  const fieldError = (field: Field) =>
    errors[field] && (
      <p
        id={`${id}-${field}-error`}
        className={styles.fieldError}
        role={field === "code" ? "alert" : undefined}
      >
        {errors[field]}
      </p>
    );
  const clear = (field: Field) => {
    setErrors((current) => ({ ...current, [field]: undefined }));
    setError(null);
  };
  const loginLink = path(next ? loginHref(next) : "/login");

  return (
    <AuthLayout>
      <section className={styles.card} aria-labelledby={`${id}-title`}>
        <h1
          ref={heading}
          id={`${id}-title`}
          className={`${styles.title} ${styles.noticeTitle}`}
          tabIndex={-1}
        >
          {done ? "비밀번호를 변경했어요" : "비밀번호 재설정"}
        </h1>
        {done ? (
          <>
            <p role="status" className={styles.muted}>
              새 비밀번호로 다시 로그인해 주세요.
            </p>
            <Link href={loginLink} className={styles.primary}>
              로그인하러 가기
            </Link>
          </>
        ) : (
          <>
            <p className={styles.muted}>
              {sentTo
                ? "메일로 받은 인증번호와 새 비밀번호를 입력해 주세요."
                : "가입할 때 사용한 학교 이메일로 인증번호를 보내 드려요."}
            </p>
            <form
              className={styles.form}
              noValidate
              aria-busy={busy !== null}
              onSubmit={submit}
            >
              <div className={styles.field}>
                <label htmlFor={`${id}-email`} className={styles.label}>
                  학교 이메일
                </label>
                <input
                  id={`${id}-email`}
                  className={styles.input}
                  type="email"
                  name="email"
                  inputMode="email"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder={`example@${SCHOOL_EMAIL_DOMAIN}`}
                  value={sentTo ?? email}
                  readOnly={busy !== null || sentTo !== null}
                  aria-invalid={errors.email ? true : undefined}
                  aria-describedby={describe("email", `${id}-email-help`)}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    clear("email");
                  }}
                />
                {fieldError("email")}
                <p id={`${id}-email-help`} className={styles.help}>
                  삼육대학교 이메일(@{SCHOOL_EMAIL_DOMAIN}) 입력
                </p>
                {sentTo && (
                  <button
                    type="button"
                    className={styles.secondary}
                    disabled={busy !== null}
                    onClick={changeEmail}
                  >
                    이메일 바꾸기
                  </button>
                )}
              </div>

              {notice && sentTo && (
                <p role="status" className={styles.muted}>
                  {notice}
                </p>
              )}

              {sentTo ? (
                <>
                  <div className={styles.field}>
                    <label htmlFor={`${id}-code`} className={styles.label}>
                      인증번호
                    </label>
                    <input
                      id={`${id}-code`}
                      className={styles.input}
                      type="text"
                      name="code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      placeholder="6자리 숫자"
                      value={code}
                      readOnly={busy !== null}
                      aria-invalid={errors.code ? true : undefined}
                      aria-describedby={describe("code")}
                      onChange={(event) => {
                        setCode(event.target.value.replace(/\D/g, ""));
                        clear("code");
                      }}
                    />
                    {fieldError("code")}
                    <button
                      type="button"
                      className={styles.secondary}
                      disabled={busy !== null || cooling}
                      onClick={() => void requestCode()}
                    >
                      {cooling
                        ? `인증번호 다시 받기 (${waitSeconds}초 후)`
                        : "인증번호 다시 받기"}
                    </button>
                  </div>
                  <div className={styles.field}>
                    <label htmlFor={`${id}-password`} className={styles.label}>
                      새 비밀번호
                    </label>
                    <input
                      id={`${id}-password`}
                      className={styles.input}
                      type="password"
                      name="new-password"
                      autoComplete="new-password"
                      value={password}
                      readOnly={busy !== null}
                      aria-invalid={errors.password ? true : undefined}
                      aria-describedby={describe(
                        "password",
                        `${id}-password-help`,
                      )}
                      onChange={(event) => {
                        setPassword(event.target.value);
                        clear("password");
                      }}
                    />
                    {fieldError("password")}
                    <p id={`${id}-password-help`} className={styles.help}>
                      {PASSWORD_MIN}~{PASSWORD_MAX}자(한글은 약 24자까지) · 다른
                      서비스에서 쓰지 않는 비밀번호로 설정해 주세요.
                    </p>
                  </div>
                  <div className={styles.field}>
                    <label htmlFor={`${id}-confirm`} className={styles.label}>
                      새 비밀번호 확인
                    </label>
                    <input
                      id={`${id}-confirm`}
                      className={styles.input}
                      type="password"
                      name="confirm-password"
                      autoComplete="new-password"
                      value={confirm}
                      readOnly={busy !== null}
                      aria-invalid={errors.confirm ? true : undefined}
                      aria-describedby={describe("confirm")}
                      onChange={(event) => {
                        setConfirm(event.target.value);
                        clear("confirm");
                      }}
                    />
                    {fieldError("confirm")}
                  </div>
                  <button
                    type="submit"
                    className={styles.primary}
                    disabled={busy !== null}
                  >
                    {busy === "confirm" ? "변경 중…" : "비밀번호 변경"}
                  </button>
                </>
              ) : (
                <button
                  type="submit"
                  className={styles.primary}
                  disabled={busy !== null}
                >
                  {busy === "request" ? "요청 중…" : "인증번호 받기"}
                </button>
              )}
              {busy && (
                <p role="status" className={styles.muted}>
                  {busy === "request"
                    ? "인증번호를 요청하고 있어요."
                    : "비밀번호를 변경하고 있어요."}
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
        {!done && (
          <Link href={loginLink} className={styles.secondary}>
            로그인으로 돌아가기
          </Link>
        )}
      </section>
    </AuthLayout>
  );
}
