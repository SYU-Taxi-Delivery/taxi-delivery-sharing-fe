import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import type { AuthOperations } from "./auth";
import { AuthProvider } from "./AuthProvider";
import type { SignupOperations } from "./signup";
import { SignupScreen } from "./SignupScreen";

const router = { replace: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("next/font/google", () => ({
  Noto_Sans_KR: () => ({ className: "test-noto-sans-kr" }),
}));

beforeEach(() => {
  router.replace.mockReset();
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "performance"] });
});
afterEach(() => vi.useRealTimers());

async function setup(overrides: Partial<SignupOperations> = {}) {
  const operations: SignupOperations = {
    requestCode: vi.fn(async () => {}),
    verifyCode: vi.fn(async () => {}),
    register: vi.fn(async () => {}),
    ...overrides,
  };
  const auth: AuthOperations = {
    me: vi.fn(async () => null),
    login: vi.fn(async () => {}),
    logout: vi.fn(async () => {}),
  };
  render(
    <AuthProvider operations={auth}>
      <SignupScreen operations={operations} />
    </AuthProvider>,
  );
  await act(async () => {});
  return operations;
}

const click = (name: string | RegExp) =>
  act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

async function verifyEmail(email = "a@syuin.ac.kr") {
  type("학교 이메일", email);
  await click("인증번호 받기");
  type("인증번호", "123456");
  await click("확인");
}

async function fillAll() {
  await verifyEmail();
  type("닉네임", " 삼육 학생 ");
  type("비밀번호", " long password 15 ");
  type("비밀번호 확인", " long password 15 ");
  fireEvent.click(screen.getByLabelText("[필수] 이용약관 동의"));
  fireEvent.click(screen.getByLabelText("[필수] 개인정보 수집·이용 동의"));
}

describe("SignupScreen", () => {
  it("AC-NFR-PRV-01-01: 학교 이메일·닉네임·비밀번호와 필수 동의만 받는다", async () => {
    await setup();
    expect(
      screen.getByRole("heading", { level: 1, name: "회원가입" }),
    ).toBeVisible();
    expect(screen.getByRole("group", { name: "학교 계정" })).toHaveTextContent(
      "미인증",
    );
    expect(screen.getByLabelText("학교 이메일")).toHaveAttribute(
      "type",
      "email",
    );
    expect(screen.getByLabelText("비밀번호")).toHaveAttribute(
      "autocomplete",
      "new-password",
    );
    expect(screen.queryByLabelText(/학번|전화/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "회원가입" })).toBeDisabled();
    expect(screen.getByRole("link", { name: "로그인" })).toHaveAttribute(
      "href",
      "/login",
    );
  });

  it("AC-AUTH-001-08: 학교 도메인이 아니면 인증번호를 요청하지 않는다", async () => {
    const operations = await setup();
    type("학교 이메일", "a@syu.ac.kr");
    await click("인증번호 받기");
    expect(operations.requestCode).not.toHaveBeenCalled();
    expect(screen.getByLabelText("학교 이메일")).toHaveAccessibleDescription(
      /@syuin\.ac\.kr/,
    );
    expect(screen.getByLabelText("학교 이메일")).toHaveFocus();
  });

  it("@가 여러 개인 이메일에는 인증번호를 요청하지 않는다", async () => {
    const operations = await setup();
    type("학교 이메일", "a@@syuin.ac.kr");
    await click("인증번호 받기");
    expect(operations.requestCode).not.toHaveBeenCalled();
    expect(screen.getByLabelText("학교 이메일")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("AC-AUTH-001-09: 인증번호 발송 후 가입 여부와 무관한 안내와 입력칸을 제공한다", async () => {
    const operations = await setup();
    type("학교 이메일", "  a@syuin.ac.kr ");
    await click("인증번호 받기");
    expect(operations.requestCode).toHaveBeenCalledWith("a@syuin.ac.kr");
    expect(screen.getByRole("status")).toHaveTextContent(
      "입력한 학교 이메일로 인증번호를 보냈어요",
    );
    expect(screen.getByLabelText("인증번호")).toHaveFocus();
    expect(screen.getByLabelText("인증번호")).toHaveAttribute(
      "autocomplete",
      "one-time-code",
    );
  });

  it("AC-AUTH-001-24: 60초 동안 재발송을 막고 경계부터 허용한다", async () => {
    const operations = await setup();
    type("학교 이메일", "a@syuin.ac.kr");
    await click("인증번호 받기");
    expect(
      screen.getByRole("button", { name: "인증번호 다시 받기 (60초)" }),
    ).toBeDisabled();
    await act(async () => vi.advanceTimersByTime(59_000));
    expect(
      screen.getByRole("button", { name: "인증번호 다시 받기 (1초)" }),
    ).toBeDisabled();
    await act(async () => vi.advanceTimersByTime(1_000));
    await click("인증번호 다시 받기");
    expect(operations.requestCode).toHaveBeenCalledTimes(2);
  });

  it("이메일 변경 후 발송에 실패하면 이전 주소의 인증 대기로 돌아가지 않는다", async () => {
    const requestCode = vi
      .fn<SignupOperations["requestCode"]>()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await setup({ requestCode });
    type("학교 이메일", "a@syuin.ac.kr");
    await click("인증번호 받기");
    type("학교 이메일", "b@syuin.ac.kr");
    await act(async () => vi.advanceTimersByTime(60_000));
    await click("인증번호 다시 받기");
    expect(requestCode).toHaveBeenLastCalledWith("b@syuin.ac.kr");
    expect(screen.getByRole("alert")).toHaveTextContent("네트워크");
    expect(screen.queryByLabelText("인증번호")).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "학교 계정" })).toHaveTextContent(
      "미인증",
    );
    expect(screen.getByRole("button", { name: "회원가입" })).toBeDisabled();
  });

  it("같은 주소의 재발송 실패는 기존 인증번호 입력을 유지한다", async () => {
    const requestCode = vi
      .fn<SignupOperations["requestCode"]>()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await setup({ requestCode });
    type("학교 이메일", "a@syuin.ac.kr");
    await click("인증번호 받기");
    type("인증번호", "123456");
    await act(async () => vi.advanceTimersByTime(60_000));
    await click("인증번호 다시 받기");
    expect(screen.getByRole("alert")).toHaveTextContent("네트워크");
    expect(screen.getByLabelText("인증번호")).toHaveValue("123456");
    expect(screen.getByRole("group", { name: "학교 계정" })).toHaveTextContent(
      "인증 대기",
    );
  });

  it("인증번호에는 숫자 6자리만 남긴다", async () => {
    await setup();
    type("학교 이메일", "a@syuin.ac.kr");
    await click("인증번호 받기");
    type("인증번호", "12a34-5678");
    expect(screen.getByLabelText("인증번호")).toHaveValue("123456");
  });

  it("AC-AUTH-001-11: 틀린 인증번호는 오류를 알리고 다시 입력하게 한다", async () => {
    await setup({
      verifyCode: vi.fn(async () => Promise.reject(new ApiError(400, ""))),
    });
    type("학교 이메일", "a@syuin.ac.kr");
    await click("인증번호 받기");
    type("인증번호", "000000");
    await click("확인");
    expect(screen.getByRole("alert")).toHaveTextContent("맞지 않거나 만료");
    expect(screen.getByLabelText("인증번호")).toHaveFocus();
    expect(screen.getByRole("group", { name: "학교 계정" })).toHaveTextContent(
      "인증 대기",
    );
  });

  it("AC-AUTH-001-10: 인증 완료 후 이메일을 고정하고 닉네임으로 이동한다", async () => {
    const operations = await setup();
    await verifyEmail();
    expect(operations.verifyCode).toHaveBeenCalledWith(
      "a@syuin.ac.kr",
      "123456",
    );
    expect(screen.getByRole("group", { name: "학교 계정" })).toHaveTextContent(
      "인증 완료",
    );
    expect(screen.getByLabelText("학교 이메일")).toHaveAttribute("readonly");
    expect(screen.queryByLabelText("인증번호")).not.toBeInTheDocument();
    expect(screen.getByLabelText("닉네임")).toHaveFocus();
  });

  it("인증 후 이메일을 바꾸면 인증을 다시 시작한다", async () => {
    await setup();
    await verifyEmail();
    await click("다른 이메일로 변경");
    expect(screen.getByLabelText("학교 이메일")).not.toHaveAttribute(
      "readonly",
    );
    expect(screen.getByRole("group", { name: "학교 계정" })).toHaveTextContent(
      "미인증",
    );
    expect(screen.getByRole("button", { name: "회원가입" })).toBeDisabled();
  });

  it("인증과 필수 동의 전에는 가입할 수 없다", async () => {
    await setup();
    await verifyEmail();
    expect(screen.getByRole("button", { name: "회원가입" })).toBeDisabled();
    fireEvent.click(screen.getByLabelText("[필수] 이용약관 동의"));
    expect(screen.getByRole("button", { name: "회원가입" })).toBeDisabled();
    fireEvent.click(screen.getByLabelText("[필수] 개인정보 수집·이용 동의"));
    expect(screen.getByRole("button", { name: "회원가입" })).toBeEnabled();
  });

  it("AC-AUTH-001-21: 짧은 비밀번호는 요청 없이 해당 칸에서 안내하고 수정하면 지운다", async () => {
    const operations = await setup();
    await fillAll();
    type("비밀번호", "short");
    type("비밀번호 확인", "short");
    await click("회원가입");
    expect(operations.register).not.toHaveBeenCalled();
    const password = screen.getByLabelText("비밀번호");
    expect(password).toHaveFocus();
    expect(password).toHaveAttribute("aria-invalid", "true");
    expect(password).toHaveAccessibleDescription(/15~128자로 입력해/);
    type("비밀번호", "a long enough password");
    expect(password).not.toHaveAttribute("aria-invalid");
  });

  it("비밀번호 확인이 다르면 안내한다", async () => {
    const operations = await setup();
    await fillAll();
    type("비밀번호 확인", "different password!");
    await click("회원가입");
    expect(operations.register).not.toHaveBeenCalled();
    expect(screen.getByLabelText("비밀번호 확인")).toHaveFocus();
    expect(screen.getByText("비밀번호가 일치하지 않아요.")).toBeVisible();
  });

  it("AC-AUTH-004-05: 정리한 닉네임과 원래 비밀번호만 보내고 role을 보내지 않는다", async () => {
    const operations = await setup();
    await fillAll();
    await click("회원가입");
    expect(operations.register).toHaveBeenCalledWith({
      email: "a@syuin.ac.kr",
      displayName: "삼육 학생",
      password: " long password 15 ",
    });
    expect(
      Object.keys(vi.mocked(operations.register).mock.calls[0][0]),
    ).not.toContain("role");
    expect(
      screen.getByRole("heading", { name: "가입이 완료됐어요" }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "로그인하러 가기" }),
    ).toHaveAttribute("href", "/login");
  });

  it("AC-AUTH-001-22: 서버가 거절하면 원문 없이 안내하고 다시 시도할 수 있다", async () => {
    await setup({
      register: vi.fn(async () =>
        Promise.reject(new ApiError(400, "blocked: CompromisedPass15!")),
      ),
    });
    await fillAll();
    await click("회원가입");
    expect(screen.getByRole("alert")).toHaveTextContent("유출된 비밀번호");
    expect(screen.queryByText(/CompromisedPass/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "회원가입" })).toBeEnabled();
  });

  it("인증이 만료되어 거절되면 인증을 다시 받게 한다", async () => {
    await setup({
      register: vi.fn(async () => Promise.reject(new ApiError(403, ""))),
    });
    await fillAll();
    await click("회원가입");
    expect(screen.getByRole("alert")).toHaveTextContent("다시 받아");
    expect(screen.getByRole("group", { name: "학교 계정" })).toHaveTextContent(
      "미인증",
    );
    expect(screen.getByRole("button", { name: "회원가입" })).toBeDisabled();
  });

  it("요청 중에는 중복 가입 요청을 보내지 않는다", async () => {
    let finish!: () => void;
    const register = vi.fn(
      () => new Promise<void>((resolve) => (finish = resolve)),
    );
    await setup({ register });
    await fillAll();
    await click("회원가입");
    const button = screen.getByRole("button", { name: "가입 중…" });
    expect(button).toBeDisabled();
    fireEvent.submit(button.closest("form")!);
    expect(register).toHaveBeenCalledTimes(1);
    await act(async () => finish());
  });

  it("약관 보기는 펼침 상태를 알리고 내용을 토글한다", async () => {
    await setup();
    const toggle = screen.getByRole("button", {
      name: "이용약관 동의 내용 보기",
    });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("이용약관 전문은 확정 후 제공돼요.")).toBeVisible();
    fireEvent.click(toggle);
    expect(
      screen.queryByText("이용약관 전문은 확정 후 제공돼요."),
    ).not.toBeInTheDocument();
  });
});
