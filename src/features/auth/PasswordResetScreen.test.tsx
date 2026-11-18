import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import ResetPasswordPage from "@/app/reset-password/page";
import { demoPath } from "@/features/demo/demoPaths";
import { ForgotPasswordScreen } from "./ForgotPasswordScreen";
import { ResetPasswordScreen } from "./ResetPasswordScreen";
import type { PasswordResetOperations } from "./passwordReset";

const operations = () => ({
  requestCode: vi
    .fn<PasswordResetOperations["requestCode"]>()
    .mockResolvedValue(undefined),
  resetPassword: vi
    .fn<PasswordResetOperations["resetPassword"]>()
    .mockResolvedValue(undefined),
});
const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const click = async (name: string) => {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
};
const fill = (
  code = "012345",
  password = "  cafe\u0301 pass  ",
  confirm = password,
) => {
  type("인증번호", code);
  type("새 비밀번호", password);
  type("새 비밀번호 확인", confirm);
};
afterEach(() => vi.useRealTimers());

describe("비밀번호 재설정", () => {
  it.each([
    [
      "/my?tab=created",
      "/reset-password?next=%2Fmy%3Ftab%3Dcreated",
      "/password-reset-preview?next=%2Fmy%3Ftab%3Dcreated&mode=reset",
    ],
    [
      "//outside.example",
      "/reset-password",
      "/password-reset-preview?mode=reset",
    ],
  ])(
    "받은 코드 입력 링크가 안전한 복귀 경로만 유지한다 (%s)",
    (next, live, demo) => {
      render(<ForgotPasswordScreen operations={operations()} next={next} />);
      const href = screen
        .getByRole("link", { name: "이미 받은 인증번호 입력하기" })
        .getAttribute("href")!;
      expect(href).toBe(live);
      expect(demoPath(href)).toBe(demo);
    },
  );
  it.each([
    ["/my?tab=created", "/login?next=%2Fmy%3Ftab%3Dcreated"],
    [["/my", "//outside.example"], "/login?next=%2Fmy"],
    ["https://outside.example", "/login"],
    ["//outside.example", "/login"],
    [undefined, "/login"],
  ])(
    "재설정 직접 진입에도 안전한 로그인 복귀 경로를 사용한다 (%s)",
    async (next, href) => {
      render(
        await ResetPasswordPage({
          searchParams: Promise.resolve({ next }),
        }),
      );
      expect(screen.getByLabelText("인증번호")).toBeVisible();
      expect(
        screen.getByRole("link", { name: "로그인으로 돌아가기" }),
      ).toHaveAttribute("href", href);
    },
  );
  it("발송부터 변경까지 이메일을 이어받고 원문 비밀번호와 앞자리 0을 보존한다", async () => {
    const api = operations();
    render(<ForgotPasswordScreen operations={api} next="/my" />);
    type("학교 이메일", "Member@SYU.AC.KR");
    await click("인증번호 받기");
    expect(api.requestCode).toHaveBeenCalledWith("member@syu.ac.kr");
    expect(screen.getByRole("status")).toHaveTextContent(
      "가입된 학교 이메일이라면",
    );
    expect(screen.getByLabelText("인증번호")).toHaveFocus();
    fill();
    await click("비밀번호 변경");
    expect(api.resetPassword).toHaveBeenCalledWith({
      schoolEmail: "member@syu.ac.kr",
      code: "012345",
      newPassword: "  cafe\u0301 pass  ",
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      "새 비밀번호로 다시 로그인",
    );
    expect(
      screen.getByRole("heading", { name: "비밀번호를 변경했어요" }),
    ).toHaveFocus();
    expect(screen.queryByLabelText("새 비밀번호")).toBeNull();
    expect(
      screen.getByRole("link", { name: "로그인으로 돌아가기" }),
    ).toHaveAttribute("href", "/login?next=%2Fmy");
    expect(location.search).toBe("");
  });
  it("60초 후 다시 요청할 수 있고 반복 200을 새 코드 발급 완료로 알리지 않는다", async () => {
    vi.useFakeTimers();
    const api = operations();
    render(<ForgotPasswordScreen operations={api} />);
    type("학교 이메일", "a@syuin.ac.kr");
    await click("인증번호 받기");
    expect(screen.getByRole("button", { name: /1분 후/ })).toBeDisabled();
    expect(screen.getByText(/메일 발급 후 5분/)).toBeVisible();
    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    await click("인증번호 다시 받기");
    expect(api.requestCode).toHaveBeenCalledTimes(2);
    expect(api.resetPassword).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent(
      "가입된 학교 이메일이라면",
    );
  });
  it("학교 이메일을 확인하고 외부 로그인 복귀 주소를 버린다", async () => {
    const api = operations();
    render(<ForgotPasswordScreen next="//outside.example" operations={api} />);
    type("학교 이메일", "a@example.com");
    await click("인증번호 받기");
    expect(api.requestCode).not.toHaveBeenCalled();
    expect(screen.getByLabelText("학교 이메일")).toHaveFocus();
    expect(
      screen.getByRole("link", { name: "로그인으로 돌아가기" }),
    ).toHaveAttribute("href", "/login");
  });
  it.each([
    ["12345", "12345678", "12345678", "인증번호"],
    ["012345", "x", "x", "새 비밀번호"],
    ["012345", "12345678", "12345679", "새 비밀번호 확인"],
  ])(
    "직접 진입해도 변경 전에 필드 오류를 표시한다 (%s,%s,%s)",
    async (code, password, confirm, field) => {
      const api = operations();
      render(<ResetPasswordScreen operations={api} />);
      type("학교 이메일", "a@syu.ac.kr");
      fill(code, password, confirm);
      await click("비밀번호 변경");
      expect(api.resetPassword).not.toHaveBeenCalled();
      expect(screen.getByLabelText(field)).toHaveFocus();
      expect(screen.getByRole("alert")).toBeVisible();
    },
  );
  it("발송 중 중복 요청을 막고 실패해도 이메일을 보존한다", async () => {
    const api = operations();
    let reject!: (error: Error) => void;
    api.requestCode.mockImplementation(
      () =>
        new Promise((_ok, fail) => {
          reject = fail;
        }),
    );
    render(<ForgotPasswordScreen operations={api} />);
    type("학교 이메일", "a@syu.ac.kr");
    const form = screen
      .getByRole("button", { name: "인증번호 받기" })
      .closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(api.requestCode).toHaveBeenCalledTimes(1);
    expect(form).toHaveAttribute("aria-busy", "true");
    await act(async () => reject(new Error("private detail")));
    expect(screen.getByRole("alert")).not.toHaveTextContent("private detail");
    expect(screen.getByLabelText("학교 이메일")).toHaveValue("a@syu.ac.kr");
    expect(screen.queryByLabelText("인증번호")).toBeNull();
  });
  it("변경 중 중복 제출을 막고 서버 만료 응답에 재발송을 안내하며 비밀번호를 지운다", async () => {
    const api = operations();
    let reject!: (error: Error) => void;
    api.resetPassword.mockImplementation(
      () =>
        new Promise((_ok, fail) => {
          reject = fail;
        }),
    );
    render(<ResetPasswordScreen operations={api} />);
    type("학교 이메일", "a@syu.ac.kr");
    fill();
    const form = screen
      .getByRole("button", { name: "비밀번호 변경" })
      .closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(api.resetPassword).toHaveBeenCalledTimes(1);
    await act(async () =>
      reject(
        new ApiError(
          400,
          JSON.stringify({ error: { code: "VERIFICATION_CODE_EXPIRED" } }),
        ),
      ),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("만료");
    expect(screen.getByLabelText("새 비밀번호")).toHaveValue("");
    expect(screen.getByLabelText("새 비밀번호 확인")).toHaveValue("");
    expect(
      screen.getByRole("button", { name: "인증번호 다시 받기" }),
    ).toBeEnabled();
  });
});
