"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { schoolEmailError, SCHOOL_EMAIL_DOMAIN } from "./auth";
import { signupOperations as defaultOperations } from "./authApi";
import { AuthLayout } from "./AuthLayout";
import { useAuth } from "./AuthProvider";
import {
  CODE_TTL_MS,
  codeError,
  nameError,
  NAME_MAX,
  normalizeName,
  PASSWORD_MAX,
  PASSWORD_MIN,
  passwordConfirmError,
  passwordError,
  registerErrorMessage,
  requestCodeErrorMessage,
  RESEND_INTERVAL_MS,
  STUDENT_NO_MAX,
  studentNoError,
  verifyCodeErrorMessage,
  type SignupOperations,
} from "./signup";
import styles from "./auth.module.css";
import { useAppPath } from "@/features/demo/AppProviders";

type EmailStep = "idle" | "sending" | "sent" | "verifying" | "verified";
type Page = 1 | 2 | 3;
type Field = "email" | "code" | "name" | "studentNo" | "password" | "confirm";
type FocusTarget = Field | "verified" | "terms";
type Message = { tone: "info" | "error"; text: string } | null;

/**
 * The API order is request code → verify code → register, and the consents
 * are only checked on the client, so the screen walks the same order:
 * 1 학교 이메일 인증 → 2 계정 정보 → 3 약관 동의 (register runs on step 3).
 */
const steps = ["학교 이메일 인증", "계정 정보", "약관 동의"] as const;

const consents = [
  { key: "terms", label: "이용약관 동의" },
  { key: "privacy", label: "개인정보 수집·이용 동의" },
] as const;
type Consent = (typeof consents)[number]["key"];

const accountFields: Field[] = ["name", "studentNo", "password", "confirm"];

export function SignupScreen({
  operations = defaultOperations,
}: {
  operations?: SignupOperations;
}) {
  const auth = useAuth();
  const path = useAppPath();
  const router = useRouter();
  const [page, setPage] = useState<Page>(1);
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<EmailStep>("idle");
  // The address the latest code went to; the typed email is never cleared.
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [emailMessage, setEmailMessage] = useState<Message>(null);
  const [name, setName] = useState("");
  const [studentNo, setStudentNo] = useState("");
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
  const allAgreeInput = useRef<HTMLInputElement>(null);
  // Focus moves once the next step's control has rendered.
  const pendingFocus = useRef<FocusTarget | null>(null);
  const baseId = useId();
  const id = (name: string) => `${baseId}-${name}`;
  // Every focus target carries id(target); the step 3 heading is "terms".
  const focus = (target: FocusTarget) =>
    document.getElementById(`${baseId}-${target}`)?.focus();

  useEffect(() => {
    if (auth.status === "authenticated") router.replace(path("/"));
  }, [auth.status, router, path]);

  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    document.getElementById(`${baseId}-${target}`)?.focus();
  }, [page, step, errors, baseId]);

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
  const codeStage = step === "sent" || step === "verifying";
  const allAgreed = consents.every(({ key }) => agreed[key]);
  const someAgreed = consents.some(({ key }) => agreed[key]);

  useEffect(() => {
    if (allAgreeInput.current)
      allAgreeInput.current.indeterminate = someAgreed && !allAgreed;
  }, [someAgreed, allAgreed, page]);

  function focusLater(target: FocusTarget) {
    pendingFocus.current = target;
  }

  function showErrors(next: Partial<Record<Field, string>>, order: Field[]) {
    setErrors(next);
    const first = order.find((field) => next[field]);
    if (first) focus(first);
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

  function editEmail() {
    // Back to the address field with the address still filled in.
    setStep("idle");
    setCode("");
    setEmailMessage(null);
    clearError("code");
    focusLater("email");
  }

  function resumeCode() {
    setStep("sent");
    setEmailMessage(null);
    focusLater("code");
  }

  function resetVerification() {
    setStep("idle");
    setCode("");
    setSentAt(null);
    setSentTo(null);
    setEmailMessage(null);
    focusLater("email");
  }

  async function requestCode() {
    if (locked.current || cooling) return;
    const address = email.trim();
    const error = schoolEmailError(address);
    if (showErrors({ email: error ?? undefined }, ["email"])) return;
    locked.current = true;
    const previous = step;
    setStep("sending");
    setEmailMessage(null);
    setSubmitError(null);
    try {
      await operations.requestCode(address);
      const sent = performance.now();
      setSentAt(sent);
      setNow(sent);
      setSentTo(address);
      focusLater("code");
      setStep("sent");
      setCode("");
      setErrors({});
      // Same notice for new and already registered addresses (AC-AUTH-001-09).
      setEmailMessage({
        tone: "info",
        text: `입력한 학교 이메일로 인증번호를 보냈어요. 인증번호는 발급 후 ${CODE_TTL_MS / 60_000}분 동안 유효해요.`,
      });
    } catch (failure) {
      // A failed resend keeps the code already typed for the same address.
      setStep(previous === "sent" ? "sent" : "idle");
      setEmailMessage({
        tone: "error",
        text: requestCodeErrorMessage(failure),
      });
    } finally {
      locked.current = false;
    }
  }

  async function verify() {
    if (locked.current || step !== "sent" || !sentTo) return;
    const error = codeError(code);
    if (showErrors({ code: error ?? undefined }, ["code"])) return;
    locked.current = true;
    setStep("verifying");
    setEmailMessage(null);
    try {
      await operations.verifyCode(sentTo, code);
      focusLater("name");
      setStep("verified");
      setCode("");
      setPage(2);
      setEmailMessage({ tone: "info", text: "학교 이메일 인증이 완료됐어요." });
    } catch (failure) {
      setStep("sent");
      const expired =
        sentAt !== null && performance.now() - sentAt >= CODE_TTL_MS;
      // The failure sits on the code field itself.
      setErrors({ code: verifyCodeErrorMessage(failure, { expired }) });
      focusLater("code");
    } finally {
      locked.current = false;
    }
  }

  function accountErrors(): Partial<Record<Field, string>> {
    return {
      name: nameError(name) ?? undefined,
      studentNo: studentNoError(studentNo) ?? undefined,
      password: passwordError(password) ?? undefined,
      confirm: passwordConfirmError(password, confirm) ?? undefined,
    };
  }

  function toTerms() {
    setSubmitError(null);
    if (showErrors(accountErrors(), accountFields)) return;
    focusLater("terms");
    setPage(3);
  }

  function back(to: Page) {
    setSubmitError(null);
    setErrors({});
    focusLater(to === 1 ? "verified" : "name");
    setPage(to);
  }

  async function register() {
    if (locked.current || !verified || !allAgreed) return;
    setSubmitError(null);
    const next = accountErrors();
    const first = accountFields.find((field) => next[field]);
    if (first) {
      setErrors(next);
      focusLater(first);
      setPage(2);
      return;
    }
    locked.current = true;
    setSubmitting(true);
    const normalizedName = normalizeName(name);
    try {
      await operations.register({
        studentNo: studentNo.trim(),
        name: normalizedName,
        schoolEmail: email.trim(),
        password,
      });
      setPassword("");
      setConfirm("");
      setDone(normalizedName);
    } catch (failure) {
      const status =
        typeof failure === "object" && failure !== null && "status" in failure
          ? failure.status
          : undefined;
      setSubmitError(registerErrorMessage(failure));
      if (status === 401 || status === 403) {
        // Verification expired: back to step 1, address kept.
        setStep("idle");
        setSentAt(null);
        setSentTo(null);
        setEmailMessage(null);
        focusLater("email");
        setPage(1);
      } else if (status === 400) {
        // Rejected input (usually the password): back to the account step.
        focusLater("password");
        setPage(2);
      }
    } finally {
      locked.current = false;
      setSubmitting(false);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (page === 1) {
      if (verified) back(2);
      else if (step === "sent") void verify();
      else if (step === "idle") void requestCode();
    } else if (page === 2) toTerms();
    else void register();
  }

  const describe = (field: Field, ...extra: string[]) =>
    [errors[field] ? id(`${field}-error`) : null, ...extra]
      .filter(Boolean)
      .join(" ") || undefined;

  const fieldError = (field: Field) =>
    errors[field] && (
      <p
        id={id(`${field}-error`)}
        className={styles.fieldError}
        role={field === "code" ? "alert" : undefined}
      >
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

  const stepHeading = (no: Page, focusId?: string) => (
    <h2
      id={focusId ?? id(`step-${no}`)}
      className={styles.stepTitle}
      tabIndex={focusId ? -1 : undefined}
    >
      <span className={styles.stepNo} aria-hidden="true">
        {no}
      </span>
      {steps[no - 1]}
    </h2>
  );

  const addressBox = (label: string, action: ReactNode) => (
    <div className={styles.addressBox}>
      <p className={styles.addressText}>
        <span className={styles.addressLabel}>{label}</span>
        <strong>{email.trim()}</strong>
      </p>
      {action}
    </div>
  );

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
        <ol className={styles.stepper} aria-label="가입 단계">
          {steps.map((label, index) => {
            const no = index + 1;
            const state = no < page ? "done" : no === page ? "current" : "todo";
            return (
              <li
                key={label}
                className={styles.stepperItem}
                data-state={state}
                aria-current={state === "current" ? "step" : undefined}
              >
                <span className={styles.stepperNo} aria-hidden="true">
                  {state === "done" ? "✓" : no}
                </span>
                <span className={styles.stepperLabel}>
                  {label}
                  {state === "done" && (
                    <span className={styles.srOnly}> 완료</span>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
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
          onSubmit={onSubmit}
        >
          {page === 1 && (
            <section
              className={styles.formSection}
              aria-labelledby={id("step-1")}
            >
              {stepHeading(1)}
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
                      : codeStage
                        ? "인증 대기"
                        : "미인증"}
                  </span>
                </div>

                {verified ? (
                  addressBox(
                    "인증된 학교 이메일",
                    <button
                      id={id("verified")}
                      type="button"
                      className={styles.smallButton}
                      onClick={resetVerification}
                    >
                      다른 이메일로 변경
                    </button>,
                  )
                ) : codeStage ? (
                  <>
                    {addressBox(
                      "인증번호를 보낸 주소",
                      <button
                        type="button"
                        className={styles.smallButton}
                        disabled={step === "verifying"}
                        onClick={editEmail}
                      >
                        이메일 수정
                      </button>,
                    )}
                    <div className={styles.field}>
                      <label htmlFor={id("code")} className={styles.label}>
                        인증번호
                      </label>
                      <div className={styles.inline}>
                        <input
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
                        />
                        <button
                          type="submit"
                          className={styles.secondary}
                          disabled={step === "verifying"}
                        >
                          {step === "verifying" ? "확인 중…" : "확인"}
                        </button>
                      </div>
                      {fieldError("code")}
                    </div>
                    <dl className={styles.timing}>
                      <div>
                        <dt>인증번호 유효 시간</dt>
                        <dd>발급 후 {CODE_TTL_MS / 60_000}분</dd>
                      </div>
                      <div>
                        <dt>다시 받기</dt>
                        <dd aria-live="off">
                          {cooling ? `${waitSeconds}초 후 가능` : "지금 가능"}
                        </dd>
                      </div>
                    </dl>
                    <button
                      type="button"
                      className={styles.secondary}
                      disabled={step === "verifying" || cooling}
                      onClick={() => void requestCode()}
                    >
                      {cooling
                        ? `인증번호 다시 받기 (${waitSeconds}초)`
                        : "인증번호 다시 받기"}
                    </button>
                  </>
                ) : (
                  <>
                    <label htmlFor={id("email")} className={styles.srOnly}>
                      학교 이메일
                    </label>
                    <input
                      id={id("email")}
                      className={styles.input}
                      type="email"
                      name="schoolEmail"
                      inputMode="email"
                      autoComplete="email"
                      autoCapitalize="none"
                      spellCheck={false}
                      placeholder={`example@${SCHOOL_EMAIL_DOMAIN}`}
                      value={email}
                      readOnly={step === "sending"}
                      aria-invalid={errors.email ? true : undefined}
                      aria-describedby={describe("email", id("email-help"))}
                      onChange={(event) => {
                        setEmail(event.target.value);
                        clearError("email");
                      }}
                    />
                    {fieldError("email")}
                    <p id={id("email-help")} className={styles.help}>
                      삼육대학교 이메일(@{SCHOOL_EMAIL_DOMAIN})로 학교 계정 인증
                    </p>
                    <button
                      type="submit"
                      className={styles.primary}
                      disabled={step === "sending" || cooling}
                    >
                      {step === "sending"
                        ? "인증번호 보내는 중…"
                        : cooling
                          ? `인증번호 받기 (${waitSeconds}초)`
                          : "인증번호 받기"}
                    </button>
                    {sentTo !== null && sentTo === email.trim() && (
                      <button
                        type="button"
                        className={styles.secondary}
                        onClick={resumeCode}
                      >
                        받은 인증번호 입력하기
                      </button>
                    )}
                  </>
                )}
                {emailMessage && (
                  <p
                    role={emailMessage.tone === "error" ? "alert" : "status"}
                    className={
                      emailMessage.tone === "error"
                        ? styles.error
                        : styles.success
                    }
                  >
                    {emailMessage.text}
                  </p>
                )}
              </div>
              {verified && (
                <button type="submit" className={styles.primary}>
                  다음
                </button>
              )}
            </section>
          )}

          {page === 2 && (
            <section
              className={styles.formSection}
              aria-labelledby={id("step-2")}
            >
              {stepHeading(2)}
              <p className={styles.help}>
                인증된 학교 이메일 · <strong>{email.trim()}</strong>
              </p>
              <div className={styles.field}>
                <label htmlFor={id("name")} className={styles.label}>
                  이름
                </label>
                <input
                  id={id("name")}
                  className={styles.input}
                  name="name"
                  autoComplete="name"
                  required
                  placeholder="이름 입력"
                  value={name}
                  aria-invalid={errors.name ? true : undefined}
                  aria-describedby={describe(
                    "name",
                    id("name-help"),
                    id("visibility"),
                  )}
                  onChange={(event) => {
                    setName(event.target.value);
                    clearError("name");
                  }}
                />
                {fieldError("name")}
                <p id={id("name-help")} className={styles.help}>
                  학교에 등록된 이름 · 최대 {NAME_MAX}자
                </p>
              </div>
              <div id={id("visibility")} className={styles.visibility}>
                <p className={styles.visibilityTitle}>이름 공개 범위</p>
                <p>
                  이름은 모집글 작성자·참여자 명단·댓글에 보여요. 학교 이메일과
                  학번은 다른 학생에게 보이지 않아요.
                </p>
              </div>

              <div className={styles.field}>
                <label htmlFor={id("studentNo")} className={styles.label}>
                  학번
                </label>
                <input
                  id={id("studentNo")}
                  className={styles.input}
                  type="text"
                  name="studentNo"
                  autoComplete="off"
                  required
                  placeholder="학번 입력"
                  value={studentNo}
                  aria-invalid={errors.studentNo ? true : undefined}
                  aria-describedby={describe("studentNo", id("studentNo-help"))}
                  onChange={(event) => {
                    setStudentNo(event.target.value);
                    clearError("studentNo");
                  }}
                />
                {fieldError("studentNo")}
                <p id={id("studentNo-help")} className={styles.help}>
                  학교에서 발급받은 학번 · 최대 {STUDENT_NO_MAX}자
                </p>
              </div>

              <div className={styles.field}>
                <label htmlFor={id("password")} className={styles.label}>
                  비밀번호
                </label>
                <input
                  id={id("password")}
                  className={styles.input}
                  type="password"
                  name="password"
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
                  {PASSWORD_MIN}~{PASSWORD_MAX}자 · 다른 사이트와 같은
                  비밀번호는 피해 주세요.
                </p>
              </div>

              <div className={styles.field}>
                <label htmlFor={id("confirm")} className={styles.label}>
                  비밀번호 확인
                </label>
                <input
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
              <div className={styles.stepActions}>
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() => back(1)}
                >
                  이전
                </button>
                <button type="submit" className={styles.primary}>
                  다음
                </button>
              </div>
            </section>
          )}

          {page === 3 && (
            <section
              className={styles.formSection}
              aria-labelledby={id("terms")}
            >
              {stepHeading(3, id("terms"))}
              <fieldset className={styles.field}>
                <legend className={styles.srOnly}>약관 동의</legend>
                <label className={`${styles.check} ${styles.allAgree}`}>
                  <input
                    ref={allAgreeInput}
                    type="checkbox"
                    checked={allAgreed}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      setAgreed({ terms: checked, privacy: checked });
                    }}
                  />
                  전체 동의
                </label>
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
              <p
                id={id("requirements")}
                className={allAgreed ? styles.help : styles.blocker}
                aria-live="polite"
              >
                {allAgreed
                  ? "필수 약관에 모두 동의했어요. 가입을 마쳐 주세요."
                  : "필수 약관에 동의해 주세요."}
              </p>
              <div className={styles.stepActions}>
                <button
                  type="button"
                  className={styles.secondary}
                  disabled={submitting}
                  onClick={() => back(2)}
                >
                  이전
                </button>
                <button
                  type="submit"
                  className={styles.primary}
                  disabled={!allAgreed || submitting}
                  aria-describedby={id("requirements")}
                >
                  {submitting ? "가입 중…" : "회원가입"}
                </button>
              </div>
              {submitting && (
                <p role="status" className={styles.muted}>
                  가입 정보를 확인하고 있어요.
                </p>
              )}
            </section>
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
