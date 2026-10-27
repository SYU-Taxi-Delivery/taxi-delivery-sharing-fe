// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EVALUATED_AT,
  envelope,
  fakeBackend,
  taxiDetail,
} from "@/test/fakeBackend";
import { toMyHistory } from "./myHistory";
import { myHistoryOperations } from "./myHistoryApi";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("GET /api/users/me/participations 연동", () => {
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
        Response.json(envelope({ ...taxiDetail, currentMemberCount: 2 })),
    });
    const history = toMyHistory(
      await myHistoryOperations.list("participated"),
      "participated",
    );
    expect(history.serverTime).toBe(EVALUATED_AT);
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
