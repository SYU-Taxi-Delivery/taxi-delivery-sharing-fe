// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  editAccess,
  emptyDraft,
  normalizeText,
  toPostRequest,
  toReferenceTime,
  toSeoulParts,
  toUpdateRequest,
  urlError,
  validateDraft,
  type EditablePost,
  type PostDraft,
} from "./postDraft";

// 2026-10-05 17:30 in Asia/Seoul.
const NOW = Date.parse("2026-10-05T17:30:00+09:00");

function taxiDraft(patch: Partial<PostDraft["taxi"]> = {}): PostDraft {
  const draft = emptyDraft(NOW, "TAXI");
  return {
    ...draft,
    common: {
      title: "같이 가요",
      description: "정문에서 만나요",
      communicationUrl: "",
    },
    taxi: {
      departure: "석계역",
      destination: "삼육대학교",
      date: "2026-10-05",
      time: "18:00",
      capacity: 4,
      ...patch,
    },
  };
}

function deliveryDraft(patch: Partial<PostDraft["delivery"]> = {}): PostDraft {
  const draft = taxiDraft();
  return {
    ...draft,
    type: "DELIVERY",
    delivery: {
      restaurantName: "테스트음식점",
      pickupLocation: "정문",
      date: "2026-10-05",
      time: "18:00",
      capacity: 4,
      orderGuide: "",
      ...patch,
    },
  };
}

const at = (time: string) => Date.parse(`2026-10-05T${time}+09:00`);

describe("시각", () => {
  it("UTC 브라우저에서도 Asia/Seoul 날짜와 시각으로 나눈다", () => {
    expect(toSeoulParts(Date.parse("2026-10-05T15:30:00Z"))).toEqual({
      date: "2026-10-06",
      time: "00:30",
    });
  });

  it("AC-UI-FORM-02: 날짜와 시간을 +09:00 분 단위 기준시각으로 만든다", () => {
    expect(toReferenceTime("2026-10-05", "18:00")).toBe(
      "2026-10-05T18:00:00+09:00",
    );
  });

  it.each([
    ["2026-02-30", "18:00"],
    ["2026-10-05", "25:00"],
    ["", "18:00"],
    ["2026-10-05", "18:00:30"],
  ])("AC-INPUT-TIME-01: 해석할 수 없는 %s %s는 거절한다", (date, time) => {
    expect(toReferenceTime(date, time)).toBeNull();
  });
});

describe("validateDraft: 기준시각", () => {
  it.each([
    ["17:49:00", true],
    ["17:49:59", true],
    ["17:50:00", false],
    ["17:51:00", false],
    ["18:00:00", false],
    ["18:01:00", false],
  ])("AC-POST-002-04~08: 현재 %s에 T=18:00 허용 여부는 %s", (now, allowed) => {
    const errors = validateDraft(taxiDraft(), { nowMs: at(now) });
    expect(errors.time === undefined).toBe(allowed);
  });

  it("5분 단위가 아닌 시간을 막고, 수정에서 그대로 둔 기존 시간은 허용한다", () => {
    expect(
      validateDraft(taxiDraft({ time: "18:03" }), { nowMs: NOW }).time,
    ).toBe("출발 시간은 5분 단위로 선택해 주세요.");
    expect(
      validateDraft(taxiDraft({ time: "18:05" }), { nowMs: NOW }).time,
    ).toBeUndefined();
    expect(
      validateDraft(taxiDraft({ time: "18:03" }), {
        nowMs: NOW,
        originalReferenceTime: "2026-10-05T18:03:00+09:00",
      }).time,
    ).toBeUndefined();
  });

  it("날짜·시간 미선택을 각각 안내한다", () => {
    expect(validateDraft(taxiDraft({ date: "" }), { nowMs: NOW }).date).toBe(
      "출발 날짜를 선택해 주세요.",
    );
    expect(
      validateDraft(deliveryDraft({ time: "" }), { nowMs: NOW }).time,
    ).toBe("주문 마감 시간을 선택해 주세요.");
  });

  it("AC-POST-004-07: 수정에서 바꾸지 않은 기준시각은 다시 막지 않는다", () => {
    const draft = taxiDraft();
    expect(
      validateDraft(draft, {
        nowMs: at("17:55:00"),
        originalReferenceTime: "2026-10-05T18:00:00+09:00",
      }).time,
    ).toBeUndefined();
    expect(
      validateDraft(taxiDraft({ time: "18:05" }), {
        nowMs: at("17:55:00"),
        originalReferenceTime: "2026-10-05T18:00:00+09:00",
      }).time,
    ).toContain("10분");
  });

  it("핵심 필드가 잠기면 장소는 검사하고 시각·정원은 검사하지 않는다", () => {
    const errors = validateDraft(taxiDraft({ time: "17:00", capacity: 9 }), {
      nowMs: NOW,
      coreLocked: true,
    });
    expect(errors.time).toBeUndefined();
    expect(errors.capacity).toBeUndefined();
  });
});

describe("validateDraft: 입력 제한", () => {
  it("유효한 택시·배달 입력은 오류가 없다", () => {
    expect(validateDraft(taxiDraft(), { nowMs: NOW })).toEqual({});
    expect(validateDraft(deliveryDraft(), { nowMs: NOW })).toEqual({});
  });

  it.each([
    ["title", 60],
    ["description", 1000],
  ] as const)(
    "AC-INPUT-TITLE/CONTENT: %s는 1자·%i자 허용, 초과·빈 값 거절",
    (field, max) => {
      const withValue = (value: string) => ({
        ...taxiDraft(),
        common: { ...taxiDraft().common, [field]: value },
      });
      expect(
        validateDraft(withValue("가"), { nowMs: NOW })[field],
      ).toBeUndefined();
      expect(
        validateDraft(withValue("가".repeat(max)), { nowMs: NOW })[field],
      ).toBeUndefined();
      expect(
        validateDraft(withValue("가".repeat(max + 1)), { nowMs: NOW })[field],
      ).toContain(`${max}자 이하`);
      expect(validateDraft(withValue("   "), { nowMs: NOW })[field]).toContain(
        "입력해 주세요",
      );
    },
  );

  it.each(["departure", "destination"] as const)(
    "AC-INPUT-PLACE: 택시 %s는 필수·100자",
    (field) => {
      expect(
        validateDraft(taxiDraft({ [field]: "" }), { nowMs: NOW })[field],
      ).toBeTruthy();
      expect(
        validateDraft(taxiDraft({ [field]: "가".repeat(100) }), { nowMs: NOW })[
          field
        ],
      ).toBeUndefined();
      expect(
        validateDraft(taxiDraft({ [field]: "가".repeat(101) }), { nowMs: NOW })[
          field
        ],
      ).toContain("100자 이하");
    },
  );

  it.each(["restaurantName", "pickupLocation"] as const)(
    "AC-INPUT-PLACE: 배달 %s는 필수·100자",
    (field) => {
      expect(
        validateDraft(deliveryDraft({ [field]: " " }), { nowMs: NOW })[field],
      ).toBeTruthy();
      expect(
        validateDraft(deliveryDraft({ [field]: "가".repeat(101) }), {
          nowMs: NOW,
        })[field],
      ).toBeTruthy();
    },
  );

  it("AC-INPUT-GUIDE-01~02: 주문 안내는 선택이며 500자까지", () => {
    expect(
      validateDraft(deliveryDraft({ orderGuide: "" }), { nowMs: NOW })
        .orderGuide,
    ).toBeUndefined();
    expect(
      validateDraft(deliveryDraft({ orderGuide: "가".repeat(500) }), {
        nowMs: NOW,
      }).orderGuide,
    ).toBeUndefined();
    expect(
      validateDraft(deliveryDraft({ orderGuide: "가".repeat(501) }), {
        nowMs: NOW,
      }).orderGuide,
    ).toContain("500자 이하");
  });

  it.each([
    ["TAXI", 1, false],
    ["TAXI", 2, true],
    ["TAXI", 4, true],
    ["TAXI", 5, false],
    ["DELIVERY", 1, false],
    ["DELIVERY", 2, true],
    ["DELIVERY", 10, true],
    ["DELIVERY", 11, false],
    ["TAXI", 2.5, false],
  ] as const)(
    "AC-INPUT-*-CAPACITY: %s 정원 %d 허용 %s",
    (type, capacity, allowed) => {
      const draft =
        type === "TAXI" ? taxiDraft({ capacity }) : deliveryDraft({ capacity });
      expect(validateDraft(draft, { nowMs: NOW }).capacity === undefined).toBe(
        allowed,
      );
    },
  );

  it("AC-INPUT-TRIM-01: NFC 후 양끝 공백을 빼고 코드포인트로 센다", () => {
    expect(normalizeText("  é 가  ")).toBe("é 가");
    const emoji = {
      ...taxiDraft(),
      common: { ...taxiDraft().common, title: "😀".repeat(60) },
    };
    expect(validateDraft(emoji, { nowMs: NOW }).title).toBeUndefined();
    emoji.common.title = "😀".repeat(61);
    expect(validateDraft(emoji, { nowMs: NOW }).title).toBeTruthy();
  });
});

describe("urlError", () => {
  it("AC-COORD-004-04: 미입력과 500자 HTTPS를 허용한다", () => {
    expect(urlError("")).toBeUndefined();
    expect(urlError(`https://example.com/${"a".repeat(480)}`)).toBeUndefined();
  });

  it.each([
    "http://example.com",
    "javascript:alert(1)",
    "example.com",
    "https://",
    `https://example.com/${"a".repeat(481)}`,
  ])("AC-COORD-004-05: %s를 거절한다", (value) => {
    expect(urlError(value)).toBeTruthy();
  });
});

describe("요청", () => {
  it("AC-POST-002-13: 활성 유형의 공통값·전용값만 보낸다", () => {
    const draft = deliveryDraft({ orderGuide: "  메뉴는 각자  " });
    draft.taxi.departure = "남은 택시 초안";
    const request = toPostRequest(draft);
    expect(request).toEqual({
      type: "DELIVERY",
      title: "같이 가요",
      description: "정문에서 만나요",
      communicationUrl: null,
      restaurantName: "테스트음식점",
      pickupLocation: "정문",
      referenceTime: "2026-10-05T18:00:00+09:00",
      capacity: 4,
      orderGuide: "메뉴는 각자",
    });
    expect(JSON.stringify(request)).not.toContain("남은 택시 초안");
    expect(request).not.toHaveProperty("foodType");
  });

  it("잠긴 수정 요청은 장소·시각·정원을 빼고 보낸다", () => {
    expect(toUpdateRequest(taxiDraft(), true)).toEqual({
      title: "같이 가요",
      description: "정문에서 만나요",
      communicationUrl: null,
    });
    expect(toUpdateRequest(taxiDraft(), false)).toMatchObject({
      departure: "석계역",
      capacity: 4,
    });
  });
});

describe("editAccess", () => {
  const post = (patch: Partial<EditablePost>): EditablePost => ({
    id: "p1",
    status: "OPEN",
    isAuthor: true,
    otherJoinedCount: 0,
    currentMemberCount: 1,
    draft: taxiDraft(),
    ...patch,
  });

  it("AC-POST-004-01, AC-POST-004-04: 다른 JOINED가 없으면 핵심 필드도 수정한다", () => {
    expect(editAccess(post({}))).toEqual({
      editable: true,
      coreLocked: false,
      reason: null,
    });
  });

  it("AC-POST-004-02~03, AC-POST-004-14~15: 다른 참여자가 있으면 핵심 필드를 잠근다", () => {
    expect(editAccess(post({ otherJoinedCount: 1 }))).toMatchObject({
      editable: true,
      coreLocked: true,
    });
    expect(
      editAccess(post({ status: "FULL", otherJoinedCount: 3 })),
    ).toMatchObject({ coreLocked: true });
  });

  it("AC-POST-004-10~11: CLOSED는 참여자가 없어도 비핵심만 수정한다", () => {
    expect(editAccess(post({ status: "CLOSED" }))).toMatchObject({
      editable: true,
      coreLocked: true,
    });
  });

  it.each(["CANCELLED", "FINISHED", "REMOVED"] as const)(
    "AC-POST-004-06: %s는 수정하지 않는다",
    (status) => {
      expect(editAccess(post({ status }))).toMatchObject({ editable: false });
    },
  );

  it("AC-POST-004-05: 작성자가 아니면 수정하지 않는다", () => {
    expect(editAccess(post({ isAuthor: false }))).toMatchObject({
      editable: false,
    });
  });
});
