import { describe, expect, it } from "vitest";
import { formatDate } from "./dateFormat";

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
