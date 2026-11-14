// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  authorActions,
  canReport,
  detailStatus,
  effectiveStatus,
  normalizeReportDetail,
  remainingLabel,
  reportDetailError,
  toPostDetail,
  visibleDetails,
  type PostDetail,
} from "./postDetail";
import { postFixture } from "@/test/fixtures";

const T = Date.parse("2026-10-05T18:00:00+09:00");
const at = (time: string) => Date.parse(`2026-10-05T${time}+09:00`);

const raw = {
  id: 7,
  type: "TAXI",
  title: "정문에서 석계역까지",
  description: "정문 앞에서 만나요",
  status: "OPEN",
  referenceTime: "2026-10-05T18:00:00+09:00",
  serverTime: "2026-10-05T17:30:00+09:00",
  createdAt: "2026-10-05T15:48:00+09:00",
  capacity: 4,
  currentMemberCount: 3,
  joinable: true,
  relation: "JOINED",
  authorName: "박지민",
  participantNames: ["박지민", "이서연", "김하늘"],
  communicationUrl: "https://open.kakao.com/o/abc",
  reported: false,
  departure: "삼육대학교 정문",
  destination: "석계역",
};

const detail = (patch: Record<string, unknown> = {}) =>
  toPostDetail({ ...raw, ...patch });

describe("toPostDetail", () => {
  it("AC-NFR-PRV-01-02: 알려진 필드만 남기고 이메일·학번·전화번호는 버린다", () => {
    const result = toPostDetail({
      ...raw,
      email: "a@syuin.ac.kr",
      studentNumber: "2024101234",
      phone: "010-0000-0000",
    });
    const text = JSON.stringify(result);
    expect(text).not.toContain("syuin.ac.kr");
    expect(text).not.toContain("2024101234");
    expect(text).not.toContain("010-");
    expect(result).toMatchObject({ id: "7", type: "TAXI", relation: "JOINED" });
  });

  it("배달 필드와 선택 주문 안내를 읽는다", () => {
    const result = toPostDetail({
      ...raw,
      type: "DELIVERY",
      departure: undefined,
      destination: undefined,
      restaurantName: "정문 김밥",
      pickupLocation: "학생회관 앞",
      orderGuide: "메뉴는 각자",
    });
    expect(result).toMatchObject({
      type: "DELIVERY",
      restaurantName: "정문 김밥",
      pickupLocation: "학생회관 앞",
      orderGuide: "메뉴는 각자",
    });
  });

  it("https가 아닌 링크는 버린다", () => {
    expect(detail({ communicationUrl: "http://a.example" })).not.toHaveProperty(
      "communicationUrl",
    );
    expect(
      detail({ communicationUrl: "javascript:alert(1)" }),
    ).not.toHaveProperty("communicationUrl");
  });

  it.each([
    ["status", "OPENED"],
    ["relation", "OWNER"],
    ["referenceTime", "2026-10-05T18:00:00"],
    ["serverTime", undefined],
    ["capacity", 5],
    ["currentMemberCount", 0],
    ["joinable", "yes"],
    ["title", " "],
    ["authorName", undefined],
    ["departure", ""],
    ["participantNames", ["a", ""]],
  ])("%s=%j 응답은 상세로 쓰지 않는다", (field, value) => {
    expect(() => detail({ [field]: value })).toThrow("모집 상세");
  });
});

describe("visibleDetails", () => {
  const now = at("17:30:00");

  it.each([
    ["AUTHOR", "OPEN", true, true],
    ["JOINED", "FULL", true, true],
    ["JOINED", "CLOSED", true, true],
    ["NONE", "OPEN", false, false],
    ["CANCELLED", "OPEN", false, false],
    ["JOINED", "FINISHED", true, false],
    ["AUTHOR", "FINISHED", true, false],
    ["JOINED", "CANCELLED", false, false],
  ] as const)(
    "AC-DISC-004-01~04, AC-COORD-004-01~02: %s·%s에서 명단 %s·링크 %s",
    (relation, status, names, link) => {
      const visible = visibleDetails(detail({ relation, status }), now);
      expect(!!visible.participantNames).toBe(names);
      expect(!!visible.communicationUrl).toBe(link);
    },
  );

  it("기준시각이 지나면 진행 상태여도 링크를 숨긴다", () => {
    expect(
      visibleDetails(detail({ relation: "AUTHOR" }), T).communicationUrl,
    ).toBeUndefined();
  });
});

describe("상태와 작성자 관리", () => {
  const author = (status: string) =>
    detail({ relation: "AUTHOR", status }) as PostDetail;

  it("AC-POST-008-01: 기준시각이 지난 진행 모집은 완료로 본다", () => {
    expect(effectiveStatus(author("OPEN"), T - 1)).toBe("OPEN");
    expect(effectiveStatus(author("CLOSED"), T)).toBe("FINISHED");
    expect(effectiveStatus(author("CANCELLED"), T + 1)).toBe("CANCELLED");
  });

  it.each([
    ["OPEN", { edit: true, close: true, cancel: true }],
    ["FULL", { edit: true, close: true, cancel: true }],
    ["CLOSED", { edit: true, close: false, cancel: true }],
    ["CANCELLED", { edit: false, close: false, cancel: false }],
    ["FINISHED", { edit: false, close: false, cancel: false }],
  ])(
    "AC-POST-005-01~02, AC-POST-006-01: %s 작성자 행동",
    (status, expected) => {
      expect(authorActions(author(status), at("17:30:00"))).toEqual(expected);
    },
  );

  it("AC-POST-005-03, AC-POST-006-02: T-10 이후에도 T 전에는 마감·취소한다", () => {
    expect(authorActions(author("OPEN"), at("17:59:59"))).toMatchObject({
      close: true,
      cancel: true,
    });
  });

  it("AC-POST-005-06, AC-POST-006-04: T부터는 마감·취소하지 않는다", () => {
    expect(authorActions(author("OPEN"), T)).toEqual({
      edit: false,
      close: false,
      cancel: false,
    });
  });

  it("작성자가 아니면 관리 행동이 없다", () => {
    expect(
      authorActions(detail({ relation: "JOINED" }), at("17:30:00")),
    ).toEqual({
      edit: false,
      close: false,
      cancel: false,
    });
  });
});

describe("상세 상태 표시", () => {
  it.each([
    ["모집 중", { relation: "NONE" }, at("17:30:00")],
    ["신청 마감", { relation: "NONE" }, at("17:50:00")],
    ["신청 마감", { relation: "NONE", joinable: false }, at("17:30:00")],
    ["정원 마감", { status: "FULL", currentMemberCount: 4 }, at("17:30:00")],
    ["정원 마감", { currentMemberCount: 4, joinable: false }, at("17:30:00")],
    ["작성자 마감", { status: "CLOSED" }, at("17:30:00")],
    ["모집 취소", { status: "CANCELLED" }, at("17:30:00")],
    ["일정 종료", { status: "FINISHED" }, at("17:30:00")],
    ["일정 종료", { status: "CLOSED" }, T],
  ] as const)("%s", (label, patch, now) => {
    expect(detailStatus(detail(patch), now).label).toBe(label);
  });

  it("서버 마감 시각이 있으면 그 시각을 신청 마감 기준으로 쓴다", () => {
    const post = detail({
      relation: "NONE",
      participationDeadline: "2026-10-05T17:30:00+09:00",
    });
    expect(detailStatus(post, at("17:29:59")).label).toBe("모집 중");
    expect(detailStatus(post, at("17:30:00")).label).toBe("신청 마감");
  });

  it("참여 중이면 모집 상태와 함께 참여 완료를 표시하고, 취소된 모집에서는 표시하지 않는다", () => {
    expect(detailStatus(detail({ status: "FULL" }), at("17:30:00"))).toEqual({
      label: "정원 마감",
      history: false,
      joined: true,
    });
    expect(
      detailStatus(detail({ status: "CANCELLED" }), at("17:30:00")).joined,
    ).toBe(false);
    expect(
      detailStatus(detail({ relation: "NONE" }), at("17:30:00")).joined,
    ).toBe(false);
  });

  it.each([
    ["16:11:30", at("16:11:30"), "1시간 39분 남음"],
    ["16:12:00", at("16:12:00"), "1시간 38분 남음"],
    ["16:50:00", at("16:50:00"), "1시간 남음"],
    ["17:49:30", at("17:49:30"), "1분 남음"],
    ["17:50:00", at("17:50:00"), null],
    ["사흘 전", at("17:50:00") - 3 * 86_400_000, "3일 남음"],
  ])("남은 시간 %s → %s", (_, now, text) => {
    expect(remainingLabel(at("17:50:00"), now)).toBe(text);
  });
});

describe("신고", () => {
  it.each(["OPEN", "FULL", "CLOSED", "CANCELLED", "FINISHED"])(
    "AC-REPORT-001-01: 타인의 %s 모집은 신고할 수 있다",
    (status) => {
      expect(canReport(detail({ relation: "NONE", status }))).toBe(true);
    },
  );

  it("AC-REPORT-001-03, AC-REPORT-002-01: 본인 글·삭제 글·이미 신고한 글은 신고하지 않는다", () => {
    expect(canReport(detail({ relation: "AUTHOR" }))).toBe(false);
    expect(canReport(detail({ status: "REMOVED" }))).toBe(false);
    expect(canReport(detail({ reported: true }))).toBe(false);
  });

  it("AC-REPORT-001-10: NFC·양끝 공백 제거 후 500 코드포인트까지 허용한다", () => {
    expect(normalizeReportDetail("   ")).toBe("");
    expect(normalizeReportDetail(" é 가 ")).toBe("é 가");
    expect(reportDetailError("😀".repeat(500))).toBeUndefined();
    expect(reportDetailError("😀".repeat(501))).toContain("500자 이하");
    expect(reportDetailError(`  ${"a".repeat(500)}  `)).toBeUndefined();
  });
});

describe("recruitmentStatus", () => {
  const base = postFixture({
    referenceTime: "2026-10-05T18:00:00+09:00",
    participationDeadline: "2026-10-05T17:50:00+09:00",
  });
  const at = (time: string) => Date.parse(`2026-10-05T${time}:00+09:00`);

  it.each([
    ["RECRUITING", "모집 중"],
    ["FULL", "정원 마감"],
    ["CLOSED", "작성자 마감"],
    ["APPLICATION_CLOSED", "신청 마감"],
    ["CANCELLED", "모집 취소"],
    ["FINISHED", "일정 종료"],
  ] as const)("서버 값 %s를 '%s'로 보여 준다", (value, label) => {
    expect(
      detailStatus({ ...base, recruitmentStatus: value }, at("17:30")).label,
    ).toBe(label);
  });

  it("서버 값이 상태 필드와 달라도 서버 값이 이긴다", () => {
    // OPEN + seats left would locally read 모집 중.
    expect(
      detailStatus({ ...base, recruitmentStatus: "CLOSED" }, at("17:30")).label,
    ).toBe("작성자 마감");
  });

  it("받은 뒤 시간이 지나면 신청 마감, 일정 종료로 넘어간다", () => {
    const post = { ...base, recruitmentStatus: "RECRUITING" as const };
    expect(detailStatus(post, at("17:50")).label).toBe("신청 마감");
    expect(detailStatus(post, at("18:00")).label).toBe("일정 종료");
    expect(
      detailStatus({ ...base, recruitmentStatus: "CANCELLED" }, at("18:30"))
        .label,
    ).toBe("모집 취소");
  });

  it("toPostDetail은 알려진 값만 읽고, 없으면 기존 계산을 쓴다", () => {
    expect(
      toPostDetail({ ...base, recruitmentStatus: "FULL" }).recruitmentStatus,
    ).toBe("FULL");
    expect(
      toPostDetail({ ...base, recruitmentStatus: "SOMETHING" }),
    ).not.toHaveProperty("recruitmentStatus");
    expect(detailStatus(base, at("17:30")).label).toBe("모집 중");
  });
});
