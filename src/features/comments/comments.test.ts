// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  canWriteComment,
  commentContentError,
  commentsErrorMessage,
  commentsOperations,
  CommentsError,
  normalizeComment,
  toComments,
} from "./comments";

const comment = {
  id: "c1",
  authorName: "삼육 학생",
  content: "정문에서 만나요.",
  createdAt: "2026-10-30T17:00:00+09:00",
  isMine: true,
};
const reference = "2026-10-30T18:00:00+09:00";

describe("comment content", () => {
  it("AC-COORD-001-08: NFC·양끝 공백만 정리하고 내부 공백·줄바꿈은 보존한다", () => {
    expect(normalizeComment("  e\u0301  다음\n줄  ")).toBe("é  다음\n줄");
    expect(commentContentError(" \n\t ")).toContain("입력");
    expect(commentContentError("가")).toBeNull();
  });

  it("AC-COORD-001-03/08: 코드포인트 500자를 허용하고 501자는 거절한다", () => {
    expect(commentContentError("😀".repeat(500))).toBeNull();
    expect(commentContentError("😀".repeat(501))).toContain("500");
    expect(commentContentError("e\u0301".repeat(500))).toBeNull();
    expect(commentContentError("a".repeat(501))).toContain("500");
  });
});

describe("toComments", () => {
  it("AC-COORD-002-02/05: 서버 순서를 유지하며 필요한 공개 화면 정보만 남긴다", () => {
    const second = { ...comment, id: "opaque-2", isMine: false };
    const first = {
      ...comment,
      id: "opaque-10",
      content: "  e\u0301  다음\n줄  ",
      authorId: "private-id",
      email: "private@example.com",
      studentNo: "private-student-number",
    };
    expect(toComments({ content: [first, second] })).toEqual([
      { ...comment, id: "opaque-10", content: "é  다음\n줄" },
      second,
    ]);
    expect(toComments({ content: [] })).toEqual([]);
  });

  it("AC-COORD-002-01: 삭제 행은 본문·작성자 정보를 읽거나 노출하지 않는다", () => {
    const deleted = {
      isDeleted: true,
      get content() {
        throw new Error("deleted private content must not be read");
      },
    };
    expect(toComments({ content: [deleted, comment] })).toEqual([comment]);
  });

  it.each([
    null,
    {},
    { content: null },
    { content: [null] },
    { content: [[]] },
    { content: [{ ...comment, id: " " }] },
    { content: [{ ...comment, id: 1 }] },
    { content: [{ ...comment, authorName: " " }] },
    { content: [{ ...comment, content: " \n " }] },
    { content: [{ ...comment, content: "😀".repeat(501) }] },
    { content: [{ ...comment, createdAt: "2026-10-30T17:00:00" }] },
    { content: [{ ...comment, createdAt: "2026-13-30T17:00:00+09:00" }] },
    { content: [{ ...comment, isMine: "true" }] },
    { content: [{ ...comment, isDeleted: "true" }] },
    { content: [{ ...comment, isDeleted: null }] },
    { content: [comment, { ...comment, id: " c1 " }] },
  ])("잘못된 응답 %j는 정상 댓글 목록으로 표시하지 않는다", (value) => {
    expect(() => toComments(value)).toThrow(CommentsError);
  });
});

describe("canWriteComment", () => {
  it.each(["OPEN", "FULL", "CLOSED"] as const)(
    "AC-COORD-001-01: %s는 T-10 이후에도 허용하고 정확히 T부터 막는다",
    (status) => {
      expect(
        canWriteComment(status, reference, Date.parse(reference) - 5 * 60_000),
      ).toBe(true);
      expect(
        canWriteComment(status, reference, Date.parse(reference) - 1),
      ).toBe(true);
      expect(canWriteComment(status, reference, Date.parse(reference))).toBe(
        false,
      );
    },
  );

  it.each(["CANCELLED", "FINISHED", "REMOVED"] as const)(
    "AC-COORD-001-05: %s에는 기준시각 전이어도 새 댓글을 허용하지 않는다",
    (status) => {
      expect(
        canWriteComment(status, reference, Date.parse(reference) - 60_000),
      ).toBe(false);
    },
  );

  it("유효하지 않은 기준·현재 시각에는 쓰기를 허용하지 않는다", () => {
    expect(canWriteComment("OPEN", "not-a-date", Date.now())).toBe(false);
    expect(canWriteComment("OPEN", "2026-10-30T18:00:00", 0)).toBe(false);
    expect(canWriteComment("OPEN", reference, Number.NaN)).toBe(false);
    expect(canWriteComment("OPEN", reference, Number.POSITIVE_INFINITY)).toBe(
      false,
    );
  });
});

describe("unconnected operations and errors", () => {
  it("운영 기본 동작은 빈 목록·등록·삭제 성공을 가장하거나 API를 요청하지 않는다", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(commentsOperations.list("p1")).rejects.toMatchObject({
      kind: "notConnected",
    });
    await expect(commentsOperations.create("p1", "안내")).rejects.toMatchObject(
      {
        kind: "notConnected",
      },
    );
    await expect(commentsOperations.remove("p1", "c1")).rejects.toMatchObject({
      kind: "notConnected",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ["notConnected", "준비"],
    ["invalid", "확인"],
    ["forbidden", "권한"],
    ["notFound", "찾을 수"],
    ["closed", "종료"],
    ["unknownOutcome", "결과"],
  ] as const)("%s를 안전한 사용자 안내로 바꾼다", (kind, expected) => {
    expect(commentsErrorMessage(new CommentsError(kind))).toContain(expected);
  });

  it("알 수 없는 오류의 계정·본문·서버 정보를 노출하지 않는다", () => {
    const message = commentsErrorMessage(
      new Error("SQL stack userId=private-id content=private-content"),
    );
    expect(message).not.toMatch(/SQL|stack|private-id|private-content/);
    expect(message).toContain("확인");
  });
});
