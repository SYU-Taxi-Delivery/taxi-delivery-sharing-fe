// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./api";
import {
  InvalidBackendResponse,
  backendGet,
  backendSend,
  errorCode,
  serverTimeNow,
} from "./backend";
import {
  EVALUATED_AT,
  envelope,
  failure,
  fakeBackend,
} from "@/test/fakeBackend";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("backend client", () => {
  it("서버 시각에 추가 조회 동안의 경과 시간을 더하고 기기 시계 변경은 무시한다", () => {
    vi.useFakeTimers();
    const now = serverTimeNow(EVALUATED_AT);
    vi.advanceTimersByTime(4_000);
    vi.setSystemTime(new Date("2000-01-01T00:00:00Z"));
    expect(now()).toBe(Date.parse(EVALUATED_AT) + 4_000);
  });

  it("성공 envelope의 data와 서버 판정 시각을 꺼낸다", async () => {
    fakeBackend({ "GET /api/posts": () => Response.json(envelope({ a: 1 })) });
    await expect(backendGet("/api/posts")).resolves.toEqual({
      data: { a: 1 },
      evaluatedAt: EVALUATED_AT,
    });
  });

  it("meta.evaluatedAt이 없는 응답은 쓰지 않는다", async () => {
    fakeBackend({ "GET /api/posts": () => Response.json({ data: {} }) });
    await expect(backendGet("/api/posts")).rejects.toBeInstanceOf(
      InvalidBackendResponse,
    );
  });

  it("변경 요청에 /api/csrf의 헤더 이름과 토큰을 붙이고 토큰을 재사용한다", async () => {
    const { calls } = fakeBackend({
      "POST /api/posts/1/participants": () =>
        Response.json(envelope({}), { status: 201 }),
      "DELETE /api/posts/1/participants": () => Response.json(envelope({})),
    });
    await backendSend("POST", "/api/posts/1/participants");
    await backendSend("DELETE", "/api/posts/1/participants");
    const mutations = calls.filter((call) => call.method !== "GET");
    expect(mutations).toHaveLength(2);
    for (const call of mutations) {
      expect(call.headers.get("X-XSRF-TOKEN")).toBe("csrf-token");
      // Participation mutations have no body.
      expect(call.body).toBeUndefined();
      expect(call.headers.has("Content-Type")).toBe(false);
    }
    expect(calls.filter((call) => call.path === "/api/csrf")).toHaveLength(1);
  });

  it("CSRF_INVALID이면 토큰을 다시 받아 한 번만 재시도한다", async () => {
    let attempts = 0;
    const { calls } = fakeBackend({
      "POST /api/posts": () =>
        ++attempts === 1
          ? failure(403, "CSRF_INVALID")
          : Response.json(envelope({ postId: "9" }), { status: 201 }),
    });
    await expect(
      backendSend("POST", "/api/posts", { title: "t" }),
    ).resolves.toMatchObject({ data: { postId: "9" } });
    expect(attempts).toBe(2);
    expect(calls.filter((call) => call.path === "/api/csrf")).toHaveLength(2);
    expect(calls.at(-1)?.headers.get("Content-Type")).toBe("application/json");
  });

  it("다른 403은 재시도하지 않는다", async () => {
    let attempts = 0;
    fakeBackend({
      "PATCH /api/posts/1": () => {
        attempts += 1;
        return failure(403, "FORBIDDEN_OPERATION");
      },
    });
    await expect(
      backendSend("PATCH", "/api/posts/1", { title: "t" }),
    ).rejects.toMatchObject({ status: 403 });
    expect(attempts).toBe(1);
  });

  it("오류 envelope의 code를 읽고, 형식이 다르면 null이다", () => {
    expect(
      errorCode(
        new ApiError(409, JSON.stringify({ error: { code: "POST_FULL" } })),
      ),
    ).toBe("POST_FULL");
    expect(errorCode(new ApiError(500, "<html>"))).toBeNull();
    expect(errorCode(new Error("x"))).toBeNull();
  });
});
