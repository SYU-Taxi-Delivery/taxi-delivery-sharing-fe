/*
 * Place names students pick most. Shared by the post form (place chips) and
 * the list search (suggestion chips), so both offer the same spellings.
 */

/** Taxi departure/destination suggestions. */
export const TAXI_PLACES = [
  "삼육대학교 정문",
  "삼육대학교 후문",
  "기숙사",
  "석계역 1번 출구",
  "태릉입구역 7번 출구",
  "화랑대역 2번 출구",
] as const;

/**
 * Taxi suggestions in the list search: station names only, since a search
 * for 석계역 already matches every exit (the form keeps exits to meet at).
 */
export const TAXI_SEARCH_PLACES = [
  "삼육대학교 정문",
  "삼육대학교 후문",
  "기숙사",
  "석계역",
  "태릉입구역",
  "화랑대역",
  "별내역",
] as const;

/** Delivery pickup suggestions. */
export const PICKUP_PLACES = ["정문", "후문", "기숙사", "학생회관"] as const;
