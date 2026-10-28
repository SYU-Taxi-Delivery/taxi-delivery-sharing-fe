// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { envelope, failure, fakeBackend, taxiItem } from "@/test/fakeBackend";
import { postStatusLabel, toPostPage } from "./posts";
import { postListOperations } from "./postsApi";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const deliveryItem = {
  postId: "2",
  type: "DELIVERY",
  title: "교내 공동 배달",
  postStatus: "OPEN",
  referenceTime: "2026-10-27T12:25:00+09:00",
  participationDeadline: "2026-10-27T12:15:00+09:00",
  capacity: 10,
  currentMemberCount: 1,
  remainingSeats: 9,
  joinable: false,
  restaurantName: "교내 음식점",
  pickupLocation: "정문",
};

const page = (items: unknown[]) =>
  Response.json(
    envelope({ items, page: 1, size: 20, totalElements: 22, totalPages: 2 }),
  );

describe("GET /api/posts 연동", () => {
  it("AC-DISC-001: 백엔드 목록을 화면 PostPage로 바꾸고 참여 마감 시각을 유지한다", async () => {
    fakeBackend({
      "GET /api/posts?page=1&size=20": () => page([taxiItem, deliveryItem]),
    });
    const result = toPostPage(
      await postListOperations.list({
        type: "ALL",
        joinableOnly: false,
        page: 1,
      }),
    );
    expect(result).toMatchObject({
      number: 1,
      size: 20,
      totalElements: 22,
      totalPages: 2,
    });
    expect(result.content[0]).toMatchObject({
      id: "1",
      status: "OPEN",
      type: "TAXI",
      departure: "석계역",
      participationDeadline: "2026-10-27T11:15:00+09:00",
    });
    // The help text follows the server's deadline (T-10 today).
    expect(postStatusLabel(result.content[1]).reason).toBe(
      "주문 마감 10분 전 마감",
    );
  });

  it.each([
    [{ type: "TAXI", joinableOnly: false }, "page=0&size=20&type=TAXI"],
    [
      { type: "DELIVERY", joinableOnly: true },
      "page=0&size=20&type=DELIVERY&status=OPEN",
    ],
    [{ type: "ALL", joinableOnly: true }, "page=0&size=20&status=OPEN"],
  ] as const)("필터 %j는 ?%s로 요청한다", async (filter, query) => {
    const { calls } = fakeBackend({
      [`GET /api/posts?${query}`]: () => page([]),
    });
    await postListOperations.list({ ...filter, page: 0 });
    expect(calls.at(-1)?.path).toBe(`/api/posts?${query}`);
  });

  it("401은 로그인 만료 처리를 위해 그대로 전달한다", async () => {
    fakeBackend({
      "GET /api/posts?page=0&size=20": () =>
        failure(401, "AUTHENTICATION_REQUIRED"),
    });
    await expect(
      postListOperations.list({ type: "ALL", joinableOnly: false, page: 0 }),
    ).rejects.toMatchObject({ name: "ApiError", status: 401 });
  });
});
