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
import { invalidCustomRange, SORT_LABELS, TIME_LABELS } from "./search";
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

/*
 * One set of search controls, shown as the phone's bottom sheet or the
 * desktop sidebar. Changes stay in a draft until "결과 N개 보기", which counts
 * the draft's results before applying it.
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
            <legend className={styles.panelLegend}>경로</legend>
            <PlaceField
              label="출발지"
              value={draft.departure ?? ""}
              suggestions={TAXI_PLACES}
              onChange={(departure) => set({ departure })}
            />
            <button
              type="button"
              className={styles.swap}
              onClick={() =>
                set({
                  departure: draft.destination,
                  destination: draft.departure,
                })
              }
            >
              <span aria-hidden="true">⇅</span> 출발지·도착지 바꾸기
            </button>
            <PlaceField
              label="도착지"
              value={draft.destination ?? ""}
              suggestions={TAXI_PLACES}
              onChange={(destination) => set({ destination })}
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
            <legend className={styles.panelLegend}>음식점·수령</legend>
            <PlaceField
              label="음식점"
              value={draft.restaurant ?? ""}
              onChange={(restaurant) => set({ restaurant })}
            />
            <PlaceField
              label="수령 장소"
              value={draft.pickup ?? ""}
              suggestions={PICKUP_PLACES}
              onChange={(pickup) => set({ pickup })}
            />
          </fieldset>
        )}

        <div className={styles.panelSection}>
          <label className={styles.panelLegend} htmlFor={`${id}-q`}>
            검색어
          </label>
          <input
            id={`${id}-q`}
            className={styles.searchInput}
            value={draft.q ?? ""}
            maxLength={100}
            placeholder={
              draft.type === "ALL" ? "장소나 제목 (예: 석계)" : "장소나 제목"
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
          <div className={styles.choiceRow}>
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

        <fieldset className={styles.panelSection}>
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
        <button
          type="button"
          className={styles.secondary}
          onClick={() => setDraft(resetDraft(draft))}
        >
          초기화
        </button>
        <button
          type="submit"
          className={styles.applyButton}
          aria-disabled={invalid || undefined}
        >
          {count === null ? "결과 보기" : `결과 ${count}개 보기`}
        </button>
      </div>
    </form>
  );
}

/** Text input with one-tap suggestion chips (the post form's place list). */
function PlaceField({
  label,
  value,
  suggestions = [],
  onChange,
}: {
  label: string;
  value: string;
  suggestions?: readonly string[];
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
      {suggestions.length > 0 && (
        <div
          className={styles.choiceRow}
          role="group"
          aria-label={`${label} 추천`}
        >
          {suggestions.map((place) => (
            <button
              key={place}
              type="button"
              className={styles.choice}
              aria-pressed={value === place}
              onClick={() => onChange(value === place ? "" : place)}
            >
              {place}
            </button>
          ))}
        </div>
      )}
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
