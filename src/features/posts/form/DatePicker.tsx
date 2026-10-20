"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import styles from "./form.module.css";

type Ymd = { y: number; m: number; d: number };

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

// Calendar dates are plain days; UTC math avoids the viewer's time zone.
const fieldFormat = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "UTC",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  weekday: "short",
});
const dayLabelFormat = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "UTC",
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "long",
});

function parse(value: string): Ymd | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [y, m, d] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCMonth() === m - 1 ? { y, m, d } : null;
}

const toUtc = ({ y, m, d }: Ymd) => Date.UTC(y, m - 1, d);

function fromUtc(ms: number): Ymd {
  const date = new Date(ms);
  return {
    y: date.getUTCFullYear(),
    m: date.getUTCMonth() + 1,
    d: date.getUTCDate(),
  };
}

const format = ({ y, m, d }: Ymd) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

const addDays = (date: Ymd, days: number) =>
  fromUtc(toUtc(date) + days * 86_400_000);

function addMonths(date: Ymd, months: number): Ymd {
  const first = new Date(Date.UTC(date.y, date.m - 1 + months, 1));
  const last = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return {
    y: first.getUTCFullYear(),
    m: first.getUTCMonth() + 1,
    d: Math.min(date.d, last),
  };
}

const sameDay = (a: Ymd | null, b: Ymd | null) =>
  !!a && !!b && a.y === b.y && a.m === b.m && a.d === b.d;

/**
 * Date field with a calendar popup in the service style. Values are
 * `YYYY-MM-DD` days in Asia/Seoul; `min` is usually today in Seoul.
 */
export function DatePicker({
  id,
  name,
  label,
  value,
  min,
  readOnly = false,
  invalid = false,
  describedBy,
  placeholder = "날짜 선택",
  onChange,
  onBlur,
}: {
  id: string;
  name: string;
  label: string;
  value: string;
  min: string;
  readOnly?: boolean;
  invalid?: boolean;
  describedBy?: string;
  placeholder?: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
}) {
  const selected = parse(value);
  const minDate = parse(min);
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState<Ymd>(
    () => selected ?? minDate ?? fromUtc(Date.now()),
  );
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const moveFocus = useRef(false);
  const titleId = useId();

  const isDisabled = (date: Ymd) => !!minDate && toUtc(date) < toUtc(minDate);
  const clamp = (date: Ymd) =>
    minDate && toUtc(date) < toUtc(minDate) ? minDate : date;

  function show() {
    if (readOnly) return;
    setFocused(clamp(selected ?? minDate ?? fromUtc(Date.now())));
    moveFocus.current = true;
    setOpen(true);
  }

  function close(returnFocus: boolean) {
    setOpen(false);
    onBlur?.();
    if (returnFocus) trigger.current?.focus();
  }

  // Focus follows the active day after opening or keyboard moves.
  useEffect(() => {
    if (!open || !moveFocus.current) return;
    moveFocus.current = false;
    grid.current
      ?.querySelector<HTMLButtonElement>('[data-active="true"]')
      ?.focus();
  }, [open, focused]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) close(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  });

  function select(date: Ymd) {
    if (isDisabled(date)) return;
    onChange(format(date));
    close(true);
  }

  function goTo(date: Ymd) {
    moveFocus.current = true;
    setFocused(clamp(date));
  }

  function onGridKey(event: KeyboardEvent) {
    const weekday = new Date(toUtc(focused)).getUTCDay();
    const moves: Record<string, () => Ymd> = {
      ArrowLeft: () => addDays(focused, -1),
      ArrowRight: () => addDays(focused, 1),
      ArrowUp: () => addDays(focused, -7),
      ArrowDown: () => addDays(focused, 7),
      Home: () => addDays(focused, -weekday),
      End: () => addDays(focused, 6 - weekday),
      PageUp: () => addMonths(focused, -1),
      PageDown: () => addMonths(focused, 1),
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    goTo(move());
  }

  const monthStart = { y: focused.y, m: focused.m, d: 1 };
  const leading = new Date(toUtc(monthStart)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(focused.y, focused.m, 0)).getUTCDate();
  const cells: (Ymd | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => ({
      ...monthStart,
      d: index + 1,
    })),
  ];
  while (cells.length % 7) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, row) =>
    cells.slice(row * 7, row * 7 + 7),
  );
  const prevDisabled =
    !!minDate &&
    (focused.y < minDate.y ||
      (focused.y === minDate.y && focused.m <= minDate.m));
  const today = minDate;

  return (
    <div
      ref={container}
      className={styles.datePicker}
      onKeyDown={(event) => {
        if (open && event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          close(true);
        }
      }}
    >
      <button
        ref={trigger}
        id={id}
        type="button"
        data-field={name}
        className={`${styles.input} ${styles.dateTrigger}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-invalid={invalid}
        aria-disabled={readOnly || undefined}
        aria-describedby={describedBy}
        data-readonly={readOnly}
        onClick={() => (open ? close(false) : show())}
      >
        <span className={selected ? undefined : styles.placeholder}>
          {selected ? fieldFormat.format(toUtc(selected)) : placeholder}
        </span>
        <Image src="/posts/calendar.svg" width={20} height={20} alt="" />
      </button>

      {open && (
        <div
          className={styles.calendar}
          role="dialog"
          aria-modal="false"
          aria-label={`${label} 선택`}
        >
          <div className={styles.calendarHeader}>
            <button
              type="button"
              className={styles.calendarNav}
              aria-label="이전 달"
              disabled={prevDisabled}
              onClick={() => goTo(addMonths(focused, -1))}
            >
              ‹
            </button>
            <p id={titleId} className={styles.calendarTitle} aria-live="polite">
              {focused.y}년 {focused.m}월
            </p>
            <button
              type="button"
              className={styles.calendarNav}
              aria-label="다음 달"
              onClick={() => goTo(addMonths(focused, 1))}
            >
              ›
            </button>
          </div>
          <div
            ref={grid}
            role="grid"
            aria-labelledby={titleId}
            className={styles.calendarGrid}
            onKeyDown={onGridKey}
          >
            <div role="row" className={styles.calendarRow}>
              {WEEKDAYS.map((day, index) => (
                <span
                  key={day}
                  role="columnheader"
                  className={styles.weekday}
                  data-sunday={index === 0}
                  aria-label={`${day}요일`}
                >
                  {day}
                </span>
              ))}
            </div>
            {weeks.map((week, row) => (
              <div key={row} role="row" className={styles.calendarRow}>
                {week.map((date, column) =>
                  date ? (
                    <span
                      key={column}
                      role="gridcell"
                      aria-selected={sameDay(date, selected)}
                    >
                      <button
                        type="button"
                        className={styles.day}
                        tabIndex={sameDay(date, focused) ? 0 : -1}
                        data-active={sameDay(date, focused)}
                        data-today={sameDay(date, today)}
                        data-sunday={column === 0}
                        aria-current={sameDay(date, today) ? "date" : undefined}
                        aria-label={`${dayLabelFormat.format(toUtc(date))}${sameDay(date, today) ? " (오늘)" : ""}`}
                        disabled={isDisabled(date)}
                        onClick={() => select(date)}
                        onFocus={() => {
                          if (!sameDay(date, focused)) setFocused(date);
                        }}
                      >
                        {date.d}
                      </button>
                    </span>
                  ) : (
                    <span key={column} role="gridcell" aria-hidden="true" />
                  ),
                )}
              </div>
            ))}
          </div>
          <div className={styles.calendarFooter}>
            {minDate && (
              <button
                type="button"
                className={styles.calendarLink}
                onClick={() => select(minDate)}
              >
                오늘
              </button>
            )}
            <button
              type="button"
              className={styles.calendarLink}
              onClick={() => close(true)}
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
