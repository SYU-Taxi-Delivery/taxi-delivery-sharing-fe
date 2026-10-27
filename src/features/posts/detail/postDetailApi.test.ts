// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EVALUATED_AT,
  envelope,
  failure,
  fakeBackend,
  taxiDetail,
} from "@/test/fakeBackend";
import { PostDetailError, toPostDetail, toSnapshot } from "./postDetail";
import {
  PostDetailNotConnectedError,
  postDetailOperations,
} from "./postDetailApi";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const detail = (viewer: Partial<typeof taxiDetail.viewer>, extra = {}) =>
  Response.json(
    envelope({
      ...taxiDetail,
      ...extra,
      viewer: { ...taxiDetail.viewer, ...viewer },
    }),
  );

const members = () =>
  Response.json(
    envelope({
      postId: "1",
      postStatus: "OPEN",
      capacity: 4,
      currentMemberCount: 3,
      author: { displayName: "author" },
      participants: [
        { participationId: "1", displayName: "student1" },
        { participationId: "2", displayName: "student2" },
      ],
    }),
  );

describe("GET /api/posts/{id} 연동", () => {
  it("AC-DISC-004-01: 비참여자는 명단을 요청하지 않고 서버 시각·참여 마감을 쓴다", async () => {
    const { calls } = fakeBackend({ "GET /api/posts/1": () => detail({}) });
    const result = toPostDetail(await postDetailOperations.load("1"));
    expect(result).toMatchObject({
      id: "1",
      status: "OPEN",
      relation: "NONE",
      description: "모집 안내",
      authorName: "author",
      serverTime: EVALUATED_AT,
      participationDeadline: "2026-10-27T11:15:00+09:00",
      reported: false,
    });
    expect(result).not.toHaveProperty("participantNames");
    expect(calls.some((call) => call.path.endsWith("/participants"))).toBe(
      false,
    );
    expect(toSnapshot(result).participationDeadline).toBe(
      "2026-10-27T11:15:00+09:00",
    );
  });

  it("AC-DISC-004-02: 참여 중이면 /participants에서 작성자부터 명단을 받는다", async () => {
    fakeBackend({
      "GET /api/posts/1": () =>
        detail(
          { myParticipationStatus: "JOINED", canCancel: true },
          {
            currentMemberCount: 3,
            communicationUrl: "https://open.kakao.com/o/abc",
          },
        ),
      "GET /api/posts/1/participants": members,
    });
    const result = toPostDetail(await postDetailOperations.load("1"));
    expect(result.relation).toBe("JOINED");
    expect(result.participantNames).toEqual(["author", "student1", "student2"]);
    expect(result.communicationUrl).toBe("https://open.kakao.com/o/abc");
  });

  it("작성자는 AUTHOR 관계로 읽고, 명단 조회 실패는 화면을 막지 않는다", async () => {
    fakeBackend({
      "GET /api/posts/1": () => detail({ isAuthor: true, canEdit: true }),
      "GET /api/posts/1/participants": () =>
        failure(403, "PARTICIPANT_LIST_FORBIDDEN"),
    });
    const result = toPostDetail(await postDetailOperations.load("1"));
    expect(result.relation).toBe("AUTHOR");
    expect(result).not.toHaveProperty("participantNames");
  });

  it.each([
    [404, "POST_NOT_FOUND", "notFound"],
    [400, "INVALID_POST_ID", "notFound"],
    [403, "FORBIDDEN_OPERATION", "forbidden"],
  ])("HTTP %i %s는 %s로 바꾼다", async (status, code, kind) => {
    fakeBackend({ "GET /api/posts/1": () => failure(status, code) });
    const error = await postDetailOperations
      .load("1")
      .catch((e: PostDetailError) => e);
    expect(error).toBeInstanceOf(PostDetailError);
    expect((error as PostDetailError).kind).toBe(kind);
  });

  it("401은 ApiError 그대로 전달한다", async () => {
    fakeBackend({
      "GET /api/posts/1": () => failure(401, "AUTHENTICATION_REQUIRED"),
    });
    await expect(postDetailOperations.load("1")).rejects.toMatchObject({
      name: "ApiError",
      status: 401,
    });
  });
});

describe("참여 신청·취소 연동", () => {
  it("AC-JOIN-001-01, AC-JOIN-003-02: 참여·재참여는 본문 없는 POST /participants다", async () => {
    const { calls } = fakeBackend({
      "POST /api/posts/1/participants": () =>
        Response.json(envelope({ action: "INITIAL_JOIN" }), { status: 201 }),
    });
    await postDetailOperations.join("1");
    const call = calls.at(-1)!;
    expect(call).toMatchObject({
      method: "POST",
      path: "/api/posts/1/participants",
      body: undefined,
    });
    expect(call.headers.get("X-XSRF-TOKEN")).toBe("csrf-token");
  });

  it("AC-JOIN-006-01: 취소는 DELETE /participants다", async () => {
    const { calls } = fakeBackend({
      "DELETE /api/posts/1/participants": () =>
        Response.json(envelope({ action: "CANCEL" })),
    });
    await postDetailOperations.leave("1");
    expect(calls.at(-1)).toMatchObject({ method: "DELETE" });
  });

  it.each(["POST_FULL", "JOIN_TIME_CLOSED", "ALREADY_JOINED"])(
    "AC-JOIN-002-02: 409 %s는 conflict로 알리고 화면이 최신 상태를 다시 읽는다",
    async (code) => {
      fakeBackend({
        "POST /api/posts/1/participants": () => failure(409, code),
      });
      await expect(postDetailOperations.join("1")).rejects.toMatchObject({
        kind: "conflict",
      });
    },
  );

  it("작성자 마감·모집 취소·신고는 백엔드 API가 없어 미연결로 알린다", async () => {
    await expect(postDetailOperations.close("1")).rejects.toBeInstanceOf(
      PostDetailNotConnectedError,
    );
    await expect(postDetailOperations.cancel("1")).rejects.toBeInstanceOf(
      PostDetailNotConnectedError,
    );
    await expect(
      postDetailOperations.report("1", { reason: "OTHER", detail: null }),
    ).rejects.toBeInstanceOf(PostDetailNotConnectedError);
  });
});
