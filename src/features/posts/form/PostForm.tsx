"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/features/auth/AuthProvider";
import { AppShellLeaveGuard } from "../AppShell";
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
import { useAppPath } from "@/features/demo/AppProviders";
import { BagArt, SeatSlots, TaxiArt } from "@/features/ui/art";
import { dayLabel } from "@/lib/dateFormat";
import {
  deadlinePreview,
  quickTime,
  readRecentPlaces,
  rememberPlaces,
  seoulTomorrow,
  suggestTitle,
  usedPlaces,
  withSuggestedTitle,
} from "./formAssist";
import { PICKUP_PLACES, TAXI_PLACES } from "../places";

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
  const path = useAppPath();
  const router = useRouter();
  const { handleUnauthorized, user } = useAuth();
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
  // The form only renders on the client after sign-in, so storage is readable here.
  const [recent] = useState(() => ({
    TAXI: readRecentPlaces("TAXI"),
    DELIVERY: readRecentPlaces("DELIVERY"),
  }));
  const locked = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const pendingLeave = useRef<{ trigger: HTMLElement; href: string } | null>(
    null,
  );
  const setLeaveGuard = useContext(AppShellLeaveGuard);
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
  const blockLeave = useCallback(
    (trigger: HTMLElement, href: string) => {
      if (busy) return true;
      if (!dirty) return false;
      pendingLeave.current = { trigger, href };
      dialog.current?.showModal();
      dialog.current
        ?.querySelector<HTMLButtonElement>("[data-autofocus]")
        ?.focus();
      return true;
    },
    [busy, dirty],
  );

  useLayoutEffect(() => {
    if (!setLeaveGuard) return;
    setLeaveGuard(blockLeave);
    return () => {
      setLeaveGuard(null);
    };
  }, [blockLeave, setLeaveGuard]);
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
    // The title follows the route until the student writes their own.
    setDraft((current) => withSuggestedTitle(current, change(current)));
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

  const setSchedule = (date: string, time: string) =>
    edit(
      (d) =>
        d.type === "TAXI"
          ? { ...d, taxi: { ...d.taxi, date, time } }
          : { ...d, delivery: { ...d.delivery, date, time } },
      ["date", "time"],
    );

  const touch = (field: FieldName) =>
    setTouched((current) =>
      current[field] ? current : { ...current, [field]: true },
    );

  function focusField(field: FieldName) {
    const target = form.current?.querySelector<HTMLElement>(
      `[data-field="${field}"]`,
    );
    if (!target) return;
    target.focus({ preventScroll: true });
    // iOS Safari leaves a field focused by script off-screen while the
    // keyboard is open, so bring it to the middle explicitly.
    target.scrollIntoView?.({ block: "center" });
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
            link: { href: "/my?tab=created", label: "내 참여 · 모집 확인" },
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
        rememberPlaces(draft.type, usedPlaces(draft));
        router.push(path(`/posts/${encodeURIComponent(created)}`));
        return; // stay locked while leaving the page
      }
      await operations.update(postId ?? "", toUpdateRequest(draft, coreLocked));
      if (!coreLocked) rememberPlaces(draft.type, usedPlaces(draft));
      router.push(path(`/posts/${encodeURIComponent(postId ?? "")}`));
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

  const leaveTarget =
    mode === "edit" && postId
      ? `/posts/${encodeURIComponent(postId)}`
      : listPath;

  function leave(trigger: HTMLElement) {
    if (!blockLeave(trigger, leaveTarget)) router.push(path(leaveTarget));
  }

  const placesDone = taxi
    ? !errors.departure && !errors.destination
    : !errors.restaurantName && !errors.pickupLocation;
  const scheduleDone =
    active.time !== "" && !errors.date && !errors.time && !errors.capacity;
  const guideDone =
    !errors.title &&
    !errors.description &&
    !errors.communicationUrl &&
    !errors.orderGuide;
  const sections = [
    { key: "type", label: "유형 선택", done: true },
    { key: "place", label: "장소", done: placesDone },
    { key: "schedule", label: "날짜·시간·정원", done: scheduleDone },
    { key: "guide", label: "안내", done: guideDone },
  ] as const;
  const doneCount = sections.filter((section) => section.done).length;

  const deadline = deadlinePreview(draft.type, active.date, active.time, nowMs);
  const soon30 = quickTime(nowMs, 30);
  const soon60 = quickTime(nowMs, 60);
  const tomorrow = seoulTomorrow(nowMs);
  const suggestedTitle = suggestTitle(draft);
  const titleIsSuggested =
    suggestedTitle !== "" && draft.common.title === suggestedTitle;
  const members = mode === "edit" ? currentMemberCount : 1;

  function goToSection(key: string) {
    const heading = document.getElementById(id(`section-${key}`));
    heading?.focus({ preventScroll: true });
    heading?.scrollIntoView?.({ block: "start" });
  }

  const placeChips = (
    field: "departure" | "destination" | "pickupLocation",
    label: string,
    value: string,
    onPick: (value: string) => void,
  ) =>
    coreLocked ? null : (
      <PlaceChips
        label={label}
        options={taxi ? TAXI_PLACES : PICKUP_PLACES}
        recent={recent[draft.type]}
        value={value}
        disabled={busy}
        onPick={(place) => {
          onPick(place);
          touch(field);
        }}
      />
    );

  return (
    <>
      <Link
        href={path(leaveTarget)}
        className={styles.back}
        onClick={(event) => {
          event.preventDefault();
          leave(event.currentTarget);
        }}
      >
        <span aria-hidden="true">‹</span>{" "}
        {mode === "edit" ? "모집 상세" : "모집글 목록"}
      </Link>
      <div className={styles.heading}>
        <span
          key={draft.type}
          className={styles.headingArt}
          data-type={taxi ? "taxi" : "delivery"}
          aria-hidden="true"
        >
          {taxi ? <TaxiArt /> : <BagArt />}
        </span>
        <div>
          <h1 className={styles.headingTitle}>
            {mode === "edit"
              ? "모집글 수정"
              : `${typeLabels[draft.type]} 모집글 작성`}
          </h1>
          <p className={styles.headingLead}>
            {taxi
              ? "장소와 출발 시간만 정하면 금방 끝나요"
              : "음식점과 주문 마감만 정하면 금방 끝나요"}
          </p>
        </div>
      </div>

      <nav className={styles.progress} aria-label="작성 단계">
        <p className={styles.progressCount}>
          {doneCount}/{sections.length} 완료
        </p>
        <ol className={styles.progressSteps}>
          {sections.map((section, index) => (
            <li key={section.key}>
              <button
                type="button"
                className={styles.progressStep}
                data-done={section.done}
                onClick={() => goToSection(section.key)}
              >
                <span className={styles.stepBadge} aria-hidden="true">
                  {section.done ? "✓" : index + 1}
                </span>
                <span className={styles.progressLabel}>{section.label}</span>
                <span className="sr-only">
                  {section.done ? ", 완료" : ", 입력 전"}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </nav>

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

        <p className={styles.legend}>
          <Tag kind="required" visible /> 꼭 입력해요 ·{" "}
          <Tag kind="optional" visible /> 비워도 돼요
        </p>

        <Section id={id("section-type")} step={1} title="유형 선택">
          <fieldset className={styles.field}>
            <legend className={styles.labelGroup}>
              <span className={styles.label}>카테고리</span>
              <Tag kind="required" />
            </legend>
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
                  <span className={styles.categoryArt} data-type={type}>
                    {type === "TAXI" ? <TaxiArt /> : <BagArt />}
                  </span>
                  {typeLabels[type]}
                </label>
              ))}
            </div>
            {mode === "edit" && (
              <p className={styles.help}>
                등록한 뒤에는 유형을 바꿀 수 없어요.
              </p>
            )}
          </fieldset>
        </Section>

        <Section id={id("section-place")} step={2} title="장소">
          {taxi ? (
            <>
              <TextField
                id={id("departure")}
                name="departure"
                label="출발지"
                required
                value={draft.taxi.departure}
                max={LIMITS.place}
                placeholder="직접 입력하거나 아래에서 골라요"
                readOnly={coreLocked}
                describedBy={coreLocked ? id("lock") : undefined}
                error={shown("departure")}
                onChange={(value) => setTaxi("departure", value)}
                onBlur={() => touch("departure")}
              >
                {placeChips("departure", "출발지", draft.taxi.departure, (v) =>
                  setTaxi("departure", v),
                )}
              </TextField>
              {!coreLocked && (
                <button
                  type="button"
                  className={styles.swap}
                  aria-label="출발지와 도착지 바꾸기"
                  disabled={busy}
                  onClick={() =>
                    edit(
                      (d) => ({
                        ...d,
                        taxi: {
                          ...d.taxi,
                          departure: d.taxi.destination,
                          destination: d.taxi.departure,
                        },
                      }),
                      ["departure", "destination"],
                    )
                  }
                >
                  <SwapIcon />
                  <span aria-hidden="true">바꾸기</span>
                </button>
              )}
              <TextField
                id={id("destination")}
                name="destination"
                label="도착지"
                required
                value={draft.taxi.destination}
                max={LIMITS.place}
                placeholder="직접 입력하거나 아래에서 골라요"
                readOnly={coreLocked}
                describedBy={coreLocked ? id("lock") : undefined}
                error={shown("destination")}
                onChange={(value) => setTaxi("destination", value)}
                onBlur={() => touch("destination")}
              >
                {placeChips(
                  "destination",
                  "도착지",
                  draft.taxi.destination,
                  (v) => setTaxi("destination", v),
                )}
              </TextField>
            </>
          ) : (
            <>
              <TextField
                id={id("restaurantName")}
                name="restaurantName"
                label="음식점명"
                required
                value={draft.delivery.restaurantName}
                max={LIMITS.place}
                placeholder="예: 정문 김밥"
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
                required
                value={draft.delivery.pickupLocation}
                max={LIMITS.place}
                placeholder="직접 입력하거나 아래에서 골라요"
                readOnly={coreLocked}
                describedBy={coreLocked ? id("lock") : undefined}
                error={shown("pickupLocation")}
                onChange={(value) => setDelivery("pickupLocation", value)}
                onBlur={() => touch("pickupLocation")}
              >
                {placeChips(
                  "pickupLocation",
                  "수령 장소",
                  draft.delivery.pickupLocation,
                  (v) => setDelivery("pickupLocation", v),
                )}
              </TextField>
            </>
          )}
        </Section>

        <Section
          id={id("section-schedule")}
          step={3}
          title={taxi ? "날짜·시간·정원" : "주문 마감·정원"}
        >
          <div className={styles.datetime}>
            <Field
              id={id("date")}
              label={`${timeLabel} 날짜`}
              required
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
              {!coreLocked && (
                <div
                  className={styles.chips}
                  role="group"
                  aria-label={`${timeLabel} 날짜 빠르게 고르기`}
                >
                  {[
                    { label: "오늘", date: today },
                    { label: "내일", date: tomorrow },
                  ].map((chip) => (
                    <button
                      key={chip.label}
                      type="button"
                      className={styles.chip}
                      aria-pressed={active.date === chip.date}
                      disabled={busy}
                      onClick={() => {
                        setActive("date", chip.date);
                        touch("date");
                      }}
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
              )}
            </Field>
            <Field
              id={id("time")}
              label={`${timeLabel} 시간`}
              required
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
                  ...(deadline ? [id("deadline")] : []),
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
              {!coreLocked && (
                <div
                  className={styles.chips}
                  role="group"
                  aria-label={`${timeLabel} 시간 빠르게 고르기`}
                >
                  {[
                    { label: "30분 뒤", at: soon30 },
                    { label: "1시간 뒤", at: soon60 },
                  ].map((chip) => (
                    <button
                      key={chip.label}
                      type="button"
                      className={styles.chip}
                      aria-pressed={
                        active.date === chip.at.date &&
                        active.time === chip.at.time
                      }
                      disabled={busy}
                      onClick={() => {
                        setSchedule(chip.at.date, chip.at.time);
                        touch("time");
                      }}
                    >
                      {chip.label}
                      <span className={styles.chipMeta}>{chip.at.time}</span>
                    </button>
                  ))}
                </div>
              )}
            </Field>
          </div>
          <p id={id("time-help")} className={styles.help}>
            서울 시간 기준, 5분 단위로 정해요. 지금부터 10분이 넘게 남은 시각만
            정할 수 있어요.
          </p>
          {deadline && (
            <p
              id={id("deadline")}
              className={styles.deadline}
              data-past={deadline.past}
              aria-live="polite"
            >
              {deadline.text}
            </p>
          )}

          <fieldset className={styles.field}>
            <legend className={styles.labelGroup}>
              <span className={styles.label}>정원</span>
              <Tag kind="required" />
            </legend>
            <div className={styles.stepper}>
              <button
                type="button"
                data-field="capacity"
                aria-label="정원 1명 줄이기"
                aria-describedby={
                  shown("capacity") ? id("capacity-error") : undefined
                }
                disabled={coreLocked || busy || active.capacity <= min}
                onClick={() => setActive("capacity", active.capacity - 1)}
              >
                −
              </button>
              <span className={styles.stepperValue}>
                <SeatSlots
                  className={styles.stepperSeats}
                  total={active.capacity}
                  filled={Math.min(members, active.capacity)}
                />
                <span className={styles.stepperText}>
                  <output aria-live="polite" id={id("capacity")}>
                    나 포함 총 {active.capacity}명
                  </output>
                  <span className={styles.stepperMeta}>
                    {active.capacity - 1}명 모집
                  </span>
                </span>
              </span>
              <button
                type="button"
                aria-label="정원 1명 늘리기"
                aria-describedby={
                  shown("capacity") ? id("capacity-error") : undefined
                }
                disabled={coreLocked || busy || active.capacity >= max}
                onClick={() => setActive("capacity", active.capacity + 1)}
              >
                +
              </button>
            </div>
            {shown("capacity") && (
              <p id={id("capacity-error")} className={styles.error}>
                {shown("capacity")}
              </p>
            )}
            <p className={styles.help}>
              정원은 나 포함 {min}~{max}명으로 정해요
              {mode === "edit"
                ? ` · 현재 ${currentMemberCount} / ${active.capacity}명`
                : ""}
            </p>
          </fieldset>
        </Section>

        <Section id={id("section-guide")} step={4} title="안내">
          <TextField
            id={id("title")}
            name="title"
            label="제목"
            required
            value={draft.common.title}
            max={LIMITS.title}
            placeholder="장소를 고르면 자동으로 채워져요"
            help={
              titleIsSuggested
                ? "장소를 보고 채웠어요. 원하는 대로 고쳐 써도 돼요."
                : undefined
            }
            error={shown("title")}
            onChange={(value) => setCommon("title", value)}
            onBlur={() => touch("title")}
          />

          {!taxi && (
            <TextField
              id={id("orderGuide")}
              name="orderGuide"
              label="주문 안내"
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
            required
            value={draft.common.description}
            max={LIMITS.description}
            placeholder={
              taxi
                ? "만날 장소, 요청사항 등을 적어 주세요"
                : "수령 방법, 요청사항 등을 적어 주세요"
            }
            multiline
            error={shown("description")}
            onChange={(value) => setCommon("description", value)}
            onBlur={() => touch("description")}
          />

          <TextField
            id={id("communicationUrl")}
            name="communicationUrl"
            label="외부 소통 링크"
            value={draft.common.communicationUrl}
            max={LIMITS.communicationUrl}
            placeholder="https://"
            type="url"
            help="참여한 학생에게만 보여요. https:// 링크만 쓸 수 있어요."
            error={shown("communicationUrl")}
            onChange={(value) => setCommon("communicationUrl", value)}
            onBlur={() => touch("communicationUrl")}
          />
        </Section>

        <section
          className={styles.preview}
          aria-labelledby={id("preview")}
          data-type={taxi ? "taxi" : "delivery"}
        >
          <h2 id={id("preview")} className={styles.previewHeading}>
            목록에 이렇게 보여요
          </h2>
          <div className={styles.previewCard}>
            <span className={styles.previewSticker} aria-hidden="true">
              {taxi ? <TaxiArt /> : <BagArt />}
            </span>
            <div className={styles.previewBody}>
              <p className={styles.previewRoute}>
                {taxi ? (
                  <>
                    <Placeholder value={draft.taxi.departure} empty="출발지" />
                    <span aria-hidden="true">→</span>
                    <span className="sr-only">에서</span>
                    <Placeholder
                      value={draft.taxi.destination}
                      empty="도착지"
                    />
                  </>
                ) : (
                  <>
                    <Placeholder
                      value={draft.delivery.restaurantName}
                      empty="음식점"
                    />
                    <span className={styles.previewMeta}>
                      · 수령{" "}
                      <Placeholder
                        value={draft.delivery.pickupLocation}
                        empty="장소"
                      />
                    </span>
                  </>
                )}
              </p>
              <p className={styles.previewWhen}>
                <span>
                  {(() => {
                    const reference = toReferenceTime(active.date, active.time);
                    return reference ? (
                      `${dayLabel(Date.parse(reference), nowMs)} ${active.time} ${timeLabel}`
                    ) : (
                      <span className={styles.previewEmpty}>
                        {timeLabel} 시간을 정하면 보여요
                      </span>
                    );
                  })()}
                </span>
                <span className={styles.previewSeats}>
                  {Math.max(active.capacity - members, 0)}자리 남음
                </span>
              </p>
              <p className={styles.previewMeta}>
                {[
                  typeLabels[draft.type],
                  mode === "create" ? "모집 중" : null,
                  user?.displayName ?? null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
          </div>
        </section>

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
              <Link href={path(phase.link.href)} className={styles.linkButton}>
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
            : "등록하면 모집글 목록에 바로 공개돼요."}
        </p>
        <div className={styles.actions} data-bottom-action="true">
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
        onClose={() => {
          const trigger = pendingLeave.current?.trigger;
          pendingLeave.current = null;
          trigger?.focus();
        }}
      >
        <h2 id={id("discard")} className={styles.label}>
          {mode === "edit"
            ? "수정한 내용을 버릴까요?"
            : "작성 중인 내용을 버릴까요?"}
        </h2>
        <p className={`${styles.help} ${styles.dialogText}`}>
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
              const href = pendingLeave.current?.href;
              pendingLeave.current = null;
              dialog.current?.close();
              if (href) router.push(path(href));
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

/** 필수/선택 tag; the input carries aria-required, so the tag is visual. */
function Tag({
  kind,
  visible = false,
}: {
  kind: "required" | "optional";
  visible?: boolean;
}) {
  return (
    <span
      className={styles.tag}
      data-kind={kind}
      aria-hidden={visible ? undefined : true}
    >
      {kind === "required" ? "필수" : "선택"}
    </span>
  );
}

function Section({
  id,
  step,
  title,
  children,
}: {
  id: string;
  step: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className={styles.section} aria-labelledby={id}>
      <h2 id={id} tabIndex={-1} className={styles.sectionTitle}>
        <span className={styles.stepBadge} aria-hidden="true">
          {step}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Placeholder({ value, empty }: { value: string; empty: string }) {
  const text = value.trim();
  return text ? (
    <span>{text}</span>
  ) : (
    <span className={styles.previewEmpty}>{empty}</span>
  );
}

function SwapIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path
        d="M6 3v13m0 0-3-3m3 3 3-3M14 17V4m0 0-3 3m3-3 3 3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Preset and recent places; a chip fills the input, typing still works. */
function PlaceChips({
  label,
  options,
  recent,
  value,
  disabled,
  onPick,
}: {
  label: string;
  options: readonly string[];
  recent: string[];
  value: string;
  disabled: boolean;
  onPick: (value: string) => void;
}) {
  const current = value.trim();
  const recentOnly = recent.filter((place) => !options.includes(place));
  const chip = (place: string) => (
    <button
      key={place}
      type="button"
      className={styles.chip}
      aria-pressed={current === place}
      disabled={disabled}
      onClick={() => onPick(place)}
    >
      {place}
    </button>
  );
  return (
    <div className={styles.chipRows}>
      {recentOnly.length > 0 && (
        <div
          className={styles.chips}
          role="group"
          aria-label={`${label} 최근 장소`}
        >
          <span className={styles.chipCaption} aria-hidden="true">
            최근
          </span>
          {recentOnly.map(chip)}
        </div>
      )}
      <div
        className={styles.chips}
        role="group"
        aria-label={`${label} 추천 장소`}
      >
        {options.map(chip)}
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  required = false,
  error,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.field}>
      <div className={styles.labelGroup}>
        <label htmlFor={id} className={styles.label}>
          {label}
        </label>
        <Tag kind={required ? "required" : "optional"} />
      </div>
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
  required = false,
  placeholder,
  error,
  help,
  multiline = false,
  readOnly = false,
  describedBy,
  type = "text",
  onChange,
  onBlur,
  children,
}: {
  id: string;
  name: FieldName;
  label: string;
  value: string;
  max: number;
  required?: boolean;
  placeholder?: string;
  error?: string;
  help?: string;
  multiline?: boolean;
  readOnly?: boolean;
  describedBy?: string;
  type?: "text" | "url";
  onChange: (value: string) => void;
  onBlur: () => void;
  children?: ReactNode;
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
    "aria-required": required || undefined,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": described,
    onBlur,
  };

  return (
    <div className={styles.field}>
      <div className={styles.labelRow}>
        <span className={styles.labelGroup}>
          <label htmlFor={id} className={styles.label}>
            {label}
          </label>
          <Tag kind={required ? "required" : "optional"} />
        </span>
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
      {error && (
        <p id={`${id}-error`} className={styles.error}>
          {error}
        </p>
      )}
      {help && (
        <p id={`${id}-help`} className={styles.help}>
          {help}
        </p>
      )}
      {children}
    </div>
  );
}
