// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { envelope, failure, fakeBackend, taxiDetail } from "@/test/fakeBackend";
import { PostFormError, editAccess, type PostRequest } from "./postDraft";
import { postFormOperations } from "./postFormApi";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const taxiRequest: PostRequest = {
  type: "TAXI",
  title: "통합 테스트 택시",
  description: "정문 앞에서 만나요.",
  communicationUrl: null,
  departure: "삼육대학교 정문",
  destination: "태릉입구역",
  referenceTime: "2026-10-27T14:30:00+09:00",
  capacity: 4,
};

describe("모집글 작성·수정 연동", () => {
  it("AC-POST-002-01: POST /api/posts는 description을 content로 보내고 postId를 돌려준다", async () => {
    const { calls } = fakeBackend({
      "POST /api/posts": () =>
        Response.json(envelope({ ...taxiDetail, postId: "3" }), {
          status: 201,
        }),
    });
    await expect(postFormOperations.create(taxiRequest)).resolves.toBe("3");
    const { description, ...rest } = taxiRequest;
    expect(calls.at(-1)?.body).toEqual({ ...rest, content: description });
    expect(calls.at(-1)!.headers.has("Idempotency-Key")).toBe(false);
    expect(calls.at(-1)!.headers.get("X-XSRF-TOKEN")).toBe("csrf-token");
  });

  it("#34: 응답이 끊긴 작성은 내 작성 글 첫 페이지에서 같은 글을 찾는다", async () => {
    const mine = {
      postId: "9",
      postStatus: "OPEN",
      type: "TAXI",
      title: " 통합 테스트 택시 ",
      referenceTime: "2026-10-27T05:30:00Z", // same instant, other offset
      departure: "삼육대학교 정문",
      destination: "태릉입구역",
    };
    const { calls } = fakeBackend({
      "GET /api/users/me/posts?page=0&size=50": () =>
        Response.json(
          envelope({
            items: [
              { ...mine, postId: "8", title: "다른 글" },
              { ...mine, postId: "7", destination: "석계역" },
              { ...mine, postId: "6", postStatus: "CANCELLED" },
              mine,
            ],
          }),
        ),
    });
    await expect(postFormOperations.findCreated!(taxiRequest)).resolves.toBe(
      "9",
    );
    expect(calls.at(-1)?.method).toBe("GET");
    fakeBackend({
      "GET /api/users/me/posts?page=0&size=50": () =>
        Response.json(envelope({ items: [{ ...mine, title: "다른 글" }] })),
    });
    await expect(
      postFormOperations.findCreated!(taxiRequest),
    ).resolves.toBeNull();
  });

  it.each([
    ["CANCELLED", "분식집", "정문", null],
    ["FULL", "분식집", "정문", "8"],
    ["CLOSED", "분식집", "정문", "8"],
    ["OPEN", "다른 분식집", "정문", null],
    ["OPEN", "분식집", "후문", null],
  ] as const)(
    "배달 작성 복구: %s · %s · %s",
    async (postStatus, restaurantName, pickupLocation, expectedId) => {
      const delivery = {
        type: "DELIVERY",
        title: "정문 분식 배달",
        restaurantName: "분식집",
        pickupLocation: "정문",
        referenceTime: "2026-10-27T14:30:00+09:00",
      } as const;
      const request: PostRequest = {
        ...delivery,
        description: "정문에서 받아요.",
        communicationUrl: null,
        orderGuide: null,
        capacity: 4,
      };
      fakeBackend({
        "GET /api/users/me/posts?page=0&size=50": () =>
          Response.json(
            envelope({
              items: [
                { ...delivery, postId: "5", postStatus: "CANCELLED" },
                {
                  ...delivery,
                  postId: "8",
                  postStatus,
                  restaurantName,
                  pickupLocation,
                },
              ],
            }),
          ),
      });
      await expect(postFormOperations.findCreated!(request)).resolves.toBe(
        expectedId,
      );
    },
  );

  it("AC-POST-004: PATCH는 바꿀 수 없는 type을 빼고 보낸다", async () => {
    const { calls } = fakeBackend({
      "PATCH /api/posts/3": () => Response.json(envelope(taxiDetail)),
    });
    await postFormOperations.update("3", {
      title: "수정",
      description: "내용",
      communicationUrl: null,
    });
    expect(calls.at(-1)).toMatchObject({
      method: "PATCH",
      body: { title: "수정", content: "내용", communicationUrl: null },
    });
    await postFormOperations.update("3", taxiRequest);
    expect(calls.at(-1)?.body).not.toHaveProperty("type");
  });

  it.each([
    ["POST_TIME_CONFLICT", 409, "duplicate"],
    ["POST_REFERENCE_TIME_TOO_EARLY", 400, "time"],
    ["INVALID_POST_FIELD", 400, "invalid"],
    ["INVALID_REQUEST", 400, "invalid"],
    ["POST_CORE_FIELDS_LOCKED", 409, "conflict"],
    ["POST_FINISHED", 409, "conflict"],
    ["FORBIDDEN_OPERATION", 403, "forbidden"],
    ["POST_NOT_FOUND", 404, "notFound"],
  ])("오류 %s(HTTP %i)는 %s로 바꾼다", async (code, status, kind) => {
    fakeBackend({ "POST /api/posts": () => failure(status, code) });
    const error = await postFormOperations.create(taxiRequest).catch((e) => e);
    expect(error).toBeInstanceOf(PostFormError);
    expect(error.kind).toBe(kind);
  });

  it("INVALID_POST_FIELD의 details.field를 해당 입력 칸 오류로 표시한다", async () => {
    fakeBackend({
      "POST /api/posts": () =>
        Response.json(
          {
            error: {
              code: "INVALID_POST_FIELD",
              details: { field: "content" },
            },
            meta: envelope(null).meta,
          },
          { status: 400 },
        ),
    });
    const error = await postFormOperations.create(taxiRequest).catch((e) => e);
    expect(error).toMatchObject({ kind: "invalid" });
    expect(Object.keys(error.fieldErrors)).toEqual(["description"]);
  });

  it("수정 화면은 상세를 읽어 작성자 여부와 참여 인원으로 잠금을 정한다", async () => {
    fakeBackend({
      "GET /api/posts/3": () =>
        Response.json(
          envelope({
            ...taxiDetail,
            postId: "3",
            currentMemberCount: 2,
            communicationUrl: "https://open.kakao.com/o/abc",
            viewer: { ...taxiDetail.viewer, isAuthor: true, canEdit: true },
          }),
        ),
    });
    const post = await postFormOperations.load("3");
    expect(post).toMatchObject({
      id: "3",
      status: "OPEN",
      isAuthor: true,
      otherJoinedCount: 1,
      draft: {
        type: "TAXI",
        common: {
          title: "석계역 → 삼육대학교",
          description: "모집 안내",
          communicationUrl: "https://open.kakao.com/o/abc",
        },
        taxi: { departure: "석계역", date: "2026-10-27", time: "11:25" },
      },
    });
    expect(editAccess(post)).toMatchObject({
      editable: true,
      coreLocked: true,
    });
  });

  it("없는 모집 수정은 notFound다", async () => {
    fakeBackend({ "GET /api/posts/3": () => failure(404, "POST_NOT_FOUND") });
    await expect(postFormOperations.load("3")).rejects.toMatchObject({
      kind: "notFound",
    });
  });

  it("유사 모집 API가 없어 빈 결과로 작성을 이어간다", async () => {
    await expect(postFormOperations.findSimilar(taxiRequest)).resolves.toEqual(
      [],
    );
  });
});
