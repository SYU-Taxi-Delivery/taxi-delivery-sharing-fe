// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  parsePostQuery,
  postQueryHref,
  postStatusLabel,
  toPostPage,
  type PostSummary,
} from "./posts";

const taxi = {
  id: 1,
  type: "TAXI",
  status: "OPEN",
  referenceTime: "2026-10-05T18:00:00+09:00",
  capacity: 4,
  currentMemberCount: 3,
  joinable: true,
  departure: "석계역",
  destination: "삼육대학교",
  authorName: "박지민",
};
const delivery = {
  id: "d1",
  type: "DELIVERY",
  status: "OPEN",
  referenceTime: "2026-10-05T09:00:00Z",
  capacity: 4,
  currentMemberCount: 3,
  joinable: true,
  restaurantName: "테스트음식점",
  pickupLocation: "정문",
};
const page = (content: unknown[]) => ({
  content,
  totalElements: content.length,
  totalPages: content.length ? 1 : 0,
  number: 0,
  size: 20,
});

describe("toPostPage", () => {
  it("AC-TAXI-003-01, AC-DELIVERY-003-01: 유형별 필수값을 화면 모델로 바꾼다", () => {
    const result = toPostPage(page([taxi, delivery]));
    expect(result.content[0]).toEqual({ ...taxi, id: "1" });
    expect(result.content[1]).toEqual(delivery);
    expect(result).toMatchObject({
      totalElements: 2,
      totalPages: 1,
      number: 0,
    });
  });

  it("작성자 이름은 선택 값이다", () => {
    expect(toPostPage(page([delivery])).content[0]).not.toHaveProperty(
      "authorName",
    );
  });

  it.each([
    ["departure", undefined],
    ["destination", " "],
    ["referenceTime", "2026-10-05T18:00:00"],
    ["referenceTime", "invalid"],
    ["capacity", 5],
    ["capacity", 1],
    ["currentMemberCount", 0],
    ["currentMemberCount", 5],
    ["joinable", "true"],
    ["status", "OPENED"],
    ["type", "BIKE"],
    ["id", ""],
  ])("AC-TAXI-003-02: 택시 %s=%j 응답은 카드로 쓰지 않는다", (field, value) => {
    expect(() => toPostPage(page([{ ...taxi, [field]: value }]))).toThrow(
      "모집 목록",
    );
  });

  it.each(["restaurantName", "pickupLocation"])(
    "AC-DELIVERY-003-02: 배달 %s 누락을 거절한다",
    (field) => {
      expect(() =>
        toPostPage(page([{ ...delivery, [field]: undefined }])),
      ).toThrow();
    },
  );

  it("배달 정원은 10명까지 허용한다", () => {
    expect(() =>
      toPostPage(page([{ ...delivery, capacity: 10 }])),
    ).not.toThrow();
    expect(() => toPostPage(page([{ ...delivery, capacity: 11 }]))).toThrow();
  });

  it("중복 id와 잘못된 페이지 정보를 거절한다", () => {
    expect(() => toPostPage(page([taxi, { ...taxi }]))).toThrow();
    expect(() => toPostPage({ ...page([taxi]), totalPages: -1 })).toThrow();
    expect(() => toPostPage({ ...page([taxi]), content: null })).toThrow();
    expect(() => toPostPage({ ...page([taxi, delivery]), size: 1 })).toThrow();
    expect(() => toPostPage(null)).toThrow();
  });

  it("AC-DISC-001-09: 마지막 이후 페이지의 빈 content를 허용한다", () => {
    expect(
      toPostPage({
        content: [],
        totalElements: 41,
        totalPages: 3,
        number: 3,
        size: 20,
      }).content,
    ).toEqual([]);
  });
});

describe("parsePostQuery / postQueryHref", () => {
  it("URL의 1부터 시작하는 페이지를 API의 0부터 시작하는 page로 바꾼다", () => {
    expect(
      parsePostQuery({ type: "TAXI", joinable: "true", page: "2" }),
    ).toEqual({ type: "TAXI", joinableOnly: true, page: 1 });
  });

  it.each([
    [{}, { type: "ALL", joinableOnly: false, page: 0 }],
    [
      { type: "taxi", joinable: "1", page: "0" },
      { type: "ALL", joinableOnly: false, page: 0 },
    ],
    [
      { type: ["DELIVERY", "TAXI"], page: "-1" },
      { type: "DELIVERY", joinableOnly: false, page: 0 },
    ],
    [{ page: "1.5" }, { type: "ALL", joinableOnly: false, page: 0 }],
    [{ page: "abc" }, { type: "ALL", joinableOnly: false, page: 0 }],
  ])("AC-DISC-002-05: 잘못된 값 %j는 기본값으로 읽는다", (params, expected) => {
    expect(parsePostQuery(params)).toEqual(expected);
  });

  it("기본값은 주소에 쓰지 않는다", () => {
    expect(
      postQueryHref("/posts", { type: "ALL", joinableOnly: false, page: 0 }),
    ).toBe("/posts");
    expect(
      postQueryHref("/posts", {
        type: "DELIVERY",
        joinableOnly: true,
        page: 2,
      }),
    ).toBe("/posts?type=DELIVERY&joinable=true&page=3");
  });
});

describe("postStatusLabel", () => {
  const card = (patch: Partial<PostSummary>) =>
    ({ ...taxi, id: "1", ...patch }) as PostSummary;

  it("AC-DISC-003-03: OPEN·joinable이면 모집 중이다", () => {
    expect(postStatusLabel(card({}))).toEqual({
      label: "모집 중",
      reason: null,
      available: true,
    });
  });

  it("AC-DISC-003-04, AC-DISC-001-07: OPEN이어도 joinable=false면 참여 마감으로 표시한다", () => {
    expect(postStatusLabel(card({ joinable: false }))).toEqual({
      label: "참여 마감",
      reason: "출발 10분 전 마감",
      available: false,
    });
    expect(
      postStatusLabel({ ...(delivery as PostSummary), joinable: false }).reason,
    ).toBe("주문 마감 10분 전 마감");
  });

  it.each([
    ["FULL", "정원 마감", "정원 마감"],
    ["CLOSED", "모집 마감", "작성자 모집 마감"],
    ["CANCELLED", "모집 취소", "작성자 모집 취소"],
    ["FINISHED", "모집 완료", "출발 시간 경과"],
  ] as const)(
    "AC-DISC-003-02: %s를 텍스트로 구분한다",
    (status, label, reason) => {
      expect(postStatusLabel(card({ status, joinable: false }))).toEqual({
        label,
        reason,
        available: false,
      });
    },
  );
});
