import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthOperations } from "@/features/auth/auth";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { users } from "@/test/fixtures";
import Home from "./page";

const router = { replace: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("next/font/google", () => ({
  Noto_Sans_KR: () => ({ className: "test-noto-sans-kr" }),
}));
beforeEach(() => router.replace.mockReset());

async function setup(overrides: Partial<AuthOperations> = {}) {
  const operations: AuthOperations = {
    me: vi.fn(async () => null),
    login: vi.fn(async () => {}),
    logout: vi.fn(async () => {}),
    ...overrides,
  };
  render(
    <AuthProvider operations={operations}>
      <Home />
    </AuthProvider>,
  );
  await act(async () => {});
  return operations;
}

describe("첫 화면", () => {
  it("비로그인 첫 진입에서 로그인 폼과 가입·재설정 링크를 제공한다", async () => {
    await setup();
    expect(screen.getByRole("heading", { name: "로그인" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "택시도 배달도, 삼육대 학생과 함께",
    );
    expect(screen.getByLabelText("학교 이메일")).toBeVisible();
    expect(screen.getByLabelText("비밀번호")).toBeVisible();
    expect(screen.getByRole("link", { name: "회원가입" })).toHaveAttribute(
      "href",
      "/signup",
    );
    expect(
      screen.getByRole("link", { name: "비밀번호를 잊으셨나요?" }),
    ).toHaveAttribute("href", "/forgot-password?next=%2Fposts");
    expect(screen.queryByText("서비스 준비 중")).not.toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("이미 인증된 사용자는 첫 화면에서 모집 목록으로 이동한다", async () => {
    await setup({ me: vi.fn(async () => users.student) });
    expect(router.replace).toHaveBeenCalledWith("/posts");
    expect(router.replace).not.toHaveBeenCalledWith("/");
  });

  it("첫 화면 로그인 성공 후 루트를 반복하지 않고 모집 목록으로 이동한다", async () => {
    const me = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValue(users.student);
    const operations = await setup({ me });
    fireEvent.change(screen.getByLabelText("학교 이메일"), {
      target: { value: "student@syuin.ac.kr" },
    });
    fireEvent.change(screen.getByLabelText("비밀번호"), {
      target: { value: "test-password" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "로그인" }));
    });
    expect(operations.login).toHaveBeenCalledWith({
      email: "student@syuin.ac.kr",
      password: "test-password",
    });
    expect(router.replace).toHaveBeenCalledWith("/posts");
    expect(router.replace).not.toHaveBeenCalledWith("/");
  });

  it("인증 API를 확인할 수 없어도 로그인 입력과 재설정 진입을 유지한다", async () => {
    await setup({
      me: vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    });
    expect(screen.getByRole("button", { name: "로그인" })).toBeEnabled();
    expect(screen.getByLabelText("학교 이메일")).toBeEnabled();
    expect(
      screen.getByRole("link", { name: "비밀번호를 잊으셨나요?" }),
    ).toBeVisible();
    expect(router.replace).not.toHaveBeenCalled();
  });
});
