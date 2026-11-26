// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { envelope, failure, fakeBackend } from "@/test/fakeBackend";
import { toComments } from "./comments";
import { commentApiOperations } from "./commentsApi";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const url = "/api/posts/1/comments";
const comment = {
  commentId: "12",
  authorName: "작성한 학생",
  content: "정문에서 만나요.",
  createdAt: "2026-11-26T12:00:00.123456+09:00",
  isMine: true,
};

describe("모집 상세 댓글 API", () => {
  it("서버 순서와 본인 여부를 유지하고 commentId를 화면 id로 바꾼다", async () => {
    fakeBackend({
      [`GET ${url}`]: () =>
        Response.json(
          envelope({
            content: [
              { ...comment, authorId: "private-id" },
              { ...comment, commentId: "4", isMine: false },
              { ...comment, commentId: "15", isDeleted: true },
            ],
          }),
        ),
    });
    const { commentId, ...fields } = comment;
    expect(toComments(await commentApiOperations.list("1"))).toEqual([
      { ...fields, id: commentId },
      { ...fields, id: "4", isMine: false },
    ]);
  });

  it("등록은 CSRF를 붙여 content만 보내고 올바른 201 응답을 확인한다", async () => {
    const { calls } = fakeBackend({
      [`POST ${url}`]: () => Response.json(envelope(comment), { status: 201 }),
    });
    await expect(
      commentApiOperations.create("1", comment.content),
    ).resolves.toBeUndefined();
    expect(calls.at(-1)).toMatchObject({
      method: "POST",
      path: url,
      body: { content: comment.content },
    });
    expect(calls.at(-1)?.headers.get("X-XSRF-TOKEN")).toBe("csrf-token");
  });

  it("등록 응답이 잘못되면 결과 미확인으로 처리하고 재전송하지 않는다", async () => {
    const { calls } = fakeBackend({
      [`POST ${url}`]: () => Response.json(envelope({}), { status: 201 }),
    });
    await expect(
      commentApiOperations.create("1", comment.content),
    ).rejects.toMatchObject({ kind: "unknownOutcome" });
    expect(calls.filter(({ method }) => method === "POST")).toHaveLength(1);
  });

  it("삭제는 본문 없이 CSRF를 붙이고 204로 성공을 확인한다", async () => {
    const { calls } = fakeBackend({
      [`DELETE ${url}/12`]: () => new Response(null, { status: 204 }),
    });
    await expect(
      commentApiOperations.remove("1", "12"),
    ).resolves.toBeUndefined();
    expect(calls.at(-1)).toMatchObject({
      method: "DELETE",
      path: `${url}/12`,
      body: undefined,
    });
    expect(calls.at(-1)?.headers.get("X-XSRF-TOKEN")).toBe("csrf-token");
  });

  it("이미 삭제된 댓글과 삭제된 모집을 구분한다", async () => {
    fakeBackend({
      [`DELETE ${url}/12`]: () => failure(404, "COMMENT_NOT_FOUND"),
      [`DELETE ${url}/13`]: () => failure(404, "POST_NOT_FOUND"),
    });
    await expect(
      commentApiOperations.remove("1", "12"),
    ).resolves.toBeUndefined();
    await expect(commentApiOperations.remove("1", "13")).rejects.toMatchObject({
      kind: "notFound",
    });
  });

  it.each([
    [404, "API_NOT_FOUND", "notConnected"],
    [405, "METHOD_NOT_ALLOWED", "notConnected"],
    [404, "POST_NOT_FOUND", "notFound"],
    [409, "COMMENT_CLOSED", "closed"],
    [403, "COMMENT_FORBIDDEN", "forbidden"],
    [400, "INVALID_COMMENT", "invalid"],
  ])("%i %s를 화면 오류 %s로 바꾼다", async (status, code, kind) => {
    fakeBackend({ [`POST ${url}`]: () => failure(status, code) });
    await expect(
      commentApiOperations.create("1", comment.content),
    ).rejects.toMatchObject({ kind });
  });

  it("이전 백엔드의 댓글 404와 세션 만료의 401을 구분한다", async () => {
    fakeBackend({});
    await expect(commentApiOperations.list("1")).rejects.toMatchObject({
      kind: "notConnected",
    });
    fakeBackend({
      [`GET ${url}`]: () => failure(401, "AUTHENTICATION_REQUIRED"),
    });
    await expect(commentApiOperations.list("1")).rejects.toMatchObject({
      status: 401,
      name: "ApiError",
    });
  });
});
