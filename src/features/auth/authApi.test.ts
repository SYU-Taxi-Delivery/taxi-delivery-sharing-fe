import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { envelope, failure, fakeBackend } from "@/test/fakeBackend";
import {
  authOperations,
  SESSION_CHANGE_KEY,
  SESSION_SIGNED_OUT,
} from "./authApi";

const me = "GET /api/users/me";
const credentials = { email: " student1@syuin.ac.kr ", password: "demo-pass" };
const student = { userId: "2", name: "student1", role: "STUDENT" };
const currentUser = { id: "2", displayName: "student1", role: "STUDENT" };

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("로그인 세션 연동", () => {
  it("AC-AUTH-001: 학교 이메일을 identifier로 보내고 다른 탭에 세션 변경만 알린다", async () => {
    const { calls } = fakeBackend({
      "POST /api/auth/local/login": () => Response.json(student),
    });
    await authOperations.login(credentials);
    const request = calls.find((call) => call.path === "/api/auth/local/login");
    expect(request?.body).toEqual({
      identifier: "student1@syuin.ac.kr",
      password: "demo-pass",
    });
    expect(request?.headers.get("X-XSRF-TOKEN")).toBe("csrf-token");
    expect(window.localStorage.getItem(SESSION_CHANGE_KEY)).toBeTruthy();
    expect(JSON.stringify(window.localStorage)).not.toMatch(
      /demo-pass|student1/,
    );
  });

  it("로그인 후 CSRF 토큰을 새로 받는다(세션 교체)", async () => {
    const { calls } = fakeBackend({
      "POST /api/auth/local/login": () => Response.json(student),
      "POST /api/posts/1/participants": () =>
        Response.json(envelope({}), { status: 201 }),
    });
    await authOperations.login(credentials);
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
    await expect(authOperations.login(credentials)).rejects.toMatchObject({
      status: 401,
    });
    expect(window.localStorage.length).toBe(0);
  });

  it("로컬 정보가 없어도 쿠키로 현재 사용자를 조회하고 CSRF를 요청하지 않는다", async () => {
    const { calls, fetchMock } = fakeBackend({
      [me]: () => Response.json(student),
    });
    await expect(authOperations.me()).resolves.toEqual(currentUser);
    expect(calls.map(({ path }) => path)).toEqual(["/api/users/me"]);
    expect(calls[0].headers.has("X-XSRF-TOKEN")).toBe(false);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      credentials: "include",
      cache: "no-store",
    });
  });

  it("이전 버전의 사용자 캐시 대신 서버가 확인한 사용자를 복원한다", async () => {
    window.localStorage.setItem(
      "syu-session-user",
      JSON.stringify({ id: "1", role: "ADMIN" }),
    );
    fakeBackend({ [me]: () => Response.json(student) });
    await expect(authOperations.me()).resolves.toEqual(currentUser);
    expect(window.localStorage.getItem("syu-session-user")).toBeNull();
  });

  it("저장소를 사용할 수 없어도 서버의 사용자 정보를 확인한다", async () => {
    for (const method of ["getItem", "removeItem", "setItem"] as const) {
      vi.spyOn(Storage.prototype, method).mockImplementation(() => {
        throw new DOMException("Storage blocked", "SecurityError");
      });
    }
    fakeBackend({
      "POST /api/auth/local/login": () => Response.json(student),
      [me]: () => Response.json(student),
    });
    await authOperations.login(credentials);
    await expect(authOperations.me()).resolves.toEqual(currentUser);
  });

  it("AC-AUTH-002: 세션 만료·정지·탈퇴에 대한 401은 이전 캐시와 관계없이 null이다", async () => {
    window.localStorage.setItem(
      "syu-session-user",
      JSON.stringify(currentUser),
    );
    fakeBackend({ [me]: () => failure(401, "AUTHENTICATION_REQUIRED") });
    await expect(authOperations.me()).resolves.toBeNull();
    expect(window.localStorage.getItem("syu-session-user")).toBeNull();
  });

  it.each([403, 404, 503])(
    "세션 조회 %i를 비로그인으로 간주하지 않는다",
    async (status) => {
      fakeBackend({ [me]: () => failure(status, "UNAVAILABLE") });
      await expect(authOperations.me()).rejects.toMatchObject({ status });
    },
  );

  it.each([
    null,
    { ...student, userId: 2 },
    { ...student, name: " " },
    { ...student, role: "ROOT" },
    envelope(student),
  ])("잘못된 사용자 응답을 거부한다", async (body) => {
    fakeBackend({ [me]: () => Response.json(body) });
    await expect(authOperations.me()).rejects.toMatchObject({
      name: "InvalidBackendResponse",
    });
  });

  it("AC-AUTH-002-01: 로그아웃은 CSRF와 함께 POST /logout으로 보내며 리다이렉트를 따라가지 않는다", async () => {
    const { calls, fetchMock } = fakeBackend({
      "POST /logout": () => Response.error(),
    });
    await expect(authOperations.logout()).resolves.toBeUndefined();
    expect(calls.at(-1)?.headers.get("X-XSRF-TOKEN")).toBe("csrf-token");
    expect(fetchMock.mock.calls.at(-1)?.[1]?.redirect).toBe("manual");
    expect(window.localStorage.getItem(SESSION_CHANGE_KEY)).toBe(
      SESSION_SIGNED_OUT,
    );
    expect(authOperations.isLogoutPending?.()).toBe(false);
  });

  it("실패한 로그아웃은 재시도 대상이며 서버에서 종료를 확인하면 해제한다", async () => {
    fakeBackend({ "POST /logout": () => failure(503, "UNAVAILABLE") });
    await expect(authOperations.logout()).rejects.toMatchObject({
      status: 503,
    });
    expect(authOperations.isLogoutPending?.()).toBe(true);
    fakeBackend({
      "POST /logout": () => failure(401, "AUTHENTICATION_REQUIRED"),
    });
    await authOperations.logout();
    expect(authOperations.isLogoutPending?.()).toBe(false);
  });
});
