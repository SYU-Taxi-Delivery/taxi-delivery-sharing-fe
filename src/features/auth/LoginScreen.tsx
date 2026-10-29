"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import {
  loginErrorMessage,
  safeNextPath,
  SCHOOL_EMAIL_DOMAIN,
  validateLogin,
  type LoginFieldErrors,
} from "./auth";
import { AuthLayout } from "./AuthLayout";
import { useAuth } from "./AuthProvider";
import styles from "./auth.module.css";

export function LoginScreen({ next = "/" }: { next?: string }) {
  const auth = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<LoginFieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const emailInput = useRef<HTMLInputElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  const ids = {
    title: useId(),
    email: useId(),
    emailHelp: useId(),
    emailError: useId(),
    password: useId(),
    passwordError: useId(),
  };
  const destination = safeNextPath(next);
  const authenticated = auth.status === "authenticated";

  useEffect(() => {
    if (authenticated) router.replace(destination);
  }, [authenticated, destination, router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current) return;
    const credentials = { email: email.trim(), password };
    const errors = validateLogin(credentials);
    setFieldErrors(errors);
    setError(null);
    auth.clearNotice();
    if (errors.email) return emailInput.current?.focus();
    if (errors.password) return passwordInput.current?.focus();

    locked.current = true;
    setBusy(true);
    try {
      await auth.login(credentials);
      setPassword("");
    } catch (failure) {
      setPassword("");
      setError(loginErrorMessage(failure));
      locked.current = false;
      setBusy(false);
      passwordInput.current?.focus();
    }
  }

  const message = error
    ? { title: "로그인 정보 확인", text: error, tone: "error" as const }
    : auth.notice
      ? {
          title: auth.notice.tone === "error" ? "로그아웃 확인" : "안내",
          text: auth.notice.message,
          tone: auth.notice.tone,
        }
      : null;

  return (
    <AuthLayout>
      <section className={styles.card} aria-labelledby={ids.title}>
        <div>
          <h1 id={ids.title} className={styles.title}>
            로그인
          </h1>
          <p className={`${styles.muted} mt-2`}>
            삼육대학교 학생 택시·배달 모임
          </p>
        </div>
        <form
          className={styles.form}
          noValidate
          aria-busy={busy}
          onSubmit={(event) => void submit(event)}
        >
          <div className={styles.field}>
            <label htmlFor={ids.email} className={styles.label}>
              학교 이메일
            </label>
            <input
              ref={emailInput}
              id={ids.email}
              className={styles.input}
              type="email"
              name="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder={`example@${SCHOOL_EMAIL_DOMAIN}`}
              value={email}
              readOnly={busy}
              aria-invalid={fieldErrors.email ? true : undefined}
              aria-describedby={
                fieldErrors.email
                  ? `${ids.emailError} ${ids.emailHelp}`
                  : ids.emailHelp
              }
              onChange={(event) => setEmail(event.target.value)}
            />
            {fieldErrors.email && (
              <p id={ids.emailError} className={styles.fieldError}>
                {fieldErrors.email}
              </p>
            )}
            <p id={ids.emailHelp} className={styles.help}>
              삼육대학교 이메일(@{SCHOOL_EMAIL_DOMAIN}) 입력
            </p>
          </div>
          <div className={styles.field}>
            <label htmlFor={ids.password} className={styles.label}>
              비밀번호
            </label>
            <input
              ref={passwordInput}
              id={ids.password}
              className={styles.input}
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              readOnly={busy}
              aria-invalid={fieldErrors.password ? true : undefined}
              aria-describedby={
                fieldErrors.password ? ids.passwordError : undefined
              }
              onChange={(event) => setPassword(event.target.value)}
            />
            {fieldErrors.password && (
              <p id={ids.passwordError} className={styles.fieldError}>
                {fieldErrors.password}
              </p>
            )}
          </div>
          <button
            type="submit"
            className={styles.primary}
            disabled={busy || authenticated}
          >
            {busy ? "로그인 중…" : "로그인"}
          </button>
        </form>
        <Link href="/forgot-password" className={styles.textLink}>
          비밀번호를 잊으셨나요?
        </Link>
        <Link href="/signup" className={styles.secondary}>
          회원가입
        </Link>
        {busy && (
          <p role="status" className={styles.muted}>
            로그인 정보를 확인하고 있어요.
          </p>
        )}
        {message && (
          <>
            <div className={styles.divider} aria-hidden="true" />
            <div
              className={styles.box}
              role={message.tone === "error" ? "alert" : "status"}
            >
              <p className={styles.boxTitle}>{message.title}</p>
              <p
                className={
                  message.tone === "error" ? styles.error : styles.muted
                }
              >
                {message.text}
              </p>
            </div>
          </>
        )}
        {auth.serverLogoutPending && (
          <button
            type="button"
            className={styles.secondary}
            disabled={auth.loggingOut}
            onClick={() => void auth.logout()}
          >
            {auth.loggingOut ? "로그아웃 확인 중…" : "서버 로그아웃 다시 시도"}
          </button>
        )}
      </section>
    </AuthLayout>
  );
}
