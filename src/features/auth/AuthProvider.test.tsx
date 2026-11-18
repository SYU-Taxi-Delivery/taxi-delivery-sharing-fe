import { act, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import type { AuthOperations, CurrentUser } from "./auth";
import { AuthProvider, useAuth, type AuthController } from "./AuthProvider";
import { SESSION_CHANGE_KEY } from "./authApi";

const student: CurrentUser = {
  id: "1",
  displayName: "김삼육",
  role: "STUDENT",
};
const other: CurrentUser = {
  id: "2",
  displayName: "다른 학생",
  role: "STUDENT",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup(overrides: Partial<AuthOperations> = {}) {
  const operations: AuthOperations = {
    me: vi.fn(async () => null),
    login: vi.fn(async () => {}),
    logout: vi.fn(async () => {}),
    ...overrides,
  };
  const auth = { current: undefined as unknown as AuthController };
  function Probe() {
    auth.current = useAuth();
    return (
      <p data-testid="state">
        {auth.current.status}:{auth.current.user?.displayName ?? "-"}
      </p>
    );
  }
  function Protected() {
    // Local state stands in for protected data cached by a screen.
    const [draft, setDraft] = useState("");
    return (
      <input
        aria-label="보호 데이터"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
    );
  }
  render(
    <AuthProvider operations={operations}>
      <Probe />
      <Protected />
    </AuthProvider>,
  );
  return { operations, auth, state: () => screen.getByTestId("state") };
}

async function flush() {
  await act(async () => {});
}

describe("AuthProvider 초기 확인", () => {
  it("AC-AUTH-003-01: 현재 사용자 조회 결과로 로그인 상태가 된다", async () => {
    const { state } = setup({ me: vi.fn(async () => student) });
    expect(state()).toHaveTextContent("checking");
    await flush();
    expect(state()).toHaveTextContent("authenticated:김삼육");
  });

  it.each([
    ["null", async () => null],
    ["HTTP 401", async () => Promise.reject(new ApiError(401, ""))],
  ])("AC-AUTH-003-03: %s 응답은 비로그인이다", async (_, me) => {
    const { state } = setup({ me: vi.fn(me) });
    await flush();
    expect(state()).toHaveTextContent("anonymous:-");
  });

  it.each([
    new TypeError("Failed to fetch"),
    new ApiError(500, ""),
    new Error("invalid"),
  ])("확인 실패 %s는 로그인으로 간주하지 않는다", async (error) => {
    const { state } = setup({ me: vi.fn(async () => Promise.reject(error)) });
    await flush();
    expect(state()).toHaveTextContent("unavailable:-");
  });

  it("역할이 잘못된 응답은 로그인으로 처리하지 않는다", async () => {
    const { state } = setup({
      me: vi.fn(async () => ({ id: "1", displayName: "a", role: "ROOT" })),
    });
    await flush();
    expect(state()).toHaveTextContent("unavailable:-");
  });
});

it("Strict Mode의 재마운트 후에도 초기 확인을 마친다", async () => {
  const me = vi.fn(async () => student);
  function Probe() {
    const { status } = useAuth();
    return <p data-testid="strict">{status}</p>;
  }
  render(
    <StrictMode>
      <AuthProvider operations={{ me, login: vi.fn(), logout: vi.fn() }}>
        <Probe />
      </AuthProvider>
    </StrictMode>,
  );
  await act(async () => {});
  expect(screen.getByTestId("strict")).toHaveTextContent("authenticated");
});

describe("AuthProvider 재확인", () => {
  it("AC-AUTH-002-06: 화면 복귀 때 세션이 없으면 만료로 바꾼다", async () => {
    const me = vi.fn<AuthOperations["me"]>(async () => student);
    const { auth, state } = setup({ me });
    await flush();
    me.mockResolvedValue(null);
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(state()).toHaveTextContent("expired:-");
    expect(auth.current.notice?.message).toContain("만료");
  });

  it("다른 탭에서 로그아웃하거나 다른 계정으로 로그인하면 바로 다시 확인한다", async () => {
    const me = vi.fn<AuthOperations["me"]>(async () => student);
    const { state } = setup({ me });
    await flush();
    me.mockResolvedValue(other);
    await act(async () => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: SESSION_CHANGE_KEY }),
      );
    });
    expect(state()).toHaveTextContent("authenticated:다른 학생");

    // Unrelated keys do not trigger a check.
    me.mockClear();
    await act(async () => {
      window.dispatchEvent(new StorageEvent("storage", { key: "theme" }));
    });
    expect(me).not.toHaveBeenCalled();

    me.mockResolvedValue(null);
    await act(async () => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: SESSION_CHANGE_KEY }),
      );
    });
    expect(state()).toHaveTextContent("anonymous:-");
  });

  it("다른 탭의 계정 변경을 알면 이전 조회 결과를 버리고 새 세션 확인 실패 시 보호 정보를 숨긴다", async () => {
    const stale = deferred<unknown>();
    const latest = deferred<unknown>();
    const me = vi
      .fn<AuthOperations["me"]>()
      .mockResolvedValueOnce(student)
      .mockReturnValueOnce(stale.promise)
      .mockReturnValueOnce(latest.promise);
    const { state } = setup({ me });
    await flush();
    act(() => {
      window.dispatchEvent(new Event("focus"));
      window.dispatchEvent(
        new StorageEvent("storage", { key: SESSION_CHANGE_KEY }),
      );
    });
    expect(state()).toHaveTextContent("checking:-");
    await act(async () => stale.resolve(student));
    expect(state()).toHaveTextContent("checking:-");
    await act(async () => latest.reject(new TypeError("failed to fetch")));
    expect(state()).toHaveTextContent("unavailable:-");
  });

  it("일시적인 재확인 실패는 로그인 사용자를 유지한다", async () => {
    const me = vi.fn<AuthOperations["me"]>(async () => student);
    const { state } = setup({ me });
    await flush();
    me.mockRejectedValue(new TypeError("Failed to fetch"));
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(state()).toHaveTextContent("authenticated:김삼육");
  });

  it("AC-AUTH-002-05: 뒤로 가기 캐시에서 복원되면 다시 확인한다", async () => {
    const me = vi.fn<AuthOperations["me"]>(async () => student);
    setup({ me });
    await flush();
    await act(async () => {
      window.dispatchEvent(
        new PageTransitionEvent("pageshow", { persisted: true }),
      );
    });
    expect(me).toHaveBeenCalledTimes(2);
  });

  it("조회가 진행 중이면 추가 조회를 보내지 않는다", async () => {
    const pending = deferred<unknown>();
    const me = vi.fn(() => pending.promise);
    setup({ me });
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(me).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve(student));
  });

  it("AC-AUTH-002-06: 보호 API 401 알림으로 사용자를 즉시 지운다", async () => {
    const { auth, state } = setup({ me: vi.fn(async () => student) });
    await flush();
    act(() => auth.current.handleUnauthorized());
    expect(state()).toHaveTextContent("expired:-");
  });
});

describe("AuthProvider 로그인", () => {
  it("로그인 확인 응답을 기다리는 동안 다른 탭에서 계정이 바뀌면 최신 사용자를 확인한다", async () => {
    const stale = deferred<unknown>();
    const me = vi
      .fn<AuthOperations["me"]>()
      .mockResolvedValueOnce(null)
      .mockReturnValueOnce(stale.promise)
      .mockResolvedValueOnce(other);
    const { auth, state } = setup({ me });
    await flush();
    let login!: Promise<void>;
    await act(async () => {
      login = auth.current.login({ email: "a@syuin.ac.kr", password: "pw" });
    });
    expect(me).toHaveBeenCalledTimes(2);
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: SESSION_CHANGE_KEY }),
      );
    });
    await act(async () => {
      stale.resolve(student);
      await login;
    });
    expect(state()).toHaveTextContent("authenticated:다른 학생");
  });
  it("AC-AUTH-001-13: 로그인 후 현재 사용자를 확인하고 진입한다", async () => {
    const me = vi.fn<AuthOperations["me"]>(async () => null);
    const login = vi.fn(async () => {
      me.mockResolvedValue(student);
    });
    const { auth, state } = setup({ me, login });
    await flush();
    await act(() =>
      auth.current.login({ email: "a@syuin.ac.kr", password: "pw" }),
    );
    expect(login).toHaveBeenCalledWith({
      email: "a@syuin.ac.kr",
      password: "pw",
    });
    expect(state()).toHaveTextContent("authenticated:김삼육");
  });

  it("AC-AUTH-001-14: 로그인 실패는 비로그인을 유지하고 오류를 전달한다", async () => {
    const failure = new ApiError(401, "");
    const { auth, state } = setup({
      login: vi.fn(async () => Promise.reject(failure)),
    });
    await flush();
    await act(async () => {
      await expect(
        auth.current.login({ email: "a@syuin.ac.kr", password: "x" }),
      ).rejects.toBe(failure);
    });
    expect(state()).toHaveTextContent("anonymous:-");
  });

  it("로그인 응답 후 세션이 확인되지 않으면 실패로 처리한다", async () => {
    const { auth, state } = setup();
    await flush();
    await act(async () => {
      await expect(
        auth.current.login({ email: "a@syuin.ac.kr", password: "x" }),
      ).rejects.toThrow("세션");
    });
    expect(state()).toHaveTextContent("anonymous:-");
  });

  it("AC-AUTH-003-04: 다른 사용자로 바뀌면 이전 화면 상태를 남기지 않는다", async () => {
    const me = vi.fn<AuthOperations["me"]>(async () => student);
    const { auth, state } = setup({
      me,
      login: vi.fn(async () => {
        me.mockResolvedValue(other);
      }),
    });
    await flush();
    fireEvent.change(screen.getByLabelText("보호 데이터"), {
      target: { value: "김삼육의 데이터" },
    });
    await act(() =>
      auth.current.login({ email: "b@syuin.ac.kr", password: "pw" }),
    );
    expect(state()).toHaveTextContent("authenticated:다른 학생");
    expect(screen.getByLabelText("보호 데이터")).toHaveValue("");
  });
});

describe("AuthProvider 로그아웃", () => {
  it("새로고침 후에도 미확인 로그아웃은 재시도할 수 있고 이전 세션을 복원하지 않는다", async () => {
    const { auth, operations, state } = setup({ isLogoutPending: () => true });
    await flush();
    expect(state()).toHaveTextContent("anonymous:-");
    expect(operations.me).not.toHaveBeenCalled();
    expect(auth.current.serverLogoutPending).toBe(true);
  });
  it("AC-AUTH-002-01: 서버 로그아웃 후 사용자와 보호 상태를 지운다", async () => {
    const { auth, operations, state } = setup({
      me: vi.fn(async () => student),
    });
    await flush();
    fireEvent.change(screen.getByLabelText("보호 데이터"), {
      target: { value: "명단" },
    });
    let confirmed = false;
    await act(async () => {
      confirmed = await auth.current.logout();
    });
    expect(operations.logout).toHaveBeenCalledTimes(1);
    expect(confirmed).toBe(true);
    expect(state()).toHaveTextContent("anonymous:-");
    expect(screen.getByLabelText("보호 데이터")).toHaveValue("");
    expect(auth.current.notice).toEqual({
      tone: "info",
      message: "로그아웃했어요.",
    });
  });

  it("AC-AUTH-002-03: 이미 만료된 세션의 로그아웃도 정상 종료한다", async () => {
    const { auth } = setup({
      me: vi.fn(async () => student),
      logout: vi.fn(async () => Promise.reject(new ApiError(401, ""))),
    });
    await flush();
    let confirmed = false;
    await act(async () => {
      confirmed = await auth.current.logout();
    });
    expect(confirmed).toBe(true);
    expect(auth.current.serverLogoutPending).toBe(false);
  });

  it("AC-AUTH-002-07: 서버 실패 시 로컬 정보만 지우고 자동 재로그인하지 않는다", async () => {
    const me = vi.fn<AuthOperations["me"]>(async () => student);
    const logout = vi.fn<AuthOperations["logout"]>(async () =>
      Promise.reject(new TypeError("Failed to fetch")),
    );
    const { auth, state } = setup({ me, logout });
    await flush();
    let confirmed = true;
    await act(async () => {
      confirmed = await auth.current.logout();
    });
    expect(confirmed).toBe(false);
    expect(state()).toHaveTextContent("anonymous:-");
    expect(auth.current.serverLogoutPending).toBe(true);
    expect(auth.current.notice?.tone).toBe("error");

    // The server session may still be alive; a focus recheck must not restore it.
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(me).toHaveBeenCalledTimes(1);
    expect(state()).toHaveTextContent("anonymous:-");

    logout.mockResolvedValue(undefined);
    await act(async () => {
      confirmed = await auth.current.logout();
    });
    expect(confirmed).toBe(true);
    expect(auth.current.serverLogoutPending).toBe(false);
  });

  it("로그아웃 중 도착한 이전 조회 결과로 다시 로그인되지 않는다", async () => {
    const me = vi.fn<AuthOperations["me"]>(async () => student);
    const logout = deferred<void>();
    const { auth, state } = setup({ me, logout: vi.fn(() => logout.promise) });
    await flush();
    const stale = deferred<unknown>();
    me.mockReturnValue(stale.promise);
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    let done!: Promise<boolean>;
    act(() => {
      done = auth.current.logout();
    });
    await act(async () => stale.resolve(student));
    await act(async () => {
      logout.resolve();
      await done;
    });
    expect(state()).toHaveTextContent("anonymous:-");
  });

  it("중복 클릭은 로그아웃 요청을 한 번만 보낸다", async () => {
    const pending = deferred<void>();
    const logout = vi.fn(() => pending.promise);
    const { auth } = setup({ me: vi.fn(async () => student), logout });
    await flush();
    let second = true;
    act(() => {
      void auth.current.logout();
    });
    await act(async () => {
      second = await auth.current.logout();
    });
    expect(second).toBe(false);
    expect(logout).toHaveBeenCalledTimes(1);
    expect(auth.current.loggingOut).toBe(true);
    await act(async () => pending.resolve());
  });
});

it("Provider 밖에서는 useAuth를 사용할 수 없다", () => {
  function Outside() {
    useAuth();
    return null;
  }
  vi.spyOn(console, "error").mockImplementation(() => {});
  expect(() => render(<Outside />)).toThrow("AuthProvider");
});
