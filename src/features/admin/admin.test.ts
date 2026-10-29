// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  AdminError,
  adminErrorMessage,
  adminOperations,
  toRemovalResult,
  toReportDetail,
  toReportList,
} from "./admin";

const summary = {
  id: "report-1",
  status: "PENDING",
  reason: "INAPPROPRIATE",
  createdAt: "2026-10-30T17:00:00+09:00",
  postId: "post-1",
  postTitle: "함께 이동해요",
  postStatus: "OPEN",
};
const detail = {
  ...summary,
  detail: "부적절한 내용이 있어요.",
  reporterId: "reporter-1",
  processedAt: null,
  processedBy: null,
  postContent: "정문에서 만나요.",
  referenceTime: "2026-10-30T18:00:00+09:00",
};
const removal = {
  postId: "post-1",
  status: "REMOVED",
  participationEffect: "CANCELLED_ACTIVE",
  removedAt: "2026-10-30T17:10:00+09:00",
  removedBy: "admin-1",
};

describe("관리자 신고 목록", () => {
  it("AC-ADMIN-001-01/03: PENDING을 우선하며 같은 그룹의 서버 순서를 유지한다", () => {
    const rejected = { ...summary, id: "rejected", status: "REJECTED" };
    const second = { ...summary, id: "second" };
    const resolved = { ...summary, id: "resolved", status: "RESOLVED" };
    expect(
      toReportList({ content: [rejected, summary, resolved, second] }),
    ).toEqual([summary, second, rejected, resolved]);
    expect(toReportList({ content: [] })).toEqual([]);
  });

  it("AC-ADMIN-002-01의 FE: 목록에는 대상과 신고 검토에 필요한 필드만 남긴다", () => {
    expect(
      toReportList({
        content: [
          {
            ...summary,
            email: "private@example.com",
            phone: "secret",
            participantNames: ["private"],
          },
        ],
      }),
    ).toEqual([summary]);
  });

  it.each([
    null,
    [],
    {},
    { content: null },
    { content: [summary, summary] },
    { content: [{ ...summary, reason: "UNKNOWN" }] },
    { content: [{ ...summary, status: "UNKNOWN" }] },
    { content: [{ ...summary, postStatus: "UNKNOWN" }] },
    { content: [{ ...summary, createdAt: "2026-10-30T17:00:00" }] },
    { content: [{ ...summary, postId: "" }] },
    { content: [{ ...summary, postTitle: null }] },
  ])("잘못된 목록 %j를 정상 정보로 보정하지 않는다", (value) => {
    expect(() => toReportList(value)).toThrow(AdminError);
  });
});

describe("관리자 신고 상세", () => {
  it("AC-ADMIN-002-01: 최소 신고자 ID를 유지하고 개인정보·참가자·외부링크를 제외한다", () => {
    expect(
      toReportDetail({
        ...detail,
        email: "private@example.com",
        studentNo: "private-student",
        phone: "private-phone",
        participantNames: ["private-participant"],
        communicationUrl: "https://example.com/private",
      }),
    ).toEqual(detail);
  });

  it.each(["RESOLVED", "REJECTED"])(
    "AC-ADMIN-004-01: %s는 서버 처리자와 시각을 사용한다",
    (status) => {
      const processed = {
        ...detail,
        status,
        processedAt: "2026-10-30T17:20:00+09:00",
        processedBy: "server-admin",
      };
      expect(toReportDetail(processed)).toEqual(processed);
    },
  );

  it("AC-ADMIN-003-05/06의 FE: REMOVED의 원래 제목·본문·시각을 읽거나 전달하지 않는다", () => {
    const removed = {
      ...detail,
      postStatus: "REMOVED",
      get postTitle() {
        throw new Error("removed title");
      },
      get postContent() {
        throw new Error("removed content");
      },
      get referenceTime() {
        throw new Error("removed time");
      },
    };
    expect(toReportDetail(removed)).toEqual({
      ...detail,
      postStatus: "REMOVED",
      postTitle: null,
      postContent: null,
      referenceTime: null,
    });
    expect(toReportList({ content: [removed] })[0].postTitle).toBeNull();
  });

  it("기타 사유와 선택 상세 미입력·500 코드포인트를 허용한다", () => {
    expect(
      toReportDetail({ ...detail, reason: "OTHER", detail: null }).detail,
    ).toBeNull();
    expect(
      toReportDetail({ ...detail, detail: "😀".repeat(500) }).detail,
    ).toHaveLength(1000);
  });

  it.each([
    { reporterId: null },
    { detail: undefined },
    { detail: "😀".repeat(501) },
    { processedAt: "2026-10-30T17:20:00+09:00" },
    { processedBy: "admin" },
    { status: "RESOLVED" },
    { status: "REJECTED", processedAt: "invalid", processedBy: "admin" },
    {
      status: "RESOLVED",
      processedAt: "2026-10-30T17:20:00Z",
      processedBy: " ",
    },
    { postContent: null },
    { referenceTime: "2026-10-30T18:00:00" },
  ])("불완전한 처리·대상 정보 %j를 거절한다", (patch) => {
    expect(() => toReportDetail({ ...detail, ...patch })).toThrow(AdminError);
  });
});

describe("확인된 모집 숨김 결과", () => {
  it.each(["CANCELLED_ACTIVE", "PRESERVED_HISTORY"])(
    "AC-ADMIN-003-01/02/09의 FE: %s 결과와 서버 조치 정보를 사용한다",
    (participationEffect) => {
      const result = { ...removal, participationEffect };
      expect(
        toRemovalResult({
          ...result,
          postTitle: "private",
          participantNames: ["private"],
        }),
      ).toEqual(result);
    },
  );

  it.each([
    { status: "CANCELLED" },
    { postId: " " },
    { participationEffect: "UNKNOWN" },
    { removedAt: "2026-10-30T17:10:00" },
    { removedBy: null },
  ])("확인되지 않은 결과 %j를 완료로 반환하지 않는다", (patch) => {
    expect(() => toRemovalResult({ ...removal, ...patch })).toThrow(AdminError);
  });
});

describe("관리자 미연동과 오류 안내", () => {
  it("기본 operation은 실제 요청이나 성공 결과를 만들지 않는다", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    for (const operation of [
      () => adminOperations.list(),
      () => adminOperations.load("r1"),
      () => adminOperations.process("r1", "RESOLVED"),
      () => adminOperations.removePost("p1"),
    ]) {
      await expect(operation()).rejects.toMatchObject({ kind: "notConnected" });
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("서버 오류 본문·개인정보를 안내에 노출하지 않는다", () => {
    expect(
      adminErrorMessage(new Error("secret@example.com SQL stack")),
    ).not.toMatch(/secret|SQL|stack/);
    expect(adminErrorMessage(new AdminError("notConnected"))).toContain("연동");
    expect(adminErrorMessage(new AdminError("conflict"))).toContain("최신");
  });
});
