"use client";

import { useEffect, useState } from "react";

/* Text-entry controls that open an on-screen keyboard. */
const TYPING =
  'input:not([type="checkbox"], [type="radio"], [type="button"], [type="submit"], [type="reset"], [type="range"], [type="color"], [type="file"]), textarea, select';

/** How long the bottom area waits after a field loses focus before it returns. */
export const TYPING_RELEASE_MS = 250;

/**
 * True while a text field inside the page has focus. Turning off waits a
 * moment, so a tap on the in-page submit button (which takes focus from the
 * field) finishes on that button before the bottom bar moves back.
 */
export function useTypingFlag() {
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const isField = (target: EventTarget | null) =>
      target instanceof Element && target.matches(TYPING);

    const onFocusIn = (event: FocusEvent) => {
      if (!isField(event.target)) return;
      clearTimeout(timer);
      setTyping(true);
    };
    const onFocusOut = (event: FocusEvent) => {
      if (!isField(event.target)) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!isField(document.activeElement)) setTyping(false);
      }, TYPING_RELEASE_MS);
    };

    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  return typing;
}
