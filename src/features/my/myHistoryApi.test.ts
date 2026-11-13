// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getParticipationAvailability } from "@/features/participation/participation";
import {
  EVALUATED_AT,
  envelope,
  fakeBackend,
  taxiDetail,
  taxiItem,
} from "@/test/fakeBackend";
import { failure } from "@/test/fakeBackend";
import { toMyHistory, toMySnapshot } from "./myHistory";
import {
  MyHistoryNotConnectedError,
  myHistoryOperations,
} from "./myHistoryApi";

beforeEach(() => vi.useFakeTimers());

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("GET /api/users/me/participations 연동", () => {
  it("모집 정보가 함께 오면 상세를 다시 읽지 않고 공개 상태·작성자·링크를 쓴다", async () => {
    const { calls } = fakeBackend({
      "GET /api/users/me/participations?page=0&size=50": () =>
        Response.json(
          envelope({
            items: [
              {
                participationId: "1",
                participationStatus: "JOINED",
                post: {
                  ...taxiItem,
                  currentMemberCount: 4,
                  remainingSeats: 0,
                  postStatus: "FULL",
                  recruitmentStatus: "FULL",
                  isRemoved: false,
                  author: { displayName: "박지민" },
                  communicationUrl: "https://open.kakao.com/o/room",
                  joinable: undefined,
                },
              },
            ],
            page: 0,
            size: 50,
            totalElements: 1,
            totalPages: 1,
          }),
        ),
    });
    const history = toMyHistory(
      await myHistoryOperations.list("participated"),
      "participated",
    );
    expect(history.content).toEqual([
      expect.objectContaining({
        id: "1",
        status: "FULL",
        recruitmentStatus: "FULL",
        relation: "JOINED",
        authorName: "박지민",
        currentMemberCount: 4,
        joinable: false,
        communicationUrl: "https://open.kakao.com/o/room",
      }),
    ]);
    expect(calls.map((call) => call.path)).toEqual([
      "/api/users/me/participations?page=0&size=50",
    ]);
  });

  it("참여 기록에 상세를 더해 카드로 만들고, 삭제된 모집은 최소 정보만 둔다", async () => {
    fakeBackend({
      "GET /api/users/me/participations?page=0&size=50": () =>
        Response.json(
          envelope({
            items: [
              {
                participationId: "1",
                participationStatus: "JOINED",
                post: { postId: "1", postStatus: "OPEN", isRemoved: false },
              },
              {
                participationId: "2",
                participationStatus: "CANCELLED",
                post: {
                  postId: "7",
                  postStatus: "REMOVED",
                  isRemoved: true,
                  message: "관리자에 의해 삭제된 모집입니다.",
                },
              },
            ],
            page: 0,
            size: 50,
            totalElements: 2,
            totalPages: 1,
          }),
        ),
      "GET /api/posts/1": () =>
        Response.json(
          envelope({
            ...taxiDetail,
            currentMemberCount: 2,
            viewer: { ...taxiDetail.viewer, myParticipationStatus: "JOINED" },
          }),
        ),
    });
    const history = toMyHistory(
      await myHistoryOperations.list("participated"),
      "participated",
    );
    expect(Date.parse(history.serverTime)).toBe(Date.parse(EVALUATED_AT));
    expect(history.content).toEqual([
      expect.objectContaining({
        id: "1",
        relation: "JOINED",
        departure: "석계역",
        currentMemberCount: 2,
        participationDeadline: "2026-10-27T11:15:00+09:00",
      }),
      { id: "7", status: "REMOVED", relation: "CANCELLED" },
    ]);
  });

  it.each([
    ["JOINED", "CANCELLED", 1],
    ["CANCELLED", "JOINED", 2],
  ])(
    "목록의 %s보다 최신 상세의 %s 관계를 표시한다",
    async (previous, latest, count) => {
      fakeBackend({
        "GET /api/users/me/participations?page=0&size=50": () =>
          Response.json(
            envelope({
              items: [{ participationStatus: previous, post: { postId: "1" } }],
            }),
          ),
        "GET /api/posts/1": () =>
          Response.json(
            envelope({
              ...taxiDetail,
              currentMemberCount: count,
              viewer: { ...taxiDetail.viewer, myParticipationStatus: latest },
            }),
          ),
      });
      const history = toMyHistory(
        await myHistoryOperations.list("participated"),
        "participated",
      );
      expect(history.content[0].relation).toBe(latest);
    },
  );

  it.each(["2026-10-27T11:14:58+09:00", "2026-10-27T11:15:10+09:00"])(
    "상세 조회 지연과 더 최신 서버 시각 %s를 반영해 마감 후 취소를 막는다",
    async (detailTime) => {
      const listTime = "2026-10-27T11:14:58+09:00";
      fakeBackend({
        "GET /api/users/me/participations?page=0&size=50": () =>
          Response.json({
            ...envelope({
              items: [{ participationStatus: "JOINED", post: { postId: "1" } }],
            }),
            meta: { evaluatedAt: listTime },
          }),
        "GET /api/posts/1": () => {
          vi.advanceTimersByTime(4_000);
          return Response.json({
            ...envelope({
              ...taxiDetail,
              currentMemberCount: 2,
              viewer: { ...taxiDetail.viewer, myParticipationStatus: "JOINED" },
            }),
            meta: { evaluatedAt: detailTime },
          });
        },
      });
      const history = toMyHistory(
        await myHistoryOperations.list("participated"),
        "participated",
      );
      const expected = Math.max(
        Date.parse(listTime) + 4_000,
        Date.parse(detailTime),
      );
      expect(Date.parse(history.serverTime)).toBe(expected);
      const item = history.content[0];
      if (item.status === "REMOVED") throw new Error("Expected a live post");
      expect(
        getParticipationAvailability(
          toMySnapshot(item, history.serverTime),
          Date.parse(history.serverTime),
        ).action,
      ).toBeNull();
    },
  );

  it("목록 이후 삭제되어 상세가 404면 삭제된 모집으로 표시한다", async () => {
    fakeBackend({
      "GET /api/users/me/participations?page=0&size=50": () =>
        Response.json(
          envelope({
            items: [
              {
                participationStatus: "JOINED",
                post: { postId: "1", postStatus: "OPEN", isRemoved: false },
              },
            ],
          }),
        ),
    });
    const history = toMyHistory(
      await myHistoryOperations.list("participated"),
      "participated",
    );
    expect(history.content).toEqual([
      { id: "1", status: "REMOVED", relation: "JOINED" },
    ]);
  });
});

describe("GET /api/users/me/posts 연동", () => {
  it("작성한 글을 목록 형식으로 읽고 활성 일정의 링크를 남긴다", async () => {
    fakeBackend({
      "GET /api/users/me/posts?page=0&size=50": () =>
        Response.json(
          envelope({
            items: [
              {
                ...taxiItem,
                recruitmentStatus: "RECRUITING",
                author: { displayName: "김하늘" },
                communicationUrl: "https://open.kakao.com/o/mine",
              },
              {
                ...taxiItem,
                postId: "2",
                postStatus: "CANCELLED",
                recruitmentStatus: "CANCELLED",
                joinable: false,
                author: { displayName: "김하늘" },
              },
            ],
            page: 0,
            size: 50,
            totalElements: 2,
            totalPages: 1,
          }),
        ),
    });
    const history = toMyHistory(
      await myHistoryOperations.list("created"),
      "created",
    );
    expect(history.serverTime).toBe(EVALUATED_AT);
    expect(history.content).toEqual([
      expect.objectContaining({
        id: "1",
        relation: "AUTHOR",
        recruitmentStatus: "RECRUITING",
        authorName: "김하늘",
        communicationUrl: "https://open.kakao.com/o/mine",
      }),
      expect.objectContaining({ id: "2", status: "CANCELLED" }),
    ]);
  });

  it("서버에 아직 없는 경로(API_NOT_FOUND)면 준비 중으로 알린다", async () => {
    fakeBackend({});
    await expect(myHistoryOperations.list("created")).rejects.toBeInstanceOf(
      MyHistoryNotConnectedError,
    );
    fakeBackend({
      "GET /api/users/me/posts?page=0&size=50": () => failure(500, "INTERNAL"),
    });
    await expect(
      myHistoryOperations.list("created"),
    ).rejects.not.toBeInstanceOf(MyHistoryNotConnectedError);
  });
});
