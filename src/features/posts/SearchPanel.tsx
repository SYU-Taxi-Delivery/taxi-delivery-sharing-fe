"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { PICKUP_PLACES, TAXI_PLACES } from "./places";
import {
  cleanSearch,
  postQueryHref,
  type Direction,
  type PostListOperations,
  type PostQuery,
  type PostSort,
  type TimeWindow,
} from "./posts";
import { useClientNow } from "./PostCard";
import {
  invalidCustomRange,
  presetRangeText,
  SORT_LABELS,
  TIME_LABELS,
} from "./search";
import { usePostCount } from "./usePostList";
import styles from "./posts.module.css";

const TIME_CHOICES: TimeWindow[] = ["hour", "tonight", "morning", "custom"];
const SORTS: PostSort[] = ["TIME", "RECENT"];

/** Search conditions only; type, 참여 가능만 and page come from the list. */
const resetDraft = (query: PostQuery): PostQuery => ({
  type: query.type,
  joinableOnly: query.joinableOnly,
  page: 0,
});

type RouteKey = "departure" | "destination";
const ROUTE_LABELS: Record<RouteKey, string> = {
  departure: "출발지",
  destination: "도착지",
};

/*
 * One set of search controls, shown as the phone's bottom sheet or the
 * desktop sidebar. Changes stay in a draft until applied; while the draft
 * differs from the list's conditions the footer says so and the button reads
 * "조건 적용하기 · 결과 N개", counting the draft's results first.
 */
export function SearchPanel({
  query,
  operations,
  onApply,
  heading,
  appliedTotal,
}: {
  query: PostQuery;
  operations: PostListOperations;
  onApply: (next: PostQuery) => void;
  /** The panel's title row (sheet: title + close button). */
  heading: ReactNode;
  /** Result count of the applied conditions, from the list itself. */
  appliedTotal: number | null;
}) {
  const [draft, setDraft] = useState<PostQuery>(() =>
    cleanSearch({ ...query, page: 0 }),
  );
  // Where a suggestion chip goes; until an input is picked, 출발지 while it
  // is empty, else 도착지.
  const [picked, setPicked] = useState<RouteKey | null>(null);
  const now = useClientNow();
  const invalid = invalidCustomRange(draft);
  // Unchanged conditions reuse the list's own total instead of asking again.
  const unchanged =
    postQueryHref("", draft) === postQueryHref("", { ...query, page: 0 });
  const drafted = usePostCount(draft, operations, !unchanged && !invalid);
  const count = unchanged ? appliedTotal : drafted;
  const set = (patch: Partial<PostQuery>) =>
    setDraft((current) => ({ ...current, ...patch }));
  const id = useId();
  const taxi = draft.type === "TAXI";
  const delivery = draft.type === "DELIVERY";
  const target: RouteKey =
    picked ?? (draft.departure?.trim() ? "destination" : "departure");
  const range = now === null ? null : presetRangeText(draft, now);

  function suggest(place: string) {
    const current = draft[target] ?? "";
    set({ [target]: current === place ? "" : place });
    // 출발지 just filled: the next chip most likely is the destination.
    if (target === "departure" && current !== place) setPicked("destination");
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (invalid) return;
    onApply(cleanSearch({ ...draft, page: 0 }));
  }

  return (
    <form className={styles.panel} onSubmit={submit} noValidate>
      {heading}
      <div className={styles.panelBody}>
        {taxi && (
          <fieldset className={styles.panelSection}>
            {/* The inputs' own labels say it; read out, not shown. */}
            <legend className={styles.srOnly}>경로</legend>
            <div className={styles.route}>
              {(["departure", "destination"] as const).map((key) => (
                <label
                  key={key}
                  className={styles.routeField}
                  data-target={target === key}
                >
                  <span className={styles.routeLabel}>{ROUTE_LABELS[key]}</span>
                  <input
                    className={styles.searchInput}
                    value={draft[key] ?? ""}
                    maxLength={100}
                    autoComplete="off"
                    placeholder={key === "departure" ? "어디서" : "어디로"}
                    onFocus={() => setPicked(key)}
                    onChange={(event) => set({ [key]: event.target.value })}
                  />
                </label>
              ))}
              <button
                type="button"
                className={styles.swap}
                aria-label="출발지·도착지 바꾸기"
                title="출발지·도착지 바꾸기"
                onClick={() =>
                  set({
                    departure: draft.destination,
                    destination: draft.departure,
                  })
                }
              >
                <span aria-hidden="true">⇅</span>
              </button>
            </div>
            <Suggestions
              places={TAXI_PLACES}
              target={ROUTE_LABELS[target]}
              value={draft[target] ?? ""}
              onPick={suggest}
            />
            <div
              className={styles.choiceRow}
              role="group"
              aria-label="학교 방향"
            >
              {(
                [
                  ["TO_SCHOOL", "학교행"],
                  ["FROM_SCHOOL", "학교발"],
                ] as [Direction, string][]
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={styles.choice}
                  aria-pressed={draft.direction === value}
                  onClick={() =>
                    set({
                      direction: draft.direction === value ? undefined : value,
                    })
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        {delivery && (
          <fieldset className={styles.panelSection}>
            <legend className={styles.srOnly}>음식점·수령 장소</legend>
            <PlaceField
              label="음식점"
              value={draft.restaurant ?? ""}
              onChange={(restaurant) => set({ restaurant })}
            />
            <PlaceField
              label="수령 장소"
              value={draft.pickup ?? ""}
              onChange={(pickup) => set({ pickup })}
            />
            <Suggestions
              places={PICKUP_PLACES}
              target="수령 장소"
              value={draft.pickup ?? ""}
              onPick={(place) =>
                set({ pickup: draft.pickup === place ? "" : place })
              }
            />
          </fieldset>
        )}

        <div className={styles.panelSection}>
          <label className={styles.panelLegend} htmlFor={`${id}-q`}>
            모집글 제목·장소 검색
          </label>
          <input
            id={`${id}-q`}
            className={styles.searchInput}
            value={draft.q ?? ""}
            maxLength={100}
            placeholder={
              draft.type === "ALL" ? "예: 석계, 치킨" : "제목이나 장소"
            }
            onChange={(event) => set({ q: event.target.value })}
          />
          {draft.type === "ALL" && (
            <p className={styles.panelHint}>
              택시나 배달을 고르면 출발지·도착지, 음식점·수령 장소로 좁혀 찾을
              수 있어요.
            </p>
          )}
        </div>

        <fieldset className={styles.panelSection}>
          <legend className={styles.panelLegend}>
            {taxi ? "출발 시간" : delivery ? "주문 마감 시간" : "시간대"}
          </legend>
          <div className={styles.choiceGrid}>
            {TIME_CHOICES.map((value) => (
              <button
                key={value}
                type="button"
                className={styles.choice}
                aria-pressed={draft.time === value}
                onClick={() =>
                  set(
                    draft.time === value
                      ? { time: undefined, from: undefined, to: undefined }
                      : { time: value },
                  )
                }
              >
                {TIME_LABELS[value]}
              </button>
            ))}
          </div>
          {range && (
            <p className={styles.rangeText} data-testid="time-range">
              {range}
            </p>
          )}
          {draft.time === "custom" && (
            <div className={styles.rangeInputs}>
              <label className={styles.rangeField}>
                <span>부터</span>
                <input
                  type="datetime-local"
                  className={styles.searchInput}
                  value={draft.from ?? ""}
                  aria-invalid={invalid || undefined}
                  aria-describedby={invalid ? `${id}-range` : undefined}
                  onChange={(event) => set({ from: event.target.value })}
                />
              </label>
              <label className={styles.rangeField}>
                <span>까지</span>
                <input
                  type="datetime-local"
                  className={styles.searchInput}
                  value={draft.to ?? ""}
                  aria-invalid={invalid || undefined}
                  aria-describedby={invalid ? `${id}-range` : undefined}
                  onChange={(event) => set({ to: event.target.value })}
                />
              </label>
              {invalid && (
                <p
                  id={`${id}-range`}
                  role="alert"
                  className={styles.panelError}
                >
                  끝나는 시각을 시작 시각보다 뒤로 골라 주세요.
                </p>
              )}
            </div>
          )}
        </fieldset>

        <fieldset className={`${styles.panelSection} ${styles.sortOptions}`}>
          <legend className={styles.panelLegend}>정렬</legend>
          {SORTS.map((value) => (
            <label key={value} className={styles.checkRow}>
              <input
                type="radio"
                name={`${id}-sort`}
                checked={(draft.sort ?? "TIME") === value}
                onChange={() =>
                  set({ sort: value === "RECENT" ? "RECENT" : undefined })
                }
              />
              <span>{SORT_LABELS[value]}</span>
            </label>
          ))}
        </fieldset>
      </div>

      <div className={styles.panelFooter}>
        {!unchanged && (
          <p className={styles.draftNote} role="status">
            <strong>적용 안 됨</strong> 바꾼 조건은 아직 목록에 반영되지
            않았어요.
          </p>
        )}
        <button
          type="button"
          className={styles.secondary}
          onClick={() => {
            setDraft(resetDraft(draft));
            setPicked(null);
          }}
        >
          초기화
        </button>
        <button
          type="submit"
          className={styles.applyButton}
          aria-disabled={invalid || undefined}
        >
          {unchanged
            ? count === null
              ? "결과 보기"
              : `결과 ${count}개 보기`
            : count === null
              ? "조건 적용하기"
              : `조건 적용하기 · 결과 ${count}개`}
        </button>
      </div>
    </form>
  );
}

/**
 * One list of place chips for the input named by `target`, which the label
 * spells out: "추천 장소 → 도착지에 넣기".
 */
function Suggestions({
  places,
  target,
  value,
  onPick,
}: {
  places: readonly string[];
  target: string;
  value: string;
  onPick: (place: string) => void;
}) {
  const labelId = useId();
  return (
    <div className={styles.suggestions} role="group" aria-labelledby={labelId}>
      <p id={labelId} className={styles.suggestLabel}>
        추천 장소 <span aria-hidden="true">→</span> <strong>{target}</strong>에
        넣기
      </p>
      <div className={styles.choiceRow}>
        {places.map((place) => (
          <button
            key={place}
            type="button"
            className={styles.choice}
            aria-pressed={value === place}
            onClick={() => onPick(place)}
          >
            {place}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Labelled text input (음식점, 수령 장소). */
function PlaceField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className={styles.placeField}>
      <label className={styles.fieldLabel} htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className={styles.searchInput}
        value={value}
        maxLength={100}
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

/**
 * Phone bottom sheet. Opening moves focus inside, Esc or the backdrop closes
 * it, and focus returns to the 필터 button.
 */
export function SearchSheet({
  open,
  onClose,
  returnFocus,
  titleId,
  children,
}: {
  open: boolean;
  onClose: () => void;
  returnFocus: RefObject<HTMLElement | null>;
  titleId: string;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      element.showModal();
      element.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    } else if (!open && element.open) {
      element.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialog}
      className={styles.sheet}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={() => returnFocus.current?.focus()}
      onClick={(event) => {
        // A tap on the dimmed backdrop (the dialog box itself) closes it.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {open && children}
    </dialog>
  );
}
