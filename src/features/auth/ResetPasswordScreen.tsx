"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useAppPath } from "@/features/demo/AppProviders";
import { loginHref, schoolEmailError, SCHOOL_EMAIL_LABEL } from "./auth";
import { AuthLayout } from "./AuthLayout";
import {
  passwordResetErrorMessage,
  passwordResetOperations,
  type PasswordResetOperations,
} from "./passwordReset";
import {
  codeError,
  passwordConfirmError,
  passwordError,
  PASSWORD_MIN,
  PASSWORD_MAX,
  PASSWORD_UTF8_MAX,
  RESEND_INTERVAL_MS,
} from "./signup";
import styles from "./auth.module.css";

export function ResetPasswordScreen({
  operations = passwordResetOperations,
  requestFirst = false,
  next,
}: {
  operations?: PasswordResetOperations;
  requestFirst?: boolean;
  next?: string;
}) {
  const path = useAppPath();
  const id = useId();
  const [step, setStep] = useState<"request" | "confirm" | "done">(
    requestFirst ? "request" : "confirm",
  );
  const [fieldError, setFieldError] = useState<{
    name: string;
    message: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [requested, setRequested] = useState(false);
  const [cooldown, setCooldown] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const codeInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setTimeout(
      () => setCooldown(false),
      RESEND_INTERVAL_MS,
    );
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    if (step === "done") heading.current?.focus();
    else if (step === "confirm" && requested) codeInput.current?.focus();
  }, [step, requested]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current || step === "done") return;
    const form = event.currentTarget;
    const send =
      step === "request" ||
      ((event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)
        ?.value === "send";
    if (send && cooldown) return;
    const data = new FormData(form);
    const schoolEmail = String(data.get("schoolEmail") ?? "")
      .trim()
      .toLowerCase();
    const code = String(data.get("code") ?? "");
    const newPassword = String(data.get("newPassword") ?? "");
    const validations: [string, string | null][] = [
      ["schoolEmail", schoolEmailError(schoolEmail)],
    ];
    if (!send)
      validations.push(
        ["code", codeError(code)],
        ["newPassword", passwordError(newPassword)],
        [
          "confirm",
          passwordConfirmError(newPassword, String(data.get("confirm") ?? "")),
        ],
      );
    const invalid = validations.find(
      (entry): entry is [string, string] => !!entry[1],
    );
    setError("");
    if (invalid) {
      const [name, message] = invalid;
      setFieldError({ name, message });
      (form.elements.namedItem(name) as HTMLInputElement).focus();
      return;
    }
    setFieldError(null);
    locked.current = true;
    setBusy(true);
    try {
      if (send) {
        await operations.requestCode(schoolEmail);
        setCooldown(true);
        setRequested(true);
        setStep("confirm");
        codeInput.current?.focus();
      } else {
        await operations.resetPassword({ schoolEmail, code, newPassword });
        form.reset();
        setStep("done");
      }
    } catch (failure) {
      setError(passwordResetErrorMessage(failure));
      if (!send) {
        (form.elements.namedItem("newPassword") as HTMLInputElement).value = "";
        (form.elements.namedItem("confirm") as HTMLInputElement).value = "";
      }
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  function field(name: string, hint?: string) {
    const invalid = fieldError?.name === name;
    return {
      id: id + "-" + name,
      name,
      className: styles.input,
      readOnly: busy,
      "aria-invalid": invalid || undefined,
      "aria-describedby":
        [hint, invalid && id + "-validation"].filter(Boolean).join(" ") ||
        undefined,
    };
  }

  return (
    <AuthLayout>
      <section className={styles.card} aria-labelledby={id + "-title"}>
        <h1
          ref={heading}
          id={id + "-title"}
          className={styles.title}
          tabIndex={-1}
        >
          {step === "done"
            ? "비밀번호를 변경했어요"
            : step === "confirm"
              ? "새 비밀번호 설정"
              : "비밀번호 재설정"}
        </h1>
        {step === "done" ? (
          <p role="status" className={styles.muted}>
            새 비밀번호로 다시 로그인해 주세요.
          </p>
        ) : (
          <>
            {requested && (
              <p role="status" className={styles.muted}>
                가입된 학교 이메일이라면 재설정 인증번호를 받을 수 있어요.
                메일함과 스팸함을 확인해 주세요.
              </p>
            )}
            <form
              method="post"
              className={styles.form}
              noValidate
              aria-busy={busy}
              onChange={() => {
                setFieldError(null);
                setError("");
              }}
              onSubmit={(event) => void submit(event)}
            >
              <div className={styles.field}>
                <label htmlFor={id + "-schoolEmail"} className={styles.label}>
                  학교 이메일
                </label>
                <input
                  {...field("schoolEmail", id + "-email-help")}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  spellCheck={false}
                  autoCapitalize="none"
                />
                <p id={id + "-email-help"} className={styles.help}>
                  {SCHOOL_EMAIL_LABEL}
                </p>
              </div>
              {step === "confirm" && (
                <>
                  <div className={styles.field}>
                    <label htmlFor={id + "-code"} className={styles.label}>
                      인증번호
                    </label>
                    <input
                      {...field("code", id + "-code-help")}
                      ref={codeInput}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                    />
                    <p id={id + "-code-help"} className={styles.help}>
                      메일 발급 후 5분 안에 숫자 6자리를 입력해 주세요.
                    </p>
                  </div>
                  <div className={styles.field}>
                    <label
                      htmlFor={id + "-newPassword"}
                      className={styles.label}
                    >
                      새 비밀번호
                    </label>
                    <input
                      {...field("newPassword", id + "-password-help")}
                      type="password"
                      autoComplete="new-password"
                    />
                    <p id={id + "-password-help"} className={styles.help}>
                      {PASSWORD_MIN}~{PASSWORD_MAX}자, UTF-8 기준{" "}
                      {PASSWORD_UTF8_MAX}바이트 이하로 입력해 주세요.
                    </p>
                  </div>
                  <div className={styles.field}>
                    <label htmlFor={id + "-confirm"} className={styles.label}>
                      새 비밀번호 확인
                    </label>
                    <input
                      {...field("confirm")}
                      type="password"
                      autoComplete="new-password"
                    />
                  </div>
                </>
              )}
              {fieldError && (
                <p
                  role="alert"
                  id={id + "-validation"}
                  className={styles.fieldError}
                >
                  {fieldError.message}
                </p>
              )}
              {error && (
                <p role="alert" className={styles.error}>
                  {error}
                </p>
              )}
              <button type="submit" className={styles.primary} disabled={busy}>
                {busy
                  ? "처리 중…"
                  : step === "request"
                    ? "인증번호 받기"
                    : "비밀번호 변경"}
              </button>
              {step === "confirm" && (
                <button
                  type="submit"
                  value="send"
                  className={styles.secondary}
                  disabled={busy || cooldown}
                >
                  {cooldown
                    ? "재요청은 1분 후에 가능해요"
                    : "인증번호 다시 받기"}
                </button>
              )}
            </form>
            {step === "request" && (
              <Link href={path("/reset-password")} className={styles.textLink}>
                이미 받은 인증번호 입력하기
              </Link>
            )}
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
