"use client";

import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";
import styles from "./demo.module.css";

/*
 * Demo-only controls (state pickers, test accounts, scenario switches) live in
 * one folded "데모 도구" panel at the top of preview pages instead of colored
 * bars over the service UI. AppProviders owns the panel and hands its body
 * here; a preview rendered on its own (tests) shows the controls inline.
 */
type Slot = { element: HTMLElement | null };

const DevToolsSlot = createContext<Slot | undefined>(undefined);
export const DevToolsSlotProvider = DevToolsSlot.Provider;

export function DevTools({ children }: { children: ReactNode }) {
  const slot = useContext(DevToolsSlot);
  if (!slot) return <div className={styles.devInline}>{children}</div>;
  if (!slot.element) return null;
  return createPortal(
    <div className={styles.devControls}>{children}</div>,
    slot.element,
  );
}
