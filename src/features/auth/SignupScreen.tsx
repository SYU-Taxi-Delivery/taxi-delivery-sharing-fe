"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { schoolEmailError, SCHOOL_EMAIL_DOMAIN } from "./auth";
import { signupOperations as defaultOperations } from "./authApi";
import { AuthLayout } from "./AuthLayout";
import { useAuth } from "./AuthProvider";
import {
  codeError,
  displayNameError,
  DISPLAY_NAME_MAX,
  DISPLAY_NAME_MIN,
  normalizeDisplayName,
  PASSWORD_MAX,
  PASSWORD_MIN,
  passwordConfirmError,
  passwordError,
  registerErrorMessage,
  requestCodeErrorMessage,
  RESEND_INTERVAL_MS,
  verifyCodeErrorMessage,
  type SignupOperations,
} from "./signup";
import styles from "./auth.module.css";
import { useAppPath } from "@/features/demo/AppProviders";

type EmailStep = "idle" | "sending" | "sent" | "verifying" | "verified";
type Field = "email" | "code" | "displayName" | "password" | "confirm";
type Message = { tone: "info" | "error"; text: string } | null;

const consents = [
  { key: "terms", label: "이용약관 동의" },
  { key: "privacy", label: "개인정보 수집·이용 동의" },
] as const;
type Consent = (typeof consents)[number]["key"];

export function SignupScreen({
  operations = defaultOperations,
}: {
  operations?: SignupOperations;
}) {
  const auth = useAuth();
  const path = useAppPath();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<EmailStep>("idle");
  const [code, setCode] = useState("");
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [emailMessage, setEmailMessage] = useState<Message>(null);
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [agreed, setAgreed] = useState<Record<Consent, boolean>>({
    terms: false,
    privacy: false,
  });
  const [openTerms, setOpenTerms] = useState<Consent | null>(null);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const locked = useRef(false);
  const emailInput = useRef<HTMLInputElement>(null);
  const codeInput = useRef<HTMLInputElement>(null);
  const displayNameInput = useRef<HTMLInputElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  const confirmInput = useRef<HTMLInputElement>(null);
  // Focus moves once the next step's field has rendered.
  const pendingFocus = useRef<"code" | "displayName" | null>(null);
  const baseId = useId();
  const id = (name: string) => `${baseId}-${name}`;

  useEffect(() => {
    if (auth.status === "authenticated") router.replace(path("/"));
  }, [auth.status, router, path]);

  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    (target === "code" ? codeInput : displayNameInput).current?.focus();
  }, [step]);

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

  const verified = step === "verified";
  const ready = verified && agreed.terms && agreed.privacy;

  function showErrors(next: Partial<Record<Field, string>>, order: Field[]) {
    setErrors(next);
    const first = order.find((field) => next[field]);
    if (first) {
      const target = {
        email: emailInput,
        code: codeInput,
        displayName: displayNameInput,
        password: passwordInput,
        confirm: confirmInput,
      }[first];
      target.current?.focus();
    }
    return Boolean(first);
  }

  function clearError(field: Field) {
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function changeEmail(value: string) {
    setEmail(value);
    clearError("email");
    if (step === "sent") {
      // A code belongs to the address it was sent to.
      setStep("idle");
      setCode("");
      setEmailMessage(null);
    }
  }

  function resetVerification() {
    setStep("idle");
    setCode("");
    setSentAt(null);
    setEmailMessage(null);
    emailInput.current?.focus();
  }

  async function requestCode() {
    if (locked.current || cooling) return;
    const address = email.trim();
    const error = schoolEmailError(address);
    if (showErrors({ email: error ?? undefined }, ["email"])) return;
    locked.current = true;
    setStep("sending");
    setEmailMessage(null);
    try {
      await operations.requestCode(address);
      const sent = performance.now();
      setSentAt(sent);
      setNow(sent);
      pendingFocus.current = "code";
      setStep("sent");
      setCode("");
      // Same notice for new and already registered addresses (AC-AUTH-001-09).
      setEmailMessage({
        tone: "info",
        text: "입력한 학교 이메일로 인증번호를 보냈어요. 인증번호는 10분 동안 유효해요.",
      });
    } catch (failure) {
      setStep(step === "sent" ? "sent" : "idle");
      setEmailMessage({
        tone: "error",
        text: requestCodeErrorMessage(failure),
      });
    } finally {
      locked.current = false;
    }
  }

  async function verify() {
    if (locked.current || step !== "sent") return;
    const error = codeError(code);
    if (showErrors({ code: error ?? undefined }, ["code"])) return;
    locked.current = true;
    setStep("verifying");
    setEmailMessage(null);
    try {
      await operations.verifyCode(email.trim(), code);
      pendingFocus.current = "displayName";
      setStep("verified");
      setCode("");
      setEmailMessage({ tone: "info", text: "학교 이메일 인증이 완료됐어요." });
    } catch (failure) {
      setStep("sent");
      setEmailMessage({ tone: "error", text: verifyCodeErrorMessage(failure) });
      codeInput.current?.focus();
    } finally {
      locked.current = false;
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current || !ready) return;
    const next = {
      displayName: displayNameError(displayName) ?? undefined,
      password: passwordError(password) ?? undefined,
      confirm: passwordConfirmError(password, confirm) ?? undefined,
    };
    setSubmitError(null);
    if (showErrors(next, ["displayName", "password", "confirm"])) return;
    locked.current = true;
    setSubmitting(true);
    const name = normalizeDisplayName(displayName);
    try {
      await operations.register({
        email: email.trim(),
        displayName: name,
        password,
      });
      setPassword("");
      setConfirm("");
      setDone(name);
    } catch (failure) {
      const status =
        typeof failure === "object" && failure !== null && "status" in failure
          ? failure.status
          : undefined;
      setSubmitError(registerErrorMessage(failure));
      if (status === 401 || status === 403) {
        setStep("idle");
        setSentAt(null);
        setEmailMessage(null);
      }
    } finally {
      locked.current = false;
      setSubmitting(false);
    }
  }

  const describe = (field: Field, ...extra: string[]) =>
    [errors[field] ? id(`${field}-error`) : null, ...extra]
      .filter(Boolean)
      .join(" ") || undefined;

  const fieldError = (field: Field) =>
    errors[field] && (
      <p id={id(`${field}-error`)} className={styles.fieldError}>
        {errors[field]}
      </p>
    );

  if (done) {
    return (
      <AuthLayout>
        <section className={styles.card} aria-labelledby={id("done")}>
          <h1 id={id("done")} className={styles.title}>
            가입이 완료됐어요
          </h1>
          <p className={styles.muted} role="status">
            {done}님, 학교 이메일과 비밀번호로 로그인해 주세요.
          </p>
          <Link href={path("/login")} className={styles.primary}>
            로그인하러 가기
          </Link>
        </section>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <section className={styles.card} aria-labelledby={id("title")}>
        <div>
          <h1 id={id("title")} className={styles.title}>
            회원가입
          </h1>
          <p className={`${styles.muted} mt-2`}>
            학교 이메일 인증으로 두유팟 시작
          </p>
        </div>
        {operations === defaultOperations && (
          <p className={styles.terms}>
            현재 이메일 인증과 가입 요청을 연결하고 있어요. 데모에서는 가입
            과정을 체험할 수 있어요.{" "}
            <Link href="/signup-preview" className={styles.textLink}>
              가입 데모 보기
            </Link>
          </p>
        )}
        <form
          className={styles.form}
          noValidate
          aria-busy={submitting}
          onSubmit={(event) => void submit(event)}
        >
          <div
            className={styles.field}
            role="group"
            aria-labelledby={id("account")}
          >
            <div className={styles.sectionHeader}>
              <p id={id("account")} className={styles.label}>
                학교 계정
              </p>
              <span className={styles.badge}>
                {verified
                  ? "인증 완료"
                  : step === "sent" || step === "verifying"
                    ? "인증 대기"
                    : "미인증"}
              </span>
            </div>
            <label htmlFor={id("email")} className={styles.srOnly}>
              학교 이메일
            </label>
            <input
              ref={emailInput}
              id={id("email")}
              className={styles.input}
              type="email"
              name="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              placeholder={`example@${SCHOOL_EMAIL_DOMAIN}`}
              value={email}
              readOnly={verified || step === "sending" || step === "verifying"}
              aria-invalid={errors.email ? true : undefined}
              aria-describedby={describe("email", id("email-help"))}
              onChange={(event) => changeEmail(event.target.value)}
            />
            {fieldError("email")}
            {verified ? (
              <button
                type="button"
                className={styles.secondary}
                onClick={resetVerification}
              >
                다른 이메일로 변경
              </button>
            ) : (
              <button
                type="button"
                className={styles.primary}
                disabled={step === "sending" || step === "verifying" || cooling}
                onClick={() => void requestCode()}
              >
                {step === "sending"
                  ? "인증번호 보내는 중…"
                  : sentAt === null
                    ? "인증번호 받기"
                    : cooling
                      ? `인증번호 다시 받기 (${waitSeconds}초)`
                      : "인증번호 다시 받기"}
              </button>
            )}
            <p id={id("email-help")} className={styles.help}>
              삼육대학교 이메일(@{SCHOOL_EMAIL_DOMAIN})로 학교 계정 인증
            </p>
            {(step === "sent" || step === "verifying") && (
              <div className={styles.field}>
                <label htmlFor={id("code")} className={styles.label}>
                  인증번호
                </label>
                <div className={styles.inline}>
                  <input
                    ref={codeInput}
                    id={id("code")}
                    className={styles.input}
                    name="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="6자리 숫자"
                    value={code}
                    readOnly={step === "verifying"}
                    aria-invalid={errors.code ? true : undefined}
                    aria-describedby={describe("code")}
                    onChange={(event) => {
                      setCode(
                        event.target.value.replace(/\D/g, "").slice(0, 6),
                      );
                      clearError("code");
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void verify();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className={styles.secondary}
                    disabled={step === "verifying"}
                    onClick={() => void verify()}
                  >
                    {step === "verifying" ? "확인 중…" : "확인"}
                  </button>
                </div>
                {fieldError("code")}
              </div>
            )}
            {emailMessage && (
              <p
                role={emailMessage.tone === "error" ? "alert" : "status"}
                className={
                  emailMessage.tone === "error" ? styles.error : styles.success
                }
              >
                {emailMessage.text}
              </p>
            )}
          </div>

          <div className={styles.field}>
            <label htmlFor={id("displayName")} className={styles.label}>
              닉네임
            </label>
            <input
              ref={displayNameInput}
              id={id("displayName")}
              className={styles.input}
              name="nickname"
              autoComplete="nickname"
              placeholder="닉네임 입력"
              value={displayName}
              aria-invalid={errors.displayName ? true : undefined}
              aria-describedby={describe("displayName", id("displayName-help"))}
              onChange={(event) => {
                setDisplayName(event.target.value);
                clearError("displayName");
              }}
            />
            {fieldError("displayName")}
            <p id={id("displayName-help")} className={styles.help}>
              커뮤니티에서 사용할 이름 · {DISPLAY_NAME_MIN}~{DISPLAY_NAME_MAX}자
            </p>
          </div>

          <div className={styles.field}>
            <label htmlFor={id("password")} className={styles.label}>
              비밀번호
            </label>
            <input
              ref={passwordInput}
              id={id("password")}
              className={styles.input}
              type="password"
              name="new-password"
              autoComplete="new-password"
              value={password}
              aria-invalid={errors.password ? true : undefined}
              aria-describedby={describe("password", id("password-help"))}
              onChange={(event) => {
                setPassword(event.target.value);
                clearError("password");
              }}
            />
            {fieldError("password")}
            <p id={id("password-help")} className={styles.help}>
              {PASSWORD_MIN}~{PASSWORD_MAX}자 · 다른 사이트와 같은 비밀번호는
              피해 주세요.
            </p>
          </div>

          <div className={styles.field}>
            <label htmlFor={id("confirm")} className={styles.label}>
              비밀번호 확인
            </label>
            <input
              ref={confirmInput}
              id={id("confirm")}
              className={styles.input}
              type="password"
              name="confirm-password"
              autoComplete="new-password"
              value={confirm}
              aria-invalid={errors.confirm ? true : undefined}
              aria-describedby={describe("confirm")}
              onChange={(event) => {
                setConfirm(event.target.value);
                clearError("confirm");
              }}
            />
            {fieldError("confirm")}
          </div>

          <div className={styles.divider} aria-hidden="true" />

          <fieldset className={styles.field}>
            <legend className={`${styles.label} mb-2`}>약관 동의</legend>
            {consents.map(({ key, label }) => (
              <div key={key}>
                <div className={styles.checkRow}>
                  <label className={styles.check}>
                    <input
                      type="checkbox"
                      checked={agreed[key]}
                      onChange={(event) =>
                        setAgreed((value) => ({
                          ...value,
                          [key]: event.target.checked,
                        }))
                      }
                    />
                    [필수] {label}
                  </label>
                  <button
                    type="button"
                    className={styles.textButton}
                    aria-expanded={openTerms === key}
                    aria-controls={id(`${key}-terms`)}
                    aria-label={`${label} 내용 보기`}
                    onClick={() =>
                      setOpenTerms((value) => (value === key ? null : key))
                    }
                  >
                    보기
                  </button>
                </div>
                {openTerms === key && (
                  <p id={id(`${key}-terms`)} className={styles.terms}>
                    {label.replace(" 동의", "")} 전문은 확정 후 제공돼요.
                  </p>
                )}
              </div>
            ))}
          </fieldset>

          <button
            type="submit"
            className={styles.primary}
            disabled={!ready || submitting}
            aria-describedby={id("requirements")}
          >
            {submitting ? "가입 중…" : "회원가입"}
          </button>
          <p id={id("requirements")} className={styles.help}>
            학교 이메일 인증·필수 동의 후 가입
          </p>
          {submitting && (
            <p role="status" className={styles.muted}>
              가입 정보를 확인하고 있어요.
            </p>
          )}
          {submitError && (
            <p role="alert" className={styles.error}>
              {submitError}
            </p>
          )}
        </form>
        <p className={`${styles.muted} text-center`}>
          기존 회원이세요?{" "}
          <Link href={path("/login")} className={styles.textLink}>
            로그인으로 돌아가기
          </Link>
        </p>
      </section>
    </AuthLayout>
  );
}
