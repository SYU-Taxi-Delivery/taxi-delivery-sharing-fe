import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { envelope, failure, fakeBackend } from "@/test/fakeBackend";
import { toCurrentUser } from "./auth";
import { authOperations } from "./authApi";

const sessionProbe = "GET /api/users/me/participations?page=0&size=1";
const login = { email: " student1@syuin.ac.kr ", password: "demo-pass" };

beforeEach(() => window.localStorage.clear());
afterEach(async () => {
  vi.restoreAllMocks();
  fakeBackend({ "POST /logout": () => new Response(null, { status: 204 }) });
  await authOperations.logout();
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

  it("저장소가 가득 차도 새 로그인 응답을 이전 사용자 대신 사용한다", async () => {
    window.localStorage.setItem(
      "syu-session-user",
      JSON.stringify({ id: "1", displayName: "previous", role: "ADMIN" }),
    );
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Storage is full", "QuotaExceededError");
    });
    fakeBackend({
      "POST /api/auth/local/login": () =>
        Response.json({ userId: "2", name: "student1", role: "STUDENT" }),
      [sessionProbe]: () => Response.json(envelope({ items: [] })),
    });
    await authOperations.login(login);
    await expect(authOperations.me()).resolves.toEqual({
      id: "2",
      displayName: "student1",
      role: "STUDENT",
    });
  });

  it("저장소 읽기와 쓰기가 차단되어도 현재 페이지에서 로그인할 수 있다", async () => {
    for (const method of ["getItem", "setItem"] as const) {
      vi.spyOn(Storage.prototype, method).mockImplementation(() => {
        throw new DOMException("Storage is blocked", "SecurityError");
      });
    }
    fakeBackend({
      "POST /api/auth/local/login": () =>
        Response.json({ userId: "2", name: "student1", role: "STUDENT" }),
      [sessionProbe]: () => Response.json(envelope({ items: [] })),
    });
    await authOperations.login(login);
    await expect(authOperations.me()).resolves.toEqual({
      id: "2",
      displayName: "student1",
      role: "STUDENT",
    });
  });

  it.each(["clear", "change"] as const)(
    "저장소 읽기 차단 해제 후 %s 상태는 재로그인 전까지 비로그인이다",
    async (action) => {
      window.localStorage.setItem(
        "syu-session-user",
        JSON.stringify({ id: "1", displayName: "previous", role: "ADMIN" }),
      );
      const blockedRead = vi
        .spyOn(Storage.prototype, "getItem")
        .mockImplementation(() => {
          throw new DOMException("Storage is blocked", "SecurityError");
        });
      fakeBackend({
        "POST /api/auth/local/login": () =>
          Response.json({ userId: "2", name: "student1", role: "STUDENT" }),
        [sessionProbe]: () => Response.json(envelope({ items: [] })),
      });
      await authOperations.login(login);
      await expect(authOperations.me()).resolves.toMatchObject({ id: "2" });
      blockedRead.mockRestore();
      if (action === "clear") window.localStorage.clear();
      else {
        window.localStorage.setItem(
          "syu-session-user",
          JSON.stringify({ id: "3", displayName: "other", role: "STUDENT" }),
        );
      }
      await expect(authOperations.me()).resolves.toBeNull();
      await expect(authOperations.me()).resolves.toBeNull();
      await authOperations.login(login);
      await expect(authOperations.me()).resolves.toEqual({
        id: "2",
        displayName: "student1",
        role: "STUDENT",
      });
    },
  );

  it("정상 저장 후 저장소를 비우면 메모리에서 사용자를 되살리지 않는다", async () => {
    fakeBackend({
      "POST /api/auth/local/login": () =>
        Response.json({ userId: "2", name: "student1", role: "STUDENT" }),
      [sessionProbe]: () => Response.json(envelope({ items: [] })),
    });
    await authOperations.login(login);
    window.localStorage.clear();
    await expect(authOperations.me()).resolves.toBeNull();
  });

  it("저장 실패 뒤 남은 이전 사용자 정보도 명시적으로 비우면 로그아웃 상태다", async () => {
    window.localStorage.setItem(
      "syu-session-user",
      JSON.stringify({ id: "1" }),
    );
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Storage is full", "QuotaExceededError");
    });
    fakeBackend({
      "POST /api/auth/local/login": () =>
        Response.json({ userId: "2", name: "student1", role: "STUDENT" }),
      [sessionProbe]: () => Response.json(envelope({ items: [] })),
    });
    await authOperations.login(login);
    window.localStorage.clear();
    await expect(authOperations.me()).resolves.toBeNull();
  });

  it("서버 로그아웃과 저장소 삭제가 실패해도 메모리의 로그인은 지운다", async () => {
    window.localStorage.setItem(
      "syu-session-user",
      JSON.stringify({ id: "1" }),
    );
    for (const method of ["setItem", "removeItem"] as const) {
      vi.spyOn(Storage.prototype, method).mockImplementation(() => {
        throw new DOMException("Storage is blocked", "SecurityError");
      });
    }
    fakeBackend({
      "POST /api/auth/local/login": () =>
        Response.json({ userId: "2", name: "student1", role: "STUDENT" }),
      "POST /logout": () => failure(503, "UNAVAILABLE"),
      [sessionProbe]: () => Response.json(envelope({ items: [] })),
    });
    await authOperations.login(login);
    await expect(authOperations.logout()).rejects.toMatchObject({
      status: 503,
    });
    await expect(authOperations.me()).resolves.toBeNull();
  });

  it("401로 메모리 사용자를 지운 뒤에는 삭제하지 못한 이전 계정을 복원하지 않는다", async () => {
    window.localStorage.setItem(
      "syu-session-user",
      JSON.stringify({ id: "1" }),
    );
    for (const method of ["setItem", "removeItem"] as const) {
      vi.spyOn(Storage.prototype, method).mockImplementation(() => {
        throw new DOMException("Storage is blocked", "SecurityError");
      });
    }
    let expired = true;
    fakeBackend({
      "POST /api/auth/local/login": () =>
        Response.json({ userId: "2", name: "student1", role: "STUDENT" }),
      [sessionProbe]: () =>
        expired
          ? failure(401, "AUTHENTICATION_REQUIRED")
          : Response.json(envelope({ items: [] })),
    });
    await authOperations.login(login);
    await expect(authOperations.me()).resolves.toBeNull();
    expired = false;
    await expect(authOperations.me()).resolves.toBeNull();
  });
});
