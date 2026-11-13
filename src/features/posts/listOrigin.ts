"use client";

import { useSyncExternalStore } from "react";

/*
 * The list a detail page was opened from. Opening a card stores the exact
 * list URL (type, conditions, page) for that post in sessionStorage, so it
 * stays in this browser tab only: a shared link, a new tab or another post
 * finds nothing and the detail falls back to the default list.
 */
const KEY = "posts:origin";

type Origin = { postId: string; href: string };

function read(): Origin | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<Origin>;
    return typeof value.postId === "string" && typeof value.href === "string"
      ? { postId: value.postId, href: value.href }
      : null;
  } catch {
    return null;
  }
}

/** Called when a card on the list at `href` is opened. */
export function rememberListOrigin(postId: string, href: string) {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify({ postId, href }));
  } catch {
    // Storage unavailable: the detail simply links to the default list.
  }
}

const pathname = (href: string) => href.split(/[?#]/)[0];

/**
 * The stored list URL when it belongs to `postId` and points at the same
 * list page as `fallback` (a local path, never another site); else null.
 */
export function listOriginFor(postId: string, fallback: string): string | null {
  const origin = read();
  if (!origin || origin.postId !== postId) return null;
  const { href } = origin;
  if (!href.startsWith("/") || href.startsWith("//")) return null;
  return pathname(href) === pathname(fallback) ? href : null;
}

const noSubscribe = () => () => {};

/**
 * The "모집글 목록" target for a detail page. Server render and hydration use
 * `fallback`; the browser then switches to the remembered list, if any.
 */
export function useListHref(postId: string, fallback: string): string {
  return useSyncExternalStore(
    noSubscribe,
    () => listOriginFor(postId, fallback) ?? fallback,
    () => fallback,
  );
}
