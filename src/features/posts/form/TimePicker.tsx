"use client";

import Image from "next/image";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";
import styles from "./form.module.css";

const pad = (value: number) => String(value).padStart(2, "0");

type Column = "hour" | "minute";

const optionId = (baseId: string, column: Column, item: number) =>
  `${baseId}-${column}-${item}`;

function TimeColumn({
  kind,
  baseId,
  items,
  active,
  current,
  disabled,
  listRef,
  onPick,
  onKey,
}: {
  kind: Column;
  baseId: string;
  items: number[];
  active: number;
  current: number | null;
  disabled: (item: number) => boolean;
  listRef: RefObject<HTMLUListElement | null>;
  onPick: (item: number) => void;
  onKey: (event: KeyboardEvent) => void;
}) {
  const unit = kind === "hour" ? "시" : "분";
  return (
    <div className={styles.timeColumn}>
      <p className={styles.timeHeading} id={`${baseId}-${kind}-label`}>
        {unit}
      </p>
      <ul
        ref={listRef}
        role="listbox"
        tabIndex={0}
        aria-labelledby={`${baseId}-${kind}-label`}
        aria-activedescendant={optionId(baseId, kind, active)}
        className={styles.timeList}
        onKeyDown={onKey}
      >
        {items.map((item) => (
          <li
            key={item}
            id={optionId(baseId, kind, item)}
            role="option"
            aria-selected={item === current}
            aria-disabled={disabled(item) || undefined}
            data-active={item === active}
            className={styles.timeOption}
            onClick={() => onPick(item)}
          >
            {pad(item)}
            {unit}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * `HH:mm` field with hour and minute columns in the service style.
 * Minutes are offered every `step` minutes; `isDisabled` marks times that
 * cannot be chosen (e.g. not more than 10 minutes ahead today).
 */
export function TimePicker({
  id,
  name,
  label,
  value,
  step = 5,
  readOnly = false,
  invalid = false,
  describedBy,
  placeholder = "시간 선택",
  isDisabled = () => false,
  onChange,
  onBlur,
}: {
  id: string;
  name: string;
  label: string;
  value: string;
  step?: number;
  readOnly?: boolean;
  invalid?: boolean;
  describedBy?: string;
  placeholder?: string;
  isDisabled?: (time: string) => boolean;
  onChange: (value: string) => void;
  onBlur?: () => void;
}) {
  const hours = Array.from({ length: 24 }, (_, hour) => hour);
  const minutes = Array.from({ length: 60 / step }, (_, index) => index * step);
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  const selectedHour = match ? Number(match[1]) : null;
  const selectedMinute = match ? Number(match[2]) : null;

  const [open, setOpen] = useState(false);
  const [hour, setHour] = useState(0);
  const [activeHour, setActiveHour] = useState(0);
  const [activeMinute, setActiveMinute] = useState(0);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const hourList = useRef<HTMLUListElement>(null);
  const minuteList = useRef<HTMLUListElement>(null);
  const baseId = useId();

  const time = (h: number, m: number) => `${pad(h)}:${pad(m)}`;
  const hourDisabled = (h: number) =>
    minutes.every((m) => isDisabled(time(h, m)));

  function show() {
    if (readOnly) return;
    const firstOpen = hours.find((h) => !hourDisabled(h)) ?? 0;
    const startHour =
      selectedHour !== null && !hourDisabled(selectedHour)
        ? selectedHour
        : firstOpen;
    const startMinute =
      selectedMinute !== null && minutes.includes(selectedMinute)
        ? selectedMinute
        : (minutes.find((m) => !isDisabled(time(startHour, m))) ?? 0);
    setHour(startHour);
    setActiveHour(startHour);
    setActiveMinute(startMinute);
    setOpen(true);
  }

  function close(returnFocus: boolean) {
    setOpen(false);
    onBlur?.();
    if (returnFocus) trigger.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    hourList.current?.focus();
  }, [open]);

  // Center the active option inside its own list without scrolling the page.
  useEffect(() => {
    if (!open) return;
    for (const [column, item, list] of [
      ["hour", activeHour, hourList.current],
      ["minute", activeMinute, minuteList.current],
    ] as const) {
      const option = document.getElementById(optionId(baseId, column, item));
      if (!list || !option) continue;
      const target =
        option.offsetTop - list.clientHeight / 2 + option.offsetHeight / 2;
      list.scrollTop = Math.max(0, target);
    }
  }, [open, activeHour, activeMinute, baseId]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) close(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  });

  function pickHour(h: number) {
    if (hourDisabled(h)) return;
    setHour(h);
    setActiveHour(h);
    // Keep the chosen minute when it is still allowed in the new hour.
    if (selectedMinute !== null && !isDisabled(time(h, selectedMinute))) {
      onChange(time(h, selectedMinute));
    }
    minuteList.current?.focus();
  }

  function pickMinute(m: number) {
    if (isDisabled(time(hour, m))) return;
    onChange(time(hour, m));
    close(true);
  }

  function onListKey(
    event: KeyboardEvent,
    list: Column,
    items: number[],
    active: number,
    setActive: (item: number) => void,
    pick: (item: number) => void,
  ) {
    const index = items.indexOf(active);
    const moves: Record<string, number> = {
      ArrowDown: index + 1,
      ArrowUp: index - 1,
      Home: 0,
      End: items.length - 1,
    };
    if (event.key === "ArrowRight" && list === "hour") {
      event.preventDefault();
      minuteList.current?.focus();
      return;
    }
    if (event.key === "ArrowLeft" && list === "minute") {
      event.preventDefault();
      hourList.current?.focus();
      return;
    }
    if (event.key in moves) {
      event.preventDefault();
      setActive(
        items[Math.min(items.length - 1, Math.max(0, moves[event.key]))],
      );
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      pick(active);
    }
  }

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
        <span className={match ? undefined : styles.placeholder}>
          {match ? value : placeholder}
        </span>
        <Image src="/posts/clock.svg" width={20} height={20} alt="" />
      </button>

      {open && (
        <div
          className={styles.calendar}
          role="dialog"
          aria-modal="false"
          aria-label={`${label} 선택`}
        >
          <div className={styles.timeColumns}>
            <TimeColumn
              kind="hour"
              baseId={baseId}
              items={hours}
              active={activeHour}
              current={hour}
              disabled={hourDisabled}
              listRef={hourList}
              onPick={pickHour}
              onKey={(event) =>
                onListKey(
                  event,
                  "hour",
                  hours,
                  activeHour,
                  setActiveHour,
                  pickHour,
                )
              }
            />
            <TimeColumn
              kind="minute"
              baseId={baseId}
              items={minutes}
              active={activeMinute}
              current={hour === selectedHour ? selectedMinute : null}
              disabled={(m) => isDisabled(time(hour, m))}
              listRef={minuteList}
              onPick={pickMinute}
              onKey={(event) =>
                onListKey(
                  event,
                  "minute",
                  minutes,
                  activeMinute,
                  setActiveMinute,
                  pickMinute,
                )
              }
            />
          </div>
          <p className={styles.timeHint}>
            {step}분 단위 · 시를 고른 뒤 분을 고르면 입력돼요.
          </p>
          <div className={styles.calendarFooter}>
            <span />
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
