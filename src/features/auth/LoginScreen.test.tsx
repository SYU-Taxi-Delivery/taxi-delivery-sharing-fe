import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import type { AuthOperations, CurrentUser } from "./auth";
import { AuthProvider, useAuth } from "./AuthProvider";
import { LoginScreen } from "./LoginScreen";

const router = { replace: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("next/font/google", () => ({
  Noto_Sans_KR: () => ({ className: "test-noto-sans-kr" }),
}));

const student: CurrentUser = {
  id: "1",
  displayName: "김삼육",
  role: "STUDENT",
};

beforeEach(() => router.replace.mockReset());

async function setup(overrides: Partial<AuthOperations> = {}, next = "/") {
  const operations: AuthOperations = {
    me: vi.fn(async () => null),
    login: vi.fn(async () => {}),
    logout: vi.fn(async () => {}),
    ...overrides,
  };
  render(
    <AuthProvider operations={operations}>
      <LoginScreen next={next} />
    </AuthProvider>,
  );
  await act(async () => {});
  return operations;
}

function fill(email: string, password: string) {
  fireEvent.change(screen.getByLabelText("학교 이메일"), {
    target: { value: email },
  });
  fireEvent.change(screen.getByLabelText("비밀번호"), {
    target: { value: password },
  });
}

const submit = () =>
  act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "로그인" }));
  });

describe("LoginScreen", () => {
  it("AC-UI-AUTH-01, AC-NFR-PRV-01-01: 학교 이메일·비밀번호만 레이블과 함께 받는다", async () => {
    await setup();
    expect(
      screen.getByRole("heading", { level: 1, name: "로그인" }),
    ).toBeVisible();
    const email = screen.getByLabelText("학교 이메일");
    const password = screen.getByLabelText("비밀번호");
    expect(email).toHaveAttribute("type", "email");
    expect(email).toHaveAttribute("autocomplete", "username");
    expect(email).toHaveAccessibleDescription(/@syuin\.ac\.kr/);
    expect(password).toHaveAttribute("type", "password");
    expect(password).toHaveAttribute("autocomplete", "current-password");
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(screen.queryByLabelText(/학번|전화/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "회원가입" })).toHaveAttribute(
      "href",
      "/signup",
    );
    expect(
      screen.getByRole("link", { name: "비밀번호를 잊으셨나요?" }),
    ).toHaveAttribute("href", "/forgot-password");
  });

  it("AC-AUTH-001-08: 학교 도메인이 아니면 요청하지 않고 이메일로 포커스를 옮긴다", async () => {
    const operations = await setup();
    fill("a@example.com", "password");
    await submit();
    const email = screen.getByLabelText("학교 이메일");
    expect(operations.login).not.toHaveBeenCalled();
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(email).toHaveAccessibleDescription(/삼육대학교 이메일/);
    expect(email).toHaveFocus();
  });

  it("빈 비밀번호는 비밀번호 필드에서 안내한다", async () => {
    const operations = await setup();
    fill("a@syuin.ac.kr", "");
    await submit();
    expect(operations.login).not.toHaveBeenCalled();
    expect(screen.getByLabelText("비밀번호")).toHaveFocus();
    expect(screen.getByText("비밀번호를 입력해 주세요.")).toBeVisible();
  });

  it("AC-AUTH-001-13: 이메일 양끝 공백만 정리하고 비밀번호는 그대로 보낸 뒤 이동한다", async () => {
    const me = vi.fn<AuthOperations["me"]>(async () => null);
    const login = vi.fn(async () => {
      me.mockResolvedValue(student);
    });
    await setup({ me, login }, "/posts/1");
    fill("  a@syuin.ac.kr ", " pass word ");
    await submit();
    expect(login).toHaveBeenCalledWith({
      email: "a@syuin.ac.kr",
      password: " pass word ",
    });
    expect(router.replace).toHaveBeenCalledWith("/posts/1");
  });

  it("외부 주소로는 로그인 후 이동하지 않는다", async () => {
    await setup({ me: vi.fn(async () => student) }, "https://evil.example");
    expect(router.replace).toHaveBeenCalledWith("/");
  });

  it("AC-UI-AUTH-02, AC-AUTH-001-02: 요청 중에는 중복 제출을 막고 진행 상태를 알린다", async () => {
    let finish!: () => void;
    const login = vi.fn(
      () => new Promise<void>((resolve) => (finish = resolve)),
    );
    await setup({ login });
    fill("a@syuin.ac.kr", "password");
    await submit();
    const button = screen.getByRole("button", { name: "로그인 중…" });
    expect(button).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("확인하고 있어요");
    fireEvent.submit(button.closest("form")!);
    expect(login).toHaveBeenCalledTimes(1);
    await act(async () => finish());
  });

  it("AC-UI-AUTH-03, AC-AUTH-001-14: 실패 원인을 알리고 비밀번호만 비운 뒤 재입력을 돕는다", async () => {
    await setup({
      login: vi.fn(async () => Promise.reject(new ApiError(401, "detail"))),
    });
    fill("a@syuin.ac.kr", "wrong");
    await submit();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "학교 이메일 또는 비밀번호를 확인한 후 다시 입력해 주세요.",
    );
    expect(screen.queryByText("detail")).not.toBeInTheDocument();
    expect(screen.getByLabelText("학교 이메일")).toHaveValue("a@syuin.ac.kr");
    expect(screen.getByLabelText("비밀번호")).toHaveValue("");
    expect(screen.getByLabelText("비밀번호")).toHaveFocus();
    expect(screen.getByRole("button", { name: "로그인" })).toBeEnabled();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("403은 새로고침과 이메일 인증 상태 확인을 안내하고 서버 원문을 숨긴다", async () => {
    await setup({
      login: vi.fn(async () =>
        Promise.reject(new ApiError(403, "missing CSRF token")),
      ),
    });
    fill("a@syuin.ac.kr", "password");
    await submit();
    expect(screen.getByRole("alert")).toHaveTextContent("새로고침");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "학교 이메일 인증 상태",
    );
    expect(screen.queryByText(/missing CSRF token/)).not.toBeInTheDocument();
  });

  it("AC-AUTH-002-07: 서버 로그아웃 실패 안내와 재시도를 제공한다", async () => {
    const logout = vi.fn<AuthOperations["logout"]>(async () =>
      Promise.reject(new TypeError("Failed to fetch")),
    );
    const operations: AuthOperations = {
      me: vi.fn(async () => student),
      login: vi.fn(async () => {}),
      logout,
    };
    let signOut!: () => Promise<boolean>;
    function Capture() {
      signOut = useAuth().logout;
      return null;
    }
    render(
      <AuthProvider operations={operations}>
        <Capture />
        <LoginScreen />
      </AuthProvider>,
    );
    await act(async () => {});
    await act(async () => {
      await signOut();
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "서버 로그아웃을 확인하지 못했어요",
    );
    logout.mockResolvedValue(undefined);
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "서버 로그아웃 다시 시도" }),
      );
    });
    expect(logout).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("status")).toHaveTextContent("로그아웃했어요.");
    expect(
      screen.queryByRole("button", { name: "서버 로그아웃 다시 시도" }),
    ).not.toBeInTheDocument();
  });
});
