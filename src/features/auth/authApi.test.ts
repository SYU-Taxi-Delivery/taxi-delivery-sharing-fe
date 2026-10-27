import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { envelope, failure, fakeBackend } from "@/test/fakeBackend";
import { toCurrentUser } from "./auth";
import { authOperations } from "./authApi";

const sessionProbe = "GET /api/users/me/participations?page=0&size=1";
const login = { email: " student1@syuin.ac.kr ", password: "demo-pass" };

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("로그인 세션 연동", () => {
  it("AC-AUTH-001: 학교 이메일을 identifier로 보내고 응답 사용자를 me()로 확인한다", async () => {
    const { calls } = fakeBackend({
      "POST /api/auth/local/login": () =>
        Response.json({ userId: "2", name: "student1", role: "STUDENT" }),
      [sessionProbe]: () =>
        Response.json(
          envelope({ items: [], page: 0, size: 1, totalElements: 0 }),
        ),
    });
    await authOperations.login(login);
    const request = calls.find((call) => call.path === "/api/auth/local/login");
    expect(request?.body).toEqual({
      identifier: "student1@syuin.ac.kr",
      password: "demo-pass",
    });
    expect(request?.headers.get("X-XSRF-TOKEN")).toBe("csrf-token");
    // The password is never kept in storage.
    expect(JSON.stringify(window.localStorage)).not.toContain("demo-pass");
    expect(toCurrentUser(await authOperations.me())).toEqual({
      id: "2",
      displayName: "student1",
      role: "STUDENT",
    });
  });

  it("로그인 후 CSRF 토큰을 새로 받는다(세션 교체)", async () => {
    const { calls } = fakeBackend({
      "POST /api/auth/local/login": () =>
        Response.json({ userId: "2", name: "student1", role: "STUDENT" }),
      "POST /api/posts/1/participants": () =>
        Response.json(envelope({}), { status: 201 }),
    });
    await authOperations.login(login);
    const { postDetailOperations } =
      await import("@/features/posts/detail/postDetailApi");
    await postDetailOperations.join("1");
    expect(calls.filter((call) => call.path === "/api/csrf")).toHaveLength(2);
  });

  it("AC-AUTH-001-14: 로그인 실패 401은 ApiError로 전달한다", async () => {
    fakeBackend({
      "POST /api/auth/local/login": () =>
        failure(401, "AUTHENTICATION_REQUIRED"),
    });
    await expect(authOperations.login(login)).rejects.toMatchObject({
      status: 401,
    });
    expect(window.localStorage.length).toBe(0);
  });

  it("기억한 사용자가 없으면 요청 없이 비로그인이다", async () => {
    const { fetchMock } = fakeBackend({});
    await expect(authOperations.me()).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("AC-AUTH-002: 세션이 만료되면(401) 기억한 사용자를 지우고 null이다", async () => {
    window.localStorage.setItem(
      "syu-session-user",
      JSON.stringify({ id: "2", displayName: "student1", role: "STUDENT" }),
    );
    fakeBackend({
      [sessionProbe]: () => failure(401, "AUTHENTICATION_REQUIRED"),
    });
    await expect(authOperations.me()).resolves.toBeNull();
    expect(window.localStorage.getItem("syu-session-user")).toBeNull();
  });

  it("세션 확인이 네트워크로 실패하면 로그인 상태를 단정하지 않고 오류를 전달한다", async () => {
    window.localStorage.setItem(
      "syu-session-user",
      JSON.stringify({ id: "2", displayName: "student1", role: "STUDENT" }),
    );
    fakeBackend({ [sessionProbe]: () => failure(503, "UNAVAILABLE") });
    await expect(authOperations.me()).rejects.toMatchObject({ status: 503 });
  });

  it("AC-AUTH-002-01: 로그아웃은 CSRF와 함께 POST /logout, 302는 따라가지 않고 성공이다", async () => {
    window.localStorage.setItem("syu-session-user", "{}");
    const { calls } = fakeBackend({
      // fetch(redirect: "manual") exposes a 302 as an opaque, status-0 response.
      "POST /logout": () => Response.error(),
    });
    await expect(authOperations.logout()).resolves.toBeUndefined();
    expect(calls.at(-1)?.headers.get("X-XSRF-TOKEN")).toBe("csrf-token");
    expect(window.localStorage.getItem("syu-session-user")).toBeNull();
  });
});
