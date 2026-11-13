"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import styles from "./detail.module.css";

export type MoreMenuItem = {
  label: string;
  /** Disabled items stay visible so the menu reads the same every time. */
  disabled?: boolean;
  tone?: "danger";
  onSelect: (trigger: HTMLButtonElement) => void;
};

/**
 * "더보기" (⋯) button in the detail header. Enter/Space or a click opens it
 * and focuses the first item; arrows move between items; Escape, Tab out or
 * a tap outside closes it, and Escape returns focus to the button. Choosing
 * an item closes the menu and focuses the button first, so a dialog opened
 * from the item returns focus there.
 */
export function MoreMenu({ items }: { items: MoreMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const enabled = () =>
    Array.from(
      menu.current?.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]:not(:disabled)',
      ) ?? [],
    );

  useEffect(() => {
    if (!open) return;
    enabled()[0]?.focus();
    const away = (event: PointerEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!open) return;
    if (event.key === "Escape") {
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const list = enabled();
      if (list.length === 0) return;
      const index = list.indexOf(document.activeElement as HTMLButtonElement);
      const step = event.key === "ArrowDown" ? 1 : -1;
      list[(index + step + list.length) % list.length].focus();
    }
  }

  return (
    <div
      ref={wrap}
      className={styles.more}
      onKeyDown={onKeyDown}
      onBlur={(event) => {
        if (!wrap.current?.contains(event.relatedTarget as Node | null))
          setOpen(false);
      }}
    >
      <button
        ref={trigger}
        type="button"
        className={styles.moreButton}
        aria-label="더보기"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle cx="6" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="18" cy="12" r="1.8" />
        </svg>
      </button>
      {open && (
        <div
          ref={menu}
          id={menuId}
          role="menu"
          aria-label="더보기"
          className={styles.menu}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={styles.menuItem}
              data-tone={item.tone}
              disabled={item.disabled}
              onClick={() => {
                const button = trigger.current;
                setOpen(false);
                if (!button) return;
                button.focus();
                item.onSelect(button);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
