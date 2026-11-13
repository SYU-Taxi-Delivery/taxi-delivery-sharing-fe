// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EVALUATED_AT,
  envelope,
  failure,
  fakeBackend,
  taxiDetail,
} from "@/test/fakeBackend";
import { ParticipationRejected } from "@/features/participation/participation";
import { PostDetailError, toPostDetail, toSnapshot } from "./postDetail";
import { postDetailOperations } from "./postDetailApi";

beforeEach(() => vi.useFakeTimers());

afterEach(() => {
  vi.useRealTimers();
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
      participationDeadline: "2026-10-27T11:15:00+09:00",
      reported: false,
    });
    expect(Date.parse(result.serverTime)).toBe(Date.parse(EVALUATED_AT));
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

  it("작성자는 AUTHOR 관계로 읽고, 명단의 일시적 실패는 화면을 막지 않는다", async () => {
    fakeBackend({
      "GET /api/posts/1": () => detail({ isAuthor: true, canEdit: true }),
      "GET /api/posts/1/participants": () =>
        failure(503, "PARTICIPATION_TEMPORARILY_UNAVAILABLE"),
    });
    const result = toPostDetail(await postDetailOperations.load("1"));
    expect(result.relation).toBe("AUTHOR");
    expect(result).not.toHaveProperty("participantNames");
  });

  it.each([401, 403])(
    "명단 조회 %i는 오래된 보호 상세 대신 접근 오류를 전달한다",
    async (status) => {
      fakeBackend({
        "GET /api/posts/1": () =>
          detail(
            { myParticipationStatus: "JOINED" },
            {
              currentMemberCount: 2,
              communicationUrl: "https://open.kakao.com/o/abc",
            },
          ),
        "GET /api/posts/1/participants": () =>
          failure(
            status,
            status === 401
              ? "AUTHENTICATION_REQUIRED"
              : "PARTICIPANT_LIST_FORBIDDEN",
          ),
      });
      await expect(postDetailOperations.load("1")).rejects.toMatchObject({
        name: "ApiError",
        status,
      });
    },
  );

  it.each(["2026-10-27T11:24:59+09:00", "2026-10-27T11:25:10+09:00"])(
    "명단 조회 지연과 더 최신 서버 시각 %s를 반영해 T 이후 소통 링크를 숨긴다",
    async (memberTime) => {
      const detailTime = "2026-10-27T11:24:59+09:00";
      fakeBackend({
        "GET /api/posts/1": () =>
          Response.json({
            ...envelope({
              ...taxiDetail,
              currentMemberCount: 2,
              communicationUrl: "https://open.kakao.com/o/abc",
              viewer: { ...taxiDetail.viewer, myParticipationStatus: "JOINED" },
            }),
            meta: { evaluatedAt: detailTime },
          }),
        "GET /api/posts/1/participants": () => {
          vi.advanceTimersByTime(4_000);
          return Response.json({
            ...envelope({
              author: { displayName: "author" },
              participants: [{ displayName: "student1" }],
            }),
            meta: { evaluatedAt: memberTime },
          });
        },
      });
      const result = toPostDetail(await postDetailOperations.load("1"));
      expect(Date.parse(result.serverTime)).toBe(
        Math.max(Date.parse(detailTime) + 4_000, Date.parse(memberTime)),
      );
      const snapshot = toSnapshot(result);
      expect(snapshot).not.toHaveProperty("communicationUrl");
      expect(snapshot.participantNames).toEqual(["author", "student1"]);
    },
  );

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

  it.each([
    ["POST_FULL", "방금 정원이 찼어요."],
    ["JOIN_TIME_CLOSED", "신청 기한이 지났어요."],
    ["POST_CLOSED", "작성자가 모집을 마감했어요."],
    ["POST_CANCELLED", "모집이 취소됐어요."],
    ["POST_FINISHED", "일정이 끝났어요."],
  ])(
    "409 %s는 이유와 error.details.post의 최신 공개 상태를 함께 넘긴다",
    async (code, message) => {
      fakeBackend({
        "POST /api/posts/1/participants": () =>
          Response.json(
            {
              error: {
                code,
                message: "서버 메시지",
                details: {
                  post: {
                    postId: "1",
                    postStatus: "FULL",
                    recruitmentStatus: "FULL",
                    referenceTime: "2026-10-27T11:25:00+09:00",
                    participationDeadline: "2026-10-27T11:15:00+09:00",
                    capacity: 4,
                    currentMemberCount: 4,
                    remainingSeats: 0,
                    joinable: false,
                    communicationUrl: "https://must-not-leak.example",
                  },
                },
              },
              meta: envelope(null).meta,
            },
            { status: 409 },
          ),
      });
      const error = await postDetailOperations.join("1").catch((e) => e);
      expect(error).toBeInstanceOf(ParticipationRejected);
      expect(error.message).toBe(message);
      expect(error.latest).toEqual({
        status: "FULL",
        recruitmentStatus: "FULL",
        referenceTime: "2026-10-27T11:25:00+09:00",
        participationDeadline: "2026-10-27T11:15:00+09:00",
        capacity: 4,
        currentMemberCount: 4,
        joinable: false,
      });
    },
  );

  it("취소 409 CANCEL_TIME_CLOSED도 이유를 넘기고, 이유를 모르는 409는 conflict다", async () => {
    fakeBackend({
      "DELETE /api/posts/1/participants": () =>
        failure(409, "CANCEL_TIME_CLOSED"),
      "POST /api/posts/1/participants": () => failure(409, "ALREADY_JOINED"),
    });
    await expect(postDetailOperations.leave("1")).rejects.toMatchObject({
      name: "ParticipationRejected",
      code: "CANCEL_TIME_CLOSED",
      latest: undefined,
    });
    await expect(postDetailOperations.join("1")).rejects.toMatchObject({
      kind: "conflict",
    });
  });

  it.each(["close", "cancel"] as const)(
    "작성자 %s은 본문 없이 CSRF와 함께 POST /api/posts/{id}/%s로 보낸다",
    async (action) => {
      const { calls } = fakeBackend({
        [`POST /api/posts/1/${action}`]: () =>
          Response.json(envelope({ ...taxiDetail })),
      });
      await postDetailOperations[action]!("1");
      const call = calls.at(-1)!;
      expect(call).toMatchObject({
        method: "POST",
        path: `/api/posts/1/${action}`,
        body: undefined,
      });
      expect(call.headers.get("X-XSRF-TOKEN")).toBe("csrf-token");
    },
  );

  it("마감·취소 경로가 아직 배포되지 않은 404는 준비 중, 409와 POST_NOT_FOUND는 화면 오류로 바꾼다", async () => {
    fakeBackend({
      "POST /api/posts/2/close": () => failure(404, "POST_NOT_FOUND"),
      "POST /api/posts/3/cancel": () => failure(409, "POST_FINISHED"),
    });
    await expect(postDetailOperations.close!("1")).rejects.toMatchObject({
      name: "PostDetailNotConnectedError",
    });
    await expect(postDetailOperations.close!("2")).rejects.toMatchObject({
      kind: "notFound",
    });
    await expect(postDetailOperations.cancel!("3")).rejects.toMatchObject({
      kind: "conflict",
    });
  });

  it("신고는 백엔드 API가 없어 제공하지 않는다", () => {
    expect(postDetailOperations.report).toBeUndefined();
  });
});
