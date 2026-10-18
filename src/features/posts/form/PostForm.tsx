"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/features/auth/AuthProvider";
import { PostCard } from "../PostCard";
import { DatePicker } from "./DatePicker";
import { TimePicker } from "./TimePicker";
import { toPostSummaries, type PostSummary } from "../posts";
import {
  CAPACITY,
  FIELD_ORDER,
  LIMITS,
  MIN_LEAD_MS,
  MINUTE_STEP,
  PostFormError,
  toPostRequest,
  toReferenceTime,
  toSeoulParts,
  toUpdateRequest,
  usedLength,
  validateDraft,
  type DeliveryDraft,
  type FieldErrors,
  type FieldName,
  type PostDraft,
  type PostFormOperations,
  type TaxiDraft,
} from "./postDraft";
import styles from "./form.module.css";

type Phase =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "similar"; candidates: PostSummary[] }
  | { kind: "similarFailed" }
  | { kind: "submitting" }
  | { kind: "error"; message: string; link?: { href: string; label: string } };

export type PostFormProps = {
  mode: "create" | "edit";
  initialDraft: PostDraft;
  operations: PostFormOperations;
  listPath: string;
  postId?: string;
  coreLocked?: boolean;
  lockReason?: string | null;
  originalReferenceTime?: string;
  currentMemberCount?: number;
  /** Edit only: reload the post after the server reports a conflict. */
  onConflict?: () => void;
  /** Shown when the form opens, e.g. why it was reloaded. */
  initialMessage?: string;
};

const typeLabels = { TAXI: "택시", DELIVERY: "배달" } as const;

export function PostForm({
  mode,
  initialDraft,
  operations,
  listPath,
  postId,
  coreLocked = false,
  lockReason = null,
  originalReferenceTime,
  currentMemberCount = 1,
  onConflict,
  initialMessage,
}: PostFormProps) {
  const router = useRouter();
  const { handleUnauthorized } = useAuth();
  const [draft, setDraft] = useState(initialDraft);
  const [initial] = useState(() => JSON.stringify(initialDraft));
  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>(
    {},
  );
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const [phase, setPhase] = useState<Phase>(() =>
    initialMessage
      ? { kind: "error", message: initialMessage }
      : { kind: "idle" },
  );
  const [nowMs, setNowMs] = useState(() => Date.now());
  const locked = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const dialogReturn = useRef<HTMLElement | null>(null);
  const phaseHeading = useRef<HTMLHeadingElement>(null);
  const baseId = useId();
  const id = (name: string) => `${baseId}-${name}`;

  // Keeps the "10 minutes ahead" feedback current while the form stays open.
  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (phase.kind === "similar" || phase.kind === "similarFailed") {
      phaseHeading.current?.focus();
    }
  }, [phase.kind]);

  const errors = useMemo(
    () => validateDraft(draft, { nowMs, coreLocked, originalReferenceTime }),
    [draft, nowMs, coreLocked, originalReferenceTime],
  );
  const dirty = JSON.stringify(draft) !== initial;
  const busy = phase.kind === "checking" || phase.kind === "submitting";
  const taxi = draft.type === "TAXI";
  const active = taxi ? draft.taxi : draft.delivery;
  const { min, max } = CAPACITY[draft.type];
  const today = toSeoulParts(nowMs).date;
  const timeLabel = taxi ? "출발" : "주문 마감";

  const shown = (field: FieldName) =>
    serverErrors[field] ??
    (submitted || touched[field] ? errors[field] : undefined);

  function edit(
    change: (current: PostDraft) => PostDraft,
    fields: FieldName[],
  ) {
    setDraft(change);
    setServerErrors((current) => {
      const next = { ...current };
      for (const field of fields) delete next[field];
      return next;
    });
    // Candidates and errors belong to the values they were checked against.
    if (phase.kind !== "submitting" && phase.kind !== "checking") {
      setPhase({ kind: "idle" });
    }
  }

  const setCommon = (field: keyof PostDraft["common"], value: string) =>
    edit((d) => ({ ...d, common: { ...d.common, [field]: value } }), [field]);
  const setTaxi = <K extends keyof TaxiDraft>(field: K, value: TaxiDraft[K]) =>
    edit(
      (d) => ({ ...d, taxi: { ...d.taxi, [field]: value } }),
      [field as FieldName],
    );
  const setDelivery = <K extends keyof DeliveryDraft>(
    field: K,
    value: DeliveryDraft[K],
  ) =>
    edit(
      (d) => ({ ...d, delivery: { ...d.delivery, [field]: value } }),
      [field as FieldName],
    );
  const setActive = (
    field: "date" | "time" | "capacity",
    value: string | number,
  ) =>
    taxi ? setTaxi(field, value as never) : setDelivery(field, value as never);

  const touch = (field: FieldName) =>
    setTouched((current) =>
      current[field] ? current : { ...current, [field]: true },
    );

  function focusField(field: FieldName) {
    form.current
      ?.querySelector<HTMLElement>(`[data-field="${field}"]`)
      ?.focus();
  }

  function failWith(error: unknown) {
    if (error instanceof ApiError && error.status === 401) {
      handleUnauthorized();
      setPhase({ kind: "idle" });
      return;
    }
    if (error instanceof Error && error.name === "PostFormNotConnectedError") {
      setPhase({
        kind: "error",
        message:
          "모집글 작성 연동을 준비하고 있어요. 잠시 후 다시 이용해 주세요.",
      });
      return;
    }
    if (error instanceof PostFormError) {
      const fieldErrors: FieldErrors = { ...error.fieldErrors };
      let message = "입력한 내용을 확인해 주세요.";
      if (error.kind === "duplicate") {
        fieldErrors.time =
          "같은 시각(분)에 이미 작성한 모집이 있어요. 다른 시각을 선택해 주세요.";
        message = "같은 시각에 작성한 모집이 있어 등록하지 않았어요.";
      } else if (error.kind === "time") {
        fieldErrors.time = `서버 시각 기준으로 ${timeLabel}까지 10분이 넘게 남지 않았어요. 더 늦은 시각을 선택해 주세요.`;
        message = "시각 조건을 만족하지 않아 저장하지 않았어요.";
      } else if (error.kind === "forbidden") {
        message =
          mode === "edit"
            ? "이 모집을 수정할 권한이 없어요."
            : "모집글을 작성할 권한이 없어요.";
      } else if (error.kind === "notFound") {
        message = "모집을 찾을 수 없어요. 목록에서 다시 확인해 주세요.";
      } else if (error.kind === "conflict") {
        // The parent reloads the post and shows the message on the new form.
        onConflict?.();
        return;
      }
      setServerErrors(fieldErrors);
      setPhase({ kind: "error", message });
      const first = FIELD_ORDER.find((field) => fieldErrors[field]);
      if (first) focusField(first);
      return;
    }
    // A lost or broken response does not prove the write failed (AC-POST-002-11).
    setPhase(
      mode === "create"
        ? {
            kind: "error",
            message:
              "등록 결과를 확인하지 못했어요. 이미 등록됐을 수 있으니 내 모집에서 확인한 뒤 다시 시도해 주세요.",
            link: { href: "/my", label: "내 참여 · 모집 확인" },
          }
        : {
            kind: "error",
            message:
              "저장 결과를 확인하지 못했어요. 모집 상세에서 최신 내용을 확인한 뒤 다시 시도해 주세요.",
            link: postId
              ? {
                  href: `/posts/${encodeURIComponent(postId)}`,
                  label: "모집 상세 확인",
                }
              : undefined,
          },
    );
  }

  async function save() {
    locked.current = true;
    setPhase({ kind: "submitting" });
    try {
      if (mode === "create") {
        const created = await operations.create(toPostRequest(draft));
        router.push(`/posts/${encodeURIComponent(created)}`);
        return; // stay locked while leaving the page
      }
      await operations.update(postId ?? "", toUpdateRequest(draft, coreLocked));
      router.push(`/posts/${encodeURIComponent(postId ?? "")}`);
      return;
    } catch (error) {
      locked.current = false;
      failWith(error);
    }
  }

  async function checkSimilar() {
    locked.current = true;
    setPhase({ kind: "checking" });
    let candidates: PostSummary[];
    try {
      candidates = toPostSummaries(
        await operations.findSimilar(toPostRequest(draft)),
      ).filter((post) => post.status === "OPEN");
    } catch (error) {
      locked.current = false;
      if (error instanceof ApiError && error.status === 401) {
        handleUnauthorized();
        return;
      }
      // A failed suggestion never blocks writing (AC-DISC-005-13).
      setPhase({ kind: "similarFailed" });
      return;
    }
    if (candidates.length > 0) {
      locked.current = false;
      setPhase({ kind: "similar", candidates });
      return;
    }
    await save();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current) return;
    const now = Date.now();
    setNowMs(now);
    setSubmitted(true);
    const current = validateDraft(draft, {
      nowMs: now,
      coreLocked,
      originalReferenceTime,
    });
    const first = FIELD_ORDER.find((field) => current[field]);
    if (first) {
      setPhase({ kind: "idle" });
      focusField(first);
      return;
    }
    if (mode === "create") void checkSimilar();
    else void save();
  }

  function continueAnyway() {
    if (locked.current) return;
    void save();
  }

  function leave(trigger: HTMLElement) {
    const target =
      mode === "edit" && postId
        ? `/posts/${encodeURIComponent(postId)}`
        : listPath;
    if (!dirty || busy) {
      if (!busy) router.push(target);
      return;
    }
    dialogReturn.current = trigger;
    dialog.current?.showModal();
    dialog.current
      ?.querySelector<HTMLButtonElement>("[data-autofocus]")
      ?.focus();
  }

  const leaveTarget =
    mode === "edit" && postId
      ? `/posts/${encodeURIComponent(postId)}`
      : listPath;

  return (
    <>
      <Link
        href={leaveTarget}
        className={styles.back}
        onClick={(event) => {
          event.preventDefault();
          leave(event.currentTarget);
        }}
      >
        <span aria-hidden="true">‹</span>{" "}
        {mode === "edit" ? "모집 상세" : "모집글 목록"}
      </Link>
      <h1 className="mt-2 text-2xl font-bold">
        {mode === "edit"
          ? "모집글 수정"
          : `${typeLabels[draft.type]} 모집글 작성`}
      </h1>
      <p className="mt-1 text-[var(--posts-muted)]">
        {taxi ? "출발지·도착지·시간 입력" : "음식점·수령 장소·주문 마감 입력"}
      </p>

      <form
        ref={form}
        className={styles.form}
        noValidate
        aria-busy={busy}
        onSubmit={submit}
      >
        {lockReason && (
          <p className={styles.notice} id={id("lock")}>
            {lockReason}
          </p>
        )}

        <fieldset className={styles.field}>
          <legend className={`${styles.label} mb-2`}>카테고리</legend>
          <div className={styles.categories}>
            {(["TAXI", "DELIVERY"] as const).map((type) => (
              <label key={type} className={styles.category}>
                <input
                  type="radio"
                  name="type"
                  value={type}
                  checked={draft.type === type}
                  disabled={mode === "edit" || busy}
                  onChange={() => edit((d) => ({ ...d, type }), [])}
                />
                <Image
                  src={
                    type === "TAXI" ? "/posts/taxi.svg" : "/posts/delivery.svg"
                  }
                  width={24}
                  height={24}
                  alt=""
                />
                {typeLabels[type]}
              </label>
            ))}
          </div>
          {mode === "edit" && (
            <p className={styles.help}>등록한 뒤에는 유형을 바꿀 수 없어요.</p>
          )}
        </fieldset>

        <TextField
          id={id("title")}
          name="title"
          label="제목"
          value={draft.common.title}
          max={LIMITS.title}
          placeholder="제목 입력"
          error={shown("title")}
          onChange={(value) => setCommon("title", value)}
          onBlur={() => touch("title")}
        />

        <div className={styles.divider} aria-hidden="true" />
        <h2 className={styles.sectionTitle}>
          {taxi ? "이동 정보" : "배달 정보"}
        </h2>

        {taxi ? (
          <>
            <TextField
              id={id("departure")}
              name="departure"
              label="출발지"
              value={draft.taxi.departure}
              max={LIMITS.place}
              placeholder="출발지 입력"
              readOnly={coreLocked}
              describedBy={coreLocked ? id("lock") : undefined}
              error={shown("departure")}
              onChange={(value) => setTaxi("departure", value)}
              onBlur={() => touch("departure")}
            />
            <TextField
              id={id("destination")}
              name="destination"
              label="도착지"
              value={draft.taxi.destination}
              max={LIMITS.place}
              placeholder="도착지 입력"
              readOnly={coreLocked}
              describedBy={coreLocked ? id("lock") : undefined}
              error={shown("destination")}
              onChange={(value) => setTaxi("destination", value)}
              onBlur={() => touch("destination")}
            />
          </>
        ) : (
          <>
            <TextField
              id={id("restaurantName")}
              name="restaurantName"
              label="음식점명"
              value={draft.delivery.restaurantName}
              max={LIMITS.place}
              placeholder="음식점명 입력"
              readOnly={coreLocked}
              describedBy={coreLocked ? id("lock") : undefined}
              error={shown("restaurantName")}
              onChange={(value) => setDelivery("restaurantName", value)}
              onBlur={() => touch("restaurantName")}
            />
            <TextField
              id={id("pickupLocation")}
              name="pickupLocation"
              label="수령 장소"
              value={draft.delivery.pickupLocation}
              max={LIMITS.place}
              placeholder="수령 장소 입력"
              readOnly={coreLocked}
              describedBy={coreLocked ? id("lock") : undefined}
              error={shown("pickupLocation")}
              onChange={(value) => setDelivery("pickupLocation", value)}
              onBlur={() => touch("pickupLocation")}
            />
          </>
        )}

        <div className={styles.datetime}>
          <Field
            id={id("date")}
            label={`${timeLabel} 날짜`}
            error={shown("date")}
          >
            <DatePicker
              id={id("date")}
              name="date"
              label={`${timeLabel} 날짜`}
              value={active.date}
              min={today}
              readOnly={coreLocked}
              invalid={!!shown("date")}
              describedBy={describe(id, "date", shown("date"), coreLocked)}
              onChange={(value) => setActive("date", value)}
              onBlur={() => touch("date")}
            />
          </Field>
          <Field
            id={id("time")}
            label={`${timeLabel} 시간`}
            error={shown("time")}
          >
            <TimePicker
              id={id("time")}
              name="time"
              label={`${timeLabel} 시간`}
              value={active.time}
              step={MINUTE_STEP}
              readOnly={coreLocked}
              invalid={!!shown("time")}
              describedBy={describe(
                id,
                "time",
                shown("time"),
                coreLocked,
                id("time-help"),
              )}
              isDisabled={(time) => {
                const reference = toReferenceTime(active.date, time);
                if (!reference) return false;
                if (reference === originalReferenceTime) return false;
                return Date.parse(reference) - nowMs <= MIN_LEAD_MS;
              }}
              onChange={(value) => setActive("time", value)}
              onBlur={() => touch("time")}
            />
          </Field>
        </div>
        <p id={id("time-help")} className={`${styles.help} -mt-3`}>
          서울 시간 기준 · 5분 단위 · 지금부터 10분이 넘게 남은 시각만 정할 수
          있어요.
        </p>

        <fieldset className={styles.field}>
          <legend className={`${styles.label} mb-2`}>정원</legend>
          <div className={styles.stepper}>
            <button
              type="button"
              data-field="capacity"
              aria-label="정원 1명 줄이기"
              disabled={coreLocked || busy || active.capacity <= min}
              onClick={() => setActive("capacity", active.capacity - 1)}
            >
              −
            </button>
            <output aria-live="polite" id={id("capacity")}>
              {active.capacity}명
            </output>
            <button
              type="button"
              aria-label="정원 1명 늘리기"
              disabled={coreLocked || busy || active.capacity >= max}
              onClick={() => setActive("capacity", active.capacity + 1)}
            >
              +
            </button>
          </div>
          <p className={styles.help}>
            작성자 포함 전체 정원 {min}~{max}명 ·{" "}
            {mode === "edit"
              ? `현재 ${currentMemberCount} / ${active.capacity}명`
              : `등록 시 1 / ${active.capacity}명`}
          </p>
          {shown("capacity") && (
            <p className={styles.error}>{shown("capacity")}</p>
          )}
        </fieldset>

        {!taxi && (
          <TextField
            id={id("orderGuide")}
            name="orderGuide"
            label="주문 안내 (선택)"
            value={draft.delivery.orderGuide}
            max={LIMITS.orderGuide}
            placeholder="메뉴 고르는 방법, 정산 방식 등"
            multiline
            error={shown("orderGuide")}
            onChange={(value) => setDelivery("orderGuide", value)}
            onBlur={() => touch("orderGuide")}
          />
        )}

        <TextField
          id={id("description")}
          name="description"
          label="함께할 학생에게 전할 말"
          value={draft.common.description}
          max={LIMITS.description}
          placeholder={
            taxi
              ? "모집 내용 입력\n장소·시간·요청사항"
              : "모집 내용 입력\n수령 장소, 시간, 요청사항"
          }
          multiline
          error={shown("description")}
          onChange={(value) => setCommon("description", value)}
          onBlur={() => touch("description")}
        />

        <TextField
          id={id("communicationUrl")}
          name="communicationUrl"
          label="외부 소통 링크 (선택)"
          value={draft.common.communicationUrl}
          max={LIMITS.communicationUrl}
          placeholder="https://"
          type="url"
          help="참여한 학생에게만 보여요. https:// 링크만 쓸 수 있어요."
          error={shown("communicationUrl")}
          onChange={(value) => setCommon("communicationUrl", value)}
          onBlur={() => touch("communicationUrl")}
        />

        <div className={styles.divider} aria-hidden="true" />

        {phase.kind === "similar" && (
          <section className={styles.similar} aria-labelledby={id("similar")}>
            <h2
              id={id("similar")}
              ref={phaseHeading}
              tabIndex={-1}
              className={styles.label}
            >
              비슷한 모집이 {phase.candidates.length}개 있어요
            </h2>
            <p className={styles.help}>
              같은 날짜·{taxi ? "경로" : "음식점과 수령 장소"}의 모집이에요.
              기존 모집 보기로 참여하거나 새로 작성할 수 있어요.
            </p>
            <ul>
              {phase.candidates.map((post) => (
                <li key={post.id}>
                  <PostCard post={post} />
                </li>
              ))}
            </ul>
            <button
              type="button"
              className={styles.secondary}
              onClick={continueAnyway}
            >
              그래도 새로 작성
            </button>
          </section>
        )}

        {phase.kind === "similarFailed" && (
          <section className={styles.alert} aria-labelledby={id("similar")}>
            <h2
              id={id("similar")}
              ref={phaseHeading}
              tabIndex={-1}
              role="alert"
              className={styles.label}
            >
              비슷한 모집을 확인하지 못했어요
            </h2>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.secondary}
                onClick={() => {
                  if (!locked.current) void checkSimilar();
                }}
              >
                다시 확인
              </button>
              <button
                type="button"
                className={styles.secondary}
                onClick={continueAnyway}
              >
                확인 없이 등록
              </button>
            </div>
          </section>
        )}

        {phase.kind === "error" && (
          <div className={styles.alert} role="alert">
            <p>{phase.message}</p>
            {phase.link && (
              <Link href={phase.link.href} className={styles.linkButton}>
                {phase.link.label}
              </Link>
            )}
          </div>
        )}

        {busy && (
          <p role="status" className={styles.help}>
            {phase.kind === "checking"
              ? "비슷한 모집이 있는지 확인하고 있어요."
              : mode === "edit"
                ? "수정 내용을 저장하고 있어요."
                : "모집글을 등록하고 있어요."}
          </p>
        )}

        <p className={styles.help}>
          {mode === "edit"
            ? "저장하면 모집글 목록과 상세에 바로 반영돼요."
            : "등록 시 모집글 목록에 공개"}
        </p>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.secondary}
            onClick={(event) => leave(event.currentTarget)}
            disabled={busy}
          >
            취소
          </button>
          <button type="submit" className={styles.primary} disabled={busy}>
            {phase.kind === "checking"
              ? "확인 중…"
              : phase.kind === "submitting"
                ? mode === "edit"
                  ? "저장 중…"
                  : "등록 중…"
                : mode === "edit"
                  ? "저장하기"
                  : "등록하기"}
          </button>
        </div>
      </form>

      <dialog
        ref={dialog}
        className={styles.dialog}
        aria-labelledby={id("discard")}
        onClose={() => dialogReturn.current?.focus()}
      >
        <h2 id={id("discard")} className={styles.label}>
          {mode === "edit"
            ? "수정한 내용을 버릴까요?"
            : "작성 중인 내용을 버릴까요?"}
        </h2>
        <p className={`${styles.help} mt-2 mb-4`}>
          {mode === "edit"
            ? "저장하지 않은 수정 내용이 사라져요."
            : "입력한 내용은 저장되지 않고 사라져요."}
        </p>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.secondary}
            data-autofocus
            onClick={() => dialog.current?.close()}
          >
            돌아가기
          </button>
          <button
            type="button"
            className={styles.primary}
            onClick={() => {
              dialogReturn.current = null;
              dialog.current?.close();
              router.push(leaveTarget);
            }}
          >
            입력 폐기
          </button>
        </div>
      </dialog>
    </>
  );
}

function describe(
  id: (name: string) => string,
  field: string,
  error: string | undefined,
  locked: boolean,
  ...extra: string[]
) {
  return (
    [error ? id(`${field}-error`) : null, locked ? id("lock") : null, ...extra]
      .filter(Boolean)
      .join(" ") || undefined
  );
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}

function TextField({
  id,
  name,
  label,
  value,
  max,
  placeholder,
  error,
  help,
  multiline = false,
  readOnly = false,
  describedBy,
  type = "text",
  onChange,
  onBlur,
}: {
  id: string;
  name: FieldName;
  label: string;
  value: string;
  max: number;
  placeholder?: string;
  error?: string;
  help?: string;
  multiline?: boolean;
  readOnly?: boolean;
  describedBy?: string;
  type?: "text" | "url";
  onChange: (value: string) => void;
  onBlur: () => void;
}) {
  const used = usedLength(value);
  const described =
    [
      error ? `${id}-error` : null,
      `${id}-count`,
      help ? `${id}-help` : null,
      describedBy ?? null,
    ]
      .filter(Boolean)
      .join(" ") || undefined;
  const common = {
    id,
    name,
    "data-field": name,
    value,
    placeholder,
    readOnly,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": described,
    onBlur,
  };

  return (
    <div className={styles.field}>
      <div className={styles.labelRow}>
        <label htmlFor={id} className={styles.label}>
          {label}
        </label>
        <span
          id={`${id}-count`}
          className={styles.counter}
          data-over={used > max}
        >
          {used}/{max}자
        </span>
      </div>
      {multiline ? (
        <textarea
          {...common}
          className={styles.textarea}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          {...common}
          className={styles.input}
          type={type}
          inputMode={type === "url" ? "url" : undefined}
          autoComplete="off"
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {help && (
        <p id={`${id}-help`} className={styles.help}>
          {help}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}
