import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  deadlinePreview,
  quickTime,
  readRecentPlaces,
  rememberPlaces,
  seoulTomorrow,
  suggestTitle,
  withSuggestedTitle,
} from "./formAssist";
import { emptyDraft, type PostDraft } from "./postDraft";

const NOW = Date.parse("2026-10-05T17:30:00+09:00");

function taxi(departure: string, destination: string, title = ""): PostDraft {
  const draft = emptyDraft(NOW, "TAXI");
  return {
    ...draft,
    common: { ...draft.common, title },
    taxi: { ...draft.taxi, departure, destination },
  };
}

describe("suggestTitle / withSuggestedTitle", () => {
  it("택시는 경로, 배달은 음식점으로 제목을 만든다", () => {
    expect(suggestTitle(taxi("정문", "화랑대역 2번 출구"))).toBe(
      "정문 → 화랑대역 2번 출구 택시",
    );
    expect(suggestTitle(taxi("정문", ""))).toBe("");
    const delivery = emptyDraft(NOW, "DELIVERY");
    delivery.delivery.restaurantName = "정문 김밥";
    expect(suggestTitle(delivery)).toBe("정문 김밥 같이 주문해요");
  });

  it("빈 제목이나 이전 제안은 바꾸고, 직접 쓴 제목은 그대로 둔다", () => {
    const filled = withSuggestedTitle(taxi("정문", ""), taxi("정문", "후문"));
    expect(filled.common.title).toBe("정문 → 후문 택시");
    const updated = withSuggestedTitle(
      filled,
      taxi("정문", "기숙사", filled.common.title),
    );
    expect(updated.common.title).toBe("정문 → 기숙사 택시");
    const own = withSuggestedTitle(
      taxi("정문", "후문", "내 제목"),
      taxi("정문", "기숙사", "내 제목"),
    );
    expect(own.common.title).toBe("내 제목");
  });
});

describe("quickTime", () => {
  it("5분 단위로 올림한다", () => {
    expect(quickTime(NOW, 30)).toEqual({ date: "2026-10-05", time: "18:00" });
    expect(quickTime(NOW + 60_000, 30)).toEqual({
      date: "2026-10-05",
      time: "18:05",
    });
    expect(quickTime(NOW, 60)).toEqual({ date: "2026-10-05", time: "18:30" });
  });

  it("자정을 넘기면 날짜도 다음 날로 정한다", () => {
    const late = Date.parse("2026-10-05T23:42:00+09:00");
    expect(quickTime(late, 30)).toEqual({ date: "2026-10-06", time: "00:15" });
    expect(seoulTomorrow(late)).toBe("2026-10-06");
  });
});

describe("deadlinePreview", () => {
  it("택시는 출발 10분 전 신청·취소 마감을 알려 준다", () => {
    expect(deadlinePreview("TAXI", "2026-10-05", "18:00", NOW)).toEqual({
      text: "신청·취소 마감 17:50이 함께 정해져요 (출발 10분 전)",
      past: false,
    });
    expect(deadlinePreview("TAXI", "2026-10-05", "18:15", NOW)?.text).toBe(
      "신청·취소 마감 18:05가 함께 정해져요 (출발 10분 전)",
    );
  });

  it("배달은 주문 마감 기준으로 알려 준다", () => {
    expect(deadlinePreview("DELIVERY", "2026-10-05", "19:00", NOW)?.text).toBe(
      "참여·취소 마감 18:50 (주문 마감 10분 전)",
    );
  });

  it("이미 지난 마감은 지났다고 알려 주고, 시간이 없으면 보여 주지 않는다", () => {
    expect(deadlinePreview("TAXI", "2026-10-05", "17:35", NOW)).toEqual({
      text: "신청·취소 마감 17:25가 이미 지났어요 (출발 10분 전)",
      past: true,
    });
    expect(deadlinePreview("TAXI", "2026-10-05", "", NOW)).toBeNull();
  });
});

describe("recent places", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("최근 장소를 최신순으로 5개까지 기억한다", () => {
    rememberPlaces("TAXI", ["a", "b"]);
    rememberPlaces("TAXI", ["c", "d"]);
    rememberPlaces("TAXI", ["e", " a "]);
    expect(readRecentPlaces("TAXI")).toEqual(["e", "a", "c", "d", "b"]);
    rememberPlaces("TAXI", ["f", ""]);
    expect(readRecentPlaces("TAXI")).toEqual(["f", "e", "a", "c", "d"]);
    expect(readRecentPlaces("DELIVERY")).toEqual([]);
  });

  it("저장소를 쓸 수 없거나 값이 깨져 있어도 오류 없이 빈 목록이다", () => {
    window.localStorage.setItem("doyupot:recent-places:TAXI", "{broken");
    expect(readRecentPlaces("TAXI")).toEqual([]);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readRecentPlaces("TAXI")).toEqual([]);
    expect(() => rememberPlaces("TAXI", ["a"])).not.toThrow();
  });
});
