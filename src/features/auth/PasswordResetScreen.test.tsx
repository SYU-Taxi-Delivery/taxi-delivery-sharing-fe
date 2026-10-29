import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForgotPasswordScreen } from "./ForgotPasswordScreen";
import { ResetPasswordScreen } from "./ResetPasswordScreen";
import {
  PasswordResetError,
  type PasswordResetOperations,
} from "./passwordReset";

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
    requestLink: vi.fn(async () => {}),
    resetPassword: vi.fn(async () => {}),
    ...overrides,
  } satisfies PasswordResetOperations;
}

function type(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

const click = (name: string) =>
  act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });

function fillPassword(password = "new password 123", confirm = password) {
  type("새 비밀번호", password);
  type("새 비밀번호 확인", confirm);
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("ForgotPasswordScreen", () => {
  it("AC-AUTH-001-06: 학교 이메일만 받고 로그인 복귀 경로를 제공한다", () => {
    render(<ForgotPasswordScreen operations={operations()} />);
    expect(screen.getByLabelText("학교 이메일")).toHaveAttribute(
      "type",
      "email",
    );
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(screen.queryByLabelText(/^(비밀번호|학번|전화번호)$/)).toBeNull();
    expect(screen.getByRole("link", { name: /로그인/ })).toHaveAttribute(
      "href",
      "/login",
    );
  });

  it.each(["", "a@example.com", "a@other@syuin.ac.kr"])(
    "잘못된 학교 이메일 %j는 요청하지 않고 입력 칸으로 포커스를 옮긴다",
    async (email) => {
      const api = operations();
      render(<ForgotPasswordScreen operations={api} />);
      type("학교 이메일", email);
      await click("재설정 링크 받기");
      expect(api.requestLink).not.toHaveBeenCalled();
      expect(screen.getByLabelText("학교 이메일")).toHaveAttribute(
        "aria-invalid",
        "true",
      );
      expect(screen.getByLabelText("학교 이메일")).toHaveFocus();
    },
  );

  it("AC-AUTH-001-17의 FE: 이메일 양끝 공백만 제거하고 계정 존재를 밝히지 않는 안내를 표시한다", async () => {
    const api = operations();
    render(<ForgotPasswordScreen operations={api} />);
    type("학교 이메일", "  Student@SYUIN.AC.KR ");
    await click("재설정 링크 받기");
    expect(api.requestLink).toHaveBeenCalledWith("Student@SYUIN.AC.KR");
    const title = screen.getByRole("heading", {
      name: "메일함을 확인해 주세요",
    });
    expect(title).toHaveFocus();
    expect(screen.getByText(/가입된 학교 이메일이라면/)).toBeVisible();
    expect(screen.queryByText(/가입되지 않은|존재하지 않는 계정/)).toBeNull();
    await click("다시 요청하기");
    expect(screen.getByLabelText("학교 이메일")).toBeVisible();
  });

  it("발송 중 입력과 추가 제출을 막는다", async () => {
    const pending = deferred();
    const api = operations({ requestLink: vi.fn(() => pending.promise) });
    render(<ForgotPasswordScreen operations={api} />);
    type("학교 이메일", "a@syuin.ac.kr");
    const form = screen
      .getByRole("button", { name: "재설정 링크 받기" })
      .closest("form")!;
    act(() => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });
    expect(api.requestLink).toHaveBeenCalledTimes(1);
    expect(form).toHaveAttribute("aria-busy", "true");
    expect(screen.getByLabelText("학교 이메일")).toHaveAttribute("readonly");
    expect(
      screen.getByRole("button", { name: /요청 중|보내는 중|발송 중/ }),
    ).toBeDisabled();
    await act(async () => pending.resolve());
  });

  it("발송 실패는 원문을 숨기고 같은 이메일로 재시도할 수 있다", async () => {
    const api = operations({
      requestLink: vi.fn(async () => {
        throw new Error("private account details");
      }),
    });
    render(<ForgotPasswordScreen operations={api} />);
    type("학교 이메일", "a@syuin.ac.kr");
    await click("재설정 링크 받기");
    expect(screen.getByRole("alert")).not.toHaveTextContent("private");
    expect(screen.getByLabelText("학교 이메일")).toHaveValue("a@syuin.ac.kr");
    expect(
      screen.getByRole("button", { name: "재설정 링크 받기" }),
    ).toBeEnabled();
    expect(
      screen.queryByRole("heading", { name: "메일함을 확인해 주세요" }),
    ).toBeNull();
  });

  it("운영 기본 화면은 API 준비 안내를 표시하며 발송 완료로 넘어가지 않는다", async () => {
    render(<ForgotPasswordScreen />);
    type("학교 이메일", "a@syuin.ac.kr");
    await click("재설정 링크 받기");
    expect(screen.getByRole("alert")).toHaveTextContent("준비");
    expect(
      screen.queryByRole("heading", { name: "메일함을 확인해 주세요" }),
    ).toBeNull();
  });
});

describe("ResetPasswordScreen", () => {
  it.each([undefined, "", " \t "])(
    "토큰 %j는 비밀번호 입력 대신 새 링크 요청을 안내한다",
    (token) => {
      render(<ResetPasswordScreen token={token} operations={operations()} />);
      expect(screen.queryByLabelText("새 비밀번호")).toBeNull();
      expect(
        screen.getByRole("link", { name: "새 재설정 링크 받기" }),
      ).toHaveAttribute("href", "/forgot-password");
    },
  );

  it("확인 비밀번호가 다르면 요청하지 않고 해당 칸을 안내한다", async () => {
    const api = operations();
    render(<ResetPasswordScreen token="opaque-token" operations={api} />);
    fillPassword("new password 123", "different password");
    await click("비밀번호 변경");
    expect(api.resetPassword).not.toHaveBeenCalled();
    expect(screen.getByLabelText("새 비밀번호 확인")).toHaveFocus();
    expect(
      screen.getByLabelText("새 비밀번호 확인"),
    ).toHaveAccessibleDescription(/일치하지/);
  });

  it.each([14, 129])(
    "%i 코드포인트 비밀번호를 요청 전에 거절한다",
    async (length) => {
      const api = operations();
      render(<ResetPasswordScreen token="opaque-token" operations={api} />);
      fillPassword("😀".repeat(length));
      await click("비밀번호 변경");
      expect(api.resetPassword).not.toHaveBeenCalled();
      expect(screen.getByLabelText("새 비밀번호")).toHaveFocus();
      expect(screen.getByLabelText("새 비밀번호")).toHaveAccessibleDescription(
        /15~128/,
      );
    },
  );

  it("NFC로 정규화하되 비밀번호 공백과 불투명 토큰은 그대로 보존한다", async () => {
    const api = operations();
    const token = "opaque/+token= ";
    render(<ResetPasswordScreen token={token} operations={api} />);
    const password = ` ${"e\u0301".repeat(13)} `;
    fillPassword(password);
    expect(screen.getByLabelText("새 비밀번호")).toHaveAttribute(
      "autocomplete",
      "new-password",
    );
    expect(screen.getByLabelText("새 비밀번호 확인")).toHaveAttribute(
      "autocomplete",
      "new-password",
    );
    await click("비밀번호 변경");
    expect(api.resetPassword).toHaveBeenCalledWith({
      token,
      password: password.normalize("NFC"),
    });
    expect(document.body).not.toHaveTextContent(token);
  });

  it("128 코드포인트 경계를 허용하고 완료 후 비밀번호를 지우며 자동 로그인하지 않는다", async () => {
    const api = operations();
    render(<ResetPasswordScreen token="opaque-token" operations={api} />);
    fillPassword("😀".repeat(128));
    await click("비밀번호 변경");
    expect(api.resetPassword).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("heading", { name: "비밀번호를 변경했어요" }),
    ).toHaveFocus();
    expect(screen.queryByLabelText("새 비밀번호")).toBeNull();
    expect(screen.getByRole("link", { name: /로그인/ })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("변경 중 입력과 추가 제출을 막는다", async () => {
    const pending = deferred();
    const api = operations({ resetPassword: vi.fn(() => pending.promise) });
    render(<ResetPasswordScreen token="opaque-token" operations={api} />);
    fillPassword();
    const form = screen
      .getByRole("button", { name: "비밀번호 변경" })
      .closest("form")!;
    act(() => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });
    expect(api.resetPassword).toHaveBeenCalledTimes(1);
    expect(form).toHaveAttribute("aria-busy", "true");
    expect(screen.getByLabelText("새 비밀번호")).toHaveAttribute("readonly");
    expect(screen.getByRole("button", { name: /변경 중/ })).toBeDisabled();
    await act(async () => pending.resolve());
  });

  it.each([
    new PasswordResetError("passwordRejected"),
    new Error("SQL stack trace token=private-token"),
  ])(
    "변경 거절 시 안전한 오류만 표시하고 비밀번호를 지운다: %s",
    async (failure) => {
      const api = operations({
        resetPassword: vi.fn(async () => {
          throw failure;
        }),
      });
      render(<ResetPasswordScreen token="opaque-token" operations={api} />);
      fillPassword();
      await click("비밀번호 변경");
      expect(screen.getByRole("alert")).not.toHaveTextContent(
        /SQL|stack|private-token/,
      );
      expect(screen.getByLabelText("새 비밀번호")).toHaveValue("");
      expect(screen.getByLabelText("새 비밀번호 확인")).toHaveValue("");
      expect(
        screen.getByRole("button", { name: "비밀번호 변경" }),
      ).toBeEnabled();
    },
  );

  it("만료·사용된 링크를 거절하면 비밀번호 입력을 닫고 새 링크 요청을 안내한다", async () => {
    const api = operations({
      resetPassword: vi.fn(async () => {
        throw new PasswordResetError("invalidLink");
      }),
    });
    render(<ResetPasswordScreen token="opaque-token" operations={api} />);
    fillPassword();
    await click("비밀번호 변경");
    expect(
      screen.getByRole("heading", { name: "재설정 링크를 확인해 주세요" }),
    ).toHaveFocus();
    expect(screen.queryByLabelText("새 비밀번호")).toBeNull();
    expect(
      screen.getByRole("link", { name: "새 재설정 링크 받기" }),
    ).toHaveAttribute("href", "/forgot-password");
  });

  it("기본 adapter에서는 변경 완료를 가장하지 않고 연동 준비 상태를 알린다", async () => {
    render(<ResetPasswordScreen token="opaque-token" />);
    fillPassword();
    await click("비밀번호 변경");
    expect(screen.getByRole("alert")).toHaveTextContent("준비");
    expect(
      screen.queryByRole("heading", { name: "비밀번호를 변경했어요" }),
    ).toBeNull();
  });

  it("다른 링크로 바뀌면 이전 비밀번호·완료 응답이 새 링크 화면에 남지 않는다", async () => {
    const pending = deferred();
    const api = operations({ resetPassword: vi.fn(() => pending.promise) });
    const view = render(
      <ResetPasswordScreen token="old-token" operations={api} />,
    );
    fillPassword();
    await click("비밀번호 변경");
    view.rerender(<ResetPasswordScreen token="new-token" operations={api} />);
    expect(screen.getByLabelText("새 비밀번호")).toHaveValue("");
    fillPassword("another password 123");
    await act(async () => pending.resolve());
    expect(screen.getByLabelText("새 비밀번호")).toHaveValue(
      "another password 123",
    );
    expect(
      screen.queryByRole("heading", { name: "비밀번호를 변경했어요" }),
    ).toBeNull();
  });
});
