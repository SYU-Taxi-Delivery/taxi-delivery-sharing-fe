// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  cleanSearch,
  hasSearch,
  isFilteredQuery,
  parsePostQuery,
  postQueryHref,
  type PostQuery,
} from "./posts";
import {
  customRangeLabel,
  invalidCustomRange,
  matchesSearch,
  newPostHref,
  placeKey,
  presetRangeText,
  searchChips,
  TIME_LABELS,
  timeRange,
} from "./search";

const base: PostQuery = { type: "ALL", joinableOnly: true, page: 0 };
// Friday 2026-11-13 22:47 in Seoul.
const NOW = Date.parse("2026-11-13T22:47:30+09:00");

describe("검색 조건 주소", () => {
  it("모든 조건을 주소에 쓰고 다시 읽으면 같은 조건이 된다", () => {
    const query: PostQuery = {
      type: "TAXI",
      joinableOnly: false,
      page: 2,
      q: "역",
      departure: "석계역",
      destination: "삼육대학교 정문",
      direction: "TO_SCHOOL",
      time: "custom",
      from: "2026-11-14T21:00",
      to: "2026-11-14T23:00",
      sort: "RECENT",
    };
    const href = postQueryHref("/posts", query);
    expect(href).toBe(
      "/posts?type=TAXI&joinable=false&q=%EC%97%AD&departure=%EC%84%9D%EA%B3%84%EC%97%AD&destination=%EC%82%BC%EC%9C%A1%EB%8C%80%ED%95%99%EA%B5%90+%EC%A0%95%EB%AC%B8&direction=TO_SCHOOL&time=custom&from=2026-11-14T21%3A00&to=2026-11-14T23%3A00&sort=RECENT&page=3",
    );
    expect(
      parsePostQuery(Object.fromEntries(new URLSearchParams(href.slice(7)))),
    ).toEqual(query);
  });

  it("유형에 맞지 않는 장소, 잘못된 방향·시간·정렬은 버린다", () => {
    expect(
      parsePostQuery({
        type: "DELIVERY",
        departure: "석계",
        restaurant: " 김밥 ",
        direction: "UP",
        time: "noon",
        sort: "OLD",
      }),
    ).toEqual({
      type: "DELIVERY",
      joinableOnly: true,
      page: 0,
      restaurant: "김밥",
    });
    // 직접 시간은 올바른 시각이 하나라도 있어야 한다.
    expect(parsePostQuery({ time: "custom", from: "tomorrow" })).toEqual(base);
    expect(
      cleanSearch({
        ...base,
        type: "ALL",
        pickup: "정문",
        direction: "TO_SCHOOL",
      }),
    ).toEqual(base);
  });

  it("검색 조건이 있으면 필터가 걸린 것으로 본다", () => {
    expect(hasSearch(base)).toBe(false);
    expect(hasSearch({ ...base, q: "  " })).toBe(false);
    expect(hasSearch({ ...base, time: "hour" })).toBe(true);
    expect(isFilteredQuery({ ...base, sort: "RECENT" })).toBe(true);
  });
});

describe("시간대", () => {
  it("1시간 안·오늘 밤·내일 아침을 서울 시각 구간(+09:00)으로 바꾼다", () => {
    expect(timeRange({ ...base, time: "hour" }, NOW)).toEqual({
      from: "2026-11-13T22:47:00+09:00",
      to: "2026-11-13T23:47:00+09:00",
    });
    expect(timeRange({ ...base, time: "tonight" }, NOW)).toEqual({
      from: "2026-11-13T18:00:00+09:00",
      to: "2026-11-14T03:00:00+09:00",
    });
    expect(timeRange({ ...base, time: "morning" }, NOW)).toEqual({
      from: "2026-11-14T06:00:00+09:00",
      to: "2026-11-14T12:00:00+09:00",
    });
    expect(
      timeRange({ ...base, time: "custom", from: "2026-11-30T23:00" }, NOW),
    ).toEqual({ from: "2026-11-30T23:00:00+09:00" });
    expect(timeRange(base, NOW)).toEqual({});
  });

  it("직접 고른 구간의 끝이 시작보다 앞서면 잘못된 구간이다", () => {
    const range = {
      ...base,
      time: "custom" as const,
      from: "2026-11-14T21:00",
      to: "2026-11-14T20:00",
    };
    expect(invalidCustomRange(range)).toBe(true);
    expect(invalidCustomRange({ ...range, to: "2026-11-15T01:00" })).toBe(
      false,
    );
    expect(customRangeLabel("2026-11-14T21:00", "2026-11-14T23:00")).toBe(
      "11/14 21:00 ~ 23:00",
    );
    expect(customRangeLabel("2026-11-14T21:00", "2026-11-15T01:00")).toBe(
      "11/14 21:00 ~ 11/15 01:00",
    );
  });
});

describe("장소 일치 규칙(서버와 같다)", () => {
  const taxi = {
    type: "TAXI" as const,
    referenceTime: "2026-11-13T23:30:00+09:00",
    title: "태릉입구역 가요",
    departure: "삼육대학교 정문",
    destination: "태릉입구역 7번 출구",
  };

  it.each([
    "태릉",
    "태릉입구",
    "태릉 입구역",
    "7번출구",
    "태릉입구역 7번 출구",
  ])("도착지 '%s'는 태릉입구역 7번 출구와 일치한다", (destination) => {
    expect(placeKey("태릉입구역 7번 출구")).toContain(placeKey(destination));
    expect(
      matchesSearch(taxi, { ...base, type: "TAXI", destination }, NOW),
    ).toBe(true);
  });

  it("학교 방향은 장소에 '삼육대'가 있는지로 판단한다", () => {
    const query = { ...base, type: "TAXI" as const };
    expect(
      matchesSearch(taxi, { ...query, direction: "FROM_SCHOOL" }, NOW),
    ).toBe(true);
    expect(matchesSearch(taxi, { ...query, direction: "TO_SCHOOL" }, NOW)).toBe(
      false,
    );
  });

  it("검색어는 장소와 제목 중 하나만 맞아도 되고, 시간 구간은 끝을 포함하지 않는다", () => {
    expect(matchesSearch(taxi, { ...base, q: "정문" }, NOW)).toBe(true);
    expect(matchesSearch(taxi, { ...base, q: "석계" }, NOW)).toBe(false);
    expect(
      matchesSearch(
        taxi,
        { ...base, time: "custom", to: "2026-11-13T23:30" },
        NOW,
      ),
    ).toBe(false);
    expect(
      matchesSearch(
        taxi,
        { ...base, time: "custom", from: "2026-11-13T23:30" },
        NOW,
      ),
    ).toBe(true);
  });
});

describe("적용된 조건 칩과 글쓰기 연결", () => {
  it("조건마다 지울 수 있는 칩을 만든다", () => {
    const chips = searchChips({
      type: "TAXI",
      joinableOnly: false,
      page: 0,
      departure: "석계역",
      direction: "TO_SCHOOL",
      time: "tonight",
      sort: "RECENT",
    });
    expect(chips.map((chip) => chip.label)).toEqual([
      "출발 석계역",
      "학교행",
      "오늘 밤",
      "최근 등록 순",
    ]);
    expect(chips.find((chip) => chip.key === "time")?.clear).toEqual({
      time: undefined,
      from: undefined,
      to: undefined,
    });
  });

  it("시간 칩은 시간 지정이라 부르고, 지금 시각이 있으면 실제 검색 구간을 함께 적는다", () => {
    expect(TIME_LABELS.custom).toBe("시간 지정");
    const late = Date.parse("2026-11-13T23:30:00+09:00");
    const tonight = {
      ...base,
      type: "TAXI" as const,
      time: "tonight" as const,
    };
    expect(presetRangeText(tonight, late)).toBe(
      "오늘 18:00 ~ 내일 03:00 (11/13 금 ~ 11/14 토)",
    );
    expect(presetRangeText(tonight, late, true)).toBe("오늘 18:00~내일 03:00");
    expect(presetRangeText({ ...base, time: "hour" }, late)).toBe(
      "오늘 23:30 ~ 내일 00:30 (11/13 금 ~ 11/14 토)",
    );
    expect(presetRangeText({ ...base, time: "morning" }, NOW)).toBe(
      "내일 06:00 ~ 12:00 (11/14 토)",
    );
    expect(presetRangeText({ ...base, time: "custom" }, NOW)).toBeNull();
    expect(presetRangeText(base, NOW)).toBeNull();
    expect(
      searchChips(tonight, late).find((chip) => chip.key === "time")?.label,
    ).toBe("오늘 밤 · 오늘 18:00~내일 03:00");
  });

  it("검색한 장소로 글쓰기를 채운다", () => {
    expect(
      newPostHref({
        ...base,
        type: "TAXI",
        departure: "석계역",
        destination: "삼육대학교 정문",
      }),
    ).toBe(
      "/posts/new?departure=%EC%84%9D%EA%B3%84%EC%97%AD&destination=%EC%82%BC%EC%9C%A1%EB%8C%80%ED%95%99%EA%B5%90+%EC%A0%95%EB%AC%B8",
    );
    expect(newPostHref({ ...base, type: "DELIVERY", pickup: "후문" })).toBe(
      "/posts/new?type=DELIVERY&pickup=%ED%9B%84%EB%AC%B8",
    );
    expect(newPostHref(base)).toBe("/posts/new");
  });
});
