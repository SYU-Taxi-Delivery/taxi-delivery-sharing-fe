import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForgotPasswordScreen } from "./ForgotPasswordScreen";
import type { PasswordResetOperations } from "./passwordReset";
import { ApiError } from "@/lib/api";

const router = { replace: vi.fn(), push: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("next/font/google", () => ({
  Noto_Sans_KR: () => ({ className: "test-noto-sans-kr" }),
}));

beforeEach(() => {
  router.replace.mockReset();
  router.push.mockReset();
});

function operations(overrides: Partial<PasswordResetOperations> = {}) {
  return {
    requestCode: vi.fn(async () => {}),
    confirm: vi.fn(async () => {}),
    ...overrides,
  } satisfies PasswordResetOperations;
}

const rejected = (status: number, code: string) =>
  new ApiError(status, JSON.stringify({ error: { code } }));

function type(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

const click = (name: string | RegExp) =>
  act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });

async function toCodeStep(ops = operations()) {
  render(<ForgotPasswordScreen operations={ops} />);
  type("학교 이메일", "  student@syuin.ac.kr ");
  await click("인증번호 받기");
  return ops;
}

function fill(code = "123456", password = "new pass 12", confirm = password) {
  type("인증번호", code);
  type("새 비밀번호", password);
  type("새 비밀번호 확인", confirm);
}

describe("ForgotPasswordScreen — 인증번호로 비밀번호 재설정", () => {
  it("처음에는 학교 이메일만 받고 로그인 복귀 경로를 제공한다", () => {
    render(<ForgotPasswordScreen operations={operations()} next="/my" />);
    expect(screen.getByLabelText("학교 이메일")).toHaveAttribute(
      "type",
      "email",
    );
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(screen.queryByLabelText("새 비밀번호")).toBeNull();
    expect(
      screen.getByRole("link", { name: "로그인으로 돌아가기" }),
    ).toHaveAttribute("href", "/login?next=%2Fmy");
    expect(screen.queryByText(/연결하고 있어요|데모/)).toBeNull();
  });

  it("학교 이메일이 아니면 요청하지 않고 이메일 칸을 안내한다", async () => {
    const ops = operations();
    render(<ForgotPasswordScreen operations={ops} />);
    type("학교 이메일", "someone@gmail.com");
    await click("인증번호 받기");
    expect(ops.requestCode).not.toHaveBeenCalled();
    expect(screen.getByLabelText("학교 이메일")).toHaveFocus();
    expect(screen.getByLabelText("학교 이메일")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("양끝 공백을 뺀 이메일로 요청하고, 계정 존재를 밝히지 않는 안내와 함께 인증번호 칸으로 간다", async () => {
    const ops = await toCodeStep();
    expect(ops.requestCode).toHaveBeenCalledWith("student@syuin.ac.kr");
    expect(screen.getByRole("status")).toHaveTextContent(
      "가입된 학교 이메일이라면 인증번호를 보냈어요",
    );
    expect(screen.getByLabelText("인증번호")).toHaveFocus();
    expect(screen.getByLabelText("학교 이메일")).toHaveAttribute("readonly");
    // The server ignores a repeat within 60 seconds; so does the button.
    expect(
      screen.getByRole("button", { name: /인증번호 다시 받기 \(60초 후\)/ }),
    ).toBeDisabled();
  });

  it("요청 중에는 추가 요청을 막는다", async () => {
    let finish!: () => void;
    const ops = operations({
      requestCode: vi.fn(
        () => new Promise<void>((resolve) => (finish = resolve)),
      ),
    });
    render(<ForgotPasswordScreen operations={ops} />);
    type("학교 이메일", "student@syuin.ac.kr");
    await click("인증번호 받기");
    expect(screen.getByRole("button", { name: "요청 중…" })).toBeDisabled();
    fireEvent.submit(screen.getByRole("button", { name: "요청 중…" }));
    expect(ops.requestCode).toHaveBeenCalledTimes(1);
    await act(async () => finish());
  });

  it("메일 발송 실패는 원문 없이 안내하고 같은 이메일로 다시 시도할 수 있다", async () => {
    const ops = operations({
      requestCode: vi
        .fn()
        .mockRejectedValueOnce(rejected(503, "MAIL_DELIVERY_FAILED"))
        .mockResolvedValueOnce(undefined),
    });
    render(<ForgotPasswordScreen operations={ops} />);
    type("학교 이메일", "student@syuin.ac.kr");
    await click("인증번호 받기");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "메일을 보내지 못했어요",
    );
    expect(screen.getByLabelText("학교 이메일")).toHaveValue(
      "student@syuin.ac.kr",
    );
    await click("인증번호 받기");
    expect(ops.requestCode).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText("인증번호")).toBeInTheDocument();
  });

  it("인증번호·비밀번호·확인이 맞지 않으면 요청하지 않고 첫 칸으로 간다", async () => {
    const ops = await toCodeStep();
    fill("12a4", "short", "different");
    await click("비밀번호 변경");
    expect(ops.confirm).not.toHaveBeenCalled();
    expect(screen.getByLabelText("인증번호")).toHaveFocus();
    fill("123456", "short", "short");
    await click("비밀번호 변경");
    expect(ops.confirm).not.toHaveBeenCalled();
    expect(screen.getByLabelText("새 비밀번호")).toHaveFocus();
    expect(
      screen.getByText("비밀번호는 8~64자로 입력해 주세요."),
    ).toBeInTheDocument();
  });

  it("성공하면 비밀번호를 지우고 완료와 로그인 이동만 보여 주며 자동 로그인하지 않는다", async () => {
    const ops = await toCodeStep();
    fill("012345", " new pass 1 ");
    await click("비밀번호 변경");
    expect(ops.confirm).toHaveBeenCalledWith({
      email: "student@syuin.ac.kr",
      code: "012345",
      password: " new pass 1 ",
    });
    expect(
      screen.getByRole("heading", { name: "비밀번호를 변경했어요" }),
    ).toHaveFocus();
    expect(
      screen.getByRole("link", { name: "로그인하러 가기" }),
    ).toHaveAttribute("href", "/login");
    expect(screen.queryByLabelText("새 비밀번호")).toBeNull();
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("인증번호 불일치는 인증번호 칸에 알리고 번호는 남기되 비밀번호는 지운다", async () => {
    const ops = await toCodeStep(
      operations({
        confirm: vi
          .fn()
          .mockRejectedValue(rejected(400, "VERIFICATION_CODE_MISMATCH")),
      }),
    );
    fill();
    await click("비밀번호 변경");
    expect(ops.confirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert")).toHaveTextContent("맞지 않아요");
    expect(screen.getByLabelText("인증번호")).toHaveFocus();
    expect(screen.getByLabelText("인증번호")).toHaveValue("123456");
    expect(screen.getByLabelText("새 비밀번호")).toHaveValue("");
  });

  it.each([
    [400, "VERIFICATION_CODE_EXPIRED"],
    [429, "VERIFICATION_ATTEMPTS_EXCEEDED"],
  ])(
    "%s %s는 쓸 수 없는 번호를 지우고 새 번호를 받으라고 안내한다",
    async (status, code) => {
      await toCodeStep(
        operations({
          confirm: vi.fn().mockRejectedValue(rejected(status, code)),
        }),
      );
      fill();
      await click("비밀번호 변경");
      expect(screen.getByRole("alert")).toHaveTextContent("다시 받기");
      expect(screen.getByLabelText("인증번호")).toHaveValue("");
    },
  );

  it("서버가 비밀번호를 거절하면 새 비밀번호 칸으로 간다", async () => {
    await toCodeStep(
      operations({
        confirm: vi.fn().mockRejectedValue(rejected(400, "INVALID_PASSWORD")),
      }),
    );
    fill("123456", "가나다라마바사아자차카타파하가나다라마바사아자차카");
    await click("비밀번호 변경");
    // 26 Korean letters are 78 UTF-8 bytes: the screen stops it first.
    expect(screen.getByText(/비밀번호가 너무 길어요/)).toBeInTheDocument();
    fill("123456", "valid pass 1");
    await click("비밀번호 변경");
    expect(screen.getByLabelText("새 비밀번호")).toHaveFocus();
    expect(screen.getByText(/한글이 많으면 더 짧아야/)).toBeInTheDocument();
  });

  it("이메일 바꾸기는 입력을 비우고 처음 단계로 돌아간다", async () => {
    await toCodeStep();
    type("인증번호", "123456");
    await click("이메일 바꾸기");
    expect(screen.queryByLabelText("인증번호")).toBeNull();
    expect(screen.getByLabelText("학교 이메일")).not.toHaveAttribute(
      "readonly",
    );
    expect(screen.getByLabelText("학교 이메일")).toHaveFocus();
  });
});
