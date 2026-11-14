import { describe, expect, it } from "vitest";
import { dayLabel, formatDate } from "./dateFormat";

// 2026-11-11 15:40 in Seoul (06:40 UTC), a Wednesday.
const at = Date.parse("2026-11-11T15:40:00+09:00");

describe("formatDate", () => {
  it("월/일과 요일을 보여 준다", () => {
    expect(formatDate(at)).toBe("11/11 (수)");
  });

  it("연도와 시각을 붙일 수 있다", () => {
    expect(formatDate(at, { year: true, time: true })).toBe(
      "2026/11/11 (수) 15:40",
    );
    expect(formatDate(at, { time: true })).toBe("11/11 (수) 15:40");
    expect(formatDate(at, { year: true, weekday: false, time: true })).toBe(
      "2026/11/11 15:40",
    );
  });

  it("서울 기준 날짜를 쓴다 (UTC로는 전날 밤)", () => {
    const earlyMorning = Date.parse("2026-11-11T00:30:00+09:00");
    expect(formatDate(earlyMorning)).toBe("11/11 (수)");
    expect(formatDate(earlyMorning, { timeZone: "UTC" })).toBe("11/10 (화)");
  });

  it("한 자리 월·일은 0을 붙이지 않는다", () => {
    expect(formatDate(Date.parse("2026-03-05T12:00:00+09:00"))).toBe(
      "3/5 (목)",
    );
  });
});

describe("dayLabel", () => {
  // 2026-11-13 (금) 23:30 KST
  const now = Date.parse("2026-11-13T14:30:00Z");

  it("names today, tomorrow and the day after by Seoul date", () => {
    expect(dayLabel(Date.parse("2026-11-13T14:52:00Z"), now)).toBe("오늘");
    // 00:04 KST next day crosses midnight
    expect(dayLabel(Date.parse("2026-11-13T15:04:00Z"), now)).toBe("내일");
    expect(dayLabel(Date.parse("2026-11-15T03:00:00Z"), now)).toBe("모레");
  });

  it("falls back to the slash date further out or in the past", () => {
    expect(dayLabel(Date.parse("2026-11-16T03:00:00Z"), now)).toBe(
      "11/16 (월)",
    );
    expect(dayLabel(Date.parse("2026-11-12T03:00:00Z"), now)).toBe(
      "11/12 (목)",
    );
  });
});
