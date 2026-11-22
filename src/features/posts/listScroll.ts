/*
 * Where the posts list was scrolled when a card was opened, so coming back
 * from the detail page returns to the same spot. sessionStorage can throw
 * (private mode, blocked storage); that is never fatal.
 */
const SCROLL_KEY = "posts:scroll:";

/** Reads (and forgets) the saved position for this list address. */
export function readScroll(key: string): number | null {
  try {
    const raw = window.sessionStorage.getItem(SCROLL_KEY + key);
    if (raw === null) return null;
    window.sessionStorage.removeItem(SCROLL_KEY + key);
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

export function saveScroll(key: string) {
  try {
    window.sessionStorage.setItem(SCROLL_KEY + key, String(window.scrollY));
  } catch {
    // Storage unavailable: coming back simply starts at the top.
  }
}

/** Forgets every saved list position: the logo always opens the top. */
export function clearListScroll() {
  try {
    const storage = window.sessionStorage;
    for (let i = storage.length - 1; i >= 0; i -= 1) {
      const key = storage.key(i);
      if (key?.startsWith(SCROLL_KEY)) storage.removeItem(key);
    }
  } catch {
    // Nothing saved, or storage unavailable.
  }
}
