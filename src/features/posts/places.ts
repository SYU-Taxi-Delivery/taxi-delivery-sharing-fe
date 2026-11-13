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

/** Delivery pickup suggestions. */
export const PICKUP_PLACES = ["정문", "후문", "기숙사", "학생회관"] as const;
