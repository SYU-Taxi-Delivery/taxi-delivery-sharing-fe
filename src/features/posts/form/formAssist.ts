/*
 * Small helpers that speed up writing a post without changing what is sent:
 * place chips, recent places, the route-based title, quick times and the
 * participation cutoff preview.
 */
import type { PostType } from "../posts";
import {
  cutoffMinutes,
  participationDeadlineMs,
} from "@/features/participation/participation";
import {
  MINUTE_STEP,
  toReferenceTime,
  toSeoulParts,
  type PostDraft,
} from "./postDraft";

const RECENT_LIMIT = 5;
const recentKey = (type: PostType) => `doyupot:recent-places:${type}`;

/** Last used places for a type, newest first; empty when storage is unavailable. */
export function readRecentPlaces(type: PostType): string[] {
  try {
    const raw = window.localStorage.getItem(recentKey(type));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed
          .filter((item): item is string => typeof item === "string")
          .slice(0, RECENT_LIMIT)
      : [];
  } catch {
    return [];
  }
}

/** Remembers the places of a submitted post (newest first, max 5). */
export function rememberPlaces(type: PostType, places: string[]): void {
  try {
    const used = places.map((place) => place.trim()).filter(Boolean);
    const next = [...new Set([...used, ...readRecentPlaces(type)])].slice(
      0,
      RECENT_LIMIT,
    );
    window.localStorage.setItem(recentKey(type), JSON.stringify(next));
  } catch {
    // Private mode or full storage: recent places are only a convenience.
  }
}

/** Place values the active type's draft would store as "recent". */
export function usedPlaces(draft: PostDraft): string[] {
  return draft.type === "TAXI"
    ? [draft.taxi.departure, draft.taxi.destination]
    : [draft.delivery.pickupLocation];
}

/** Title built from the route, or "" while the route is incomplete. */
export function suggestTitle(draft: PostDraft): string {
  if (draft.type === "TAXI") {
    const from = draft.taxi.departure.trim();
    const to = draft.taxi.destination.trim();
    return from && to ? `${from} → ${to} 택시` : "";
  }
  const restaurant = draft.delivery.restaurantName.trim();
  return restaurant ? `${restaurant} 같이 주문해요` : "";
}

/**
 * Fills the title from the route while it is empty or still the previous
 * suggestion; once the student writes their own title it is left alone.
 */
export function withSuggestedTitle(
  previous: PostDraft,
  next: PostDraft,
): PostDraft {
  const before = suggestTitle(previous);
  const after = suggestTitle(next);
  const title = next.common.title;
  if (after === before || after === title) return next;
  if (title !== "" && title !== before) return next;
  // Clearing an incomplete route's old suggestion keeps later edits automatic.
  return { ...next, common: { ...next.common, title: after } };
}

/** Now plus `minutes`, rounded up to the next 5-minute step, in Seoul parts. */
export function quickTime(
  nowMs: number,
  minutes: number,
): { date: string; time: string } {
  const step = MINUTE_STEP * 60_000;
  return toSeoulParts(Math.ceil((nowMs + minutes * 60_000) / step) * step);
}

/** Tomorrow's Seoul date (`YYYY-MM-DD`). */
export function seoulTomorrow(nowMs: number): string {
  return toSeoulParts(nowMs + 86_400_000).date;
}

/** 이/가 for a "HH:MM" read aloud ("18시가", "18시 5분이", "18:52가"). */
function subjectParticle(time: string): string {
  const minute = time.slice(3);
  if (minute === "00") return "가";
  return "2459".includes(minute.slice(-1)) ? "가" : "이";
}

export type DeadlinePreview = { text: string; past: boolean };

/**
 * The join/cancel cutoff that comes with a reference time. A draft has no
 * server deadline yet, so this uses the same fallback rule as participation.
 */
export function deadlinePreview(
  type: PostType,
  date: string,
  time: string,
  nowMs: number,
): DeadlinePreview | null {
  const referenceTime = toReferenceTime(date, time);
  if (!referenceTime) return null;
  const deadline = participationDeadlineMs({ referenceTime });
  const minutes = cutoffMinutes({ referenceTime });
  const at = toSeoulParts(deadline).time;
  const taxi = type === "TAXI";
  const what = taxi ? "신청·취소 마감" : "참여·취소 마감";
  const before = `${taxi ? "출발" : "주문 마감"} ${minutes}분 전`;
  if (deadline <= nowMs) {
    return {
      text: `${what} ${at}${subjectParticle(at)} 이미 지났어요 (${before})`,
      past: true,
    };
  }
  return {
    text: taxi
      ? `${what} ${at}${subjectParticle(at)} 함께 정해져요 (${before})`
      : `${what} ${at} (${before})`,
    past: false,
  };
}
