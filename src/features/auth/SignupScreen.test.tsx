import { act, fireEvent, render, screen, within } from "@testing-library/react";
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

async function fillAccount({
  name = " 삼육 학생 ",
  studentNo = " 0012345678 ",
  password = " long password 15 ",
  confirm,
}: {
  name?: string;
  studentNo?: string;
  password?: string;
  confirm?: string;
} = {}) {
  confirm ??= password;
  type("이름", name);
  type("학번", studentNo);
  type("비밀번호", password);
  type("비밀번호 확인", confirm);
  await click("다음");
}

async function fillAll() {
  await verifyEmail();
  await fillAccount();
  fireEvent.click(screen.getByLabelText("[필수] 이용약관 동의"));
  fireEvent.click(screen.getByLabelText("[필수] 개인정보 수집·이용 동의"));
}

const currentStep = () =>
  screen
    .getByRole("list", { name: "가입 단계" })
    .querySelector('[aria-current="step"]');

describe("SignupScreen", () => {
  it("운영 가입 화면은 인증과 약관 준비 상태를 입력 전에 알린다", async () => {
    render(
      <AuthProvider
        operations={{
          me: async () => null,
          login: async () => {},
          logout: async () => {},
        }}
      >
        <SignupScreen />
      </AuthProvider>,
    );
    await act(async () => {});
    expect(screen.getByText(/현재 이메일 인증과 가입 요청/)).toBeVisible();
    expect(screen.getByLabelText("학교 이메일")).toBeVisible();
    expect(screen.getByText("기존 회원이세요?")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "가입 데모 보기" }),
    ).toHaveAttribute("href", "/signup-preview");
    expect(
      screen.getByRole("link", { name: "로그인으로 돌아가기" }),
    ).toHaveAttribute("href", "/login");
  });

  it("단계 표시는 학교 이메일 인증 → 계정 정보 → 약관 동의 순서와 현재 단계를 알린다", async () => {
    await setup();
    const steps = within(
      screen.getByRole("list", { name: "가입 단계" }),
    ).getAllByRole("listitem");
    expect(steps.map((step) => step.textContent)).toEqual([
      "1학교 이메일 인증",
      "2계정 정보",
      "3약관 동의",
    ]);
    expect(currentStep()).toHaveTextContent("학교 이메일 인증");
    await verifyEmail();
    expect(currentStep()).toHaveTextContent("계정 정보");
    expect(steps[0]).toHaveTextContent("학교 이메일 인증 완료");
    await fillAccount();
    expect(currentStep()).toHaveTextContent("약관 동의");
    expect(
      screen.getByRole("heading", { level: 2, name: "약관 동의" }),
    ).toHaveFocus();
  });

  it("AC-NFR-PRV-01-01: 학번·이름·학교 이메일·비밀번호와 필수 동의를 받는다", async () => {
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
    expect(screen.getByLabelText("학교 이메일")).toHaveAttribute(
      "name",
      "schoolEmail",
    );
    await verifyEmail();
    expect(screen.getByLabelText("이름")).toHaveAttribute("name", "name");
    expect(screen.getByLabelText("이름")).toBeRequired();
    expect(screen.getByLabelText("이름")).toHaveAttribute(
      "autocomplete",
      "name",
    );
    expect(screen.getByLabelText("학번")).toHaveAttribute("name", "studentNo");
    expect(screen.getByLabelText("학번")).toHaveAttribute("type", "text");
    expect(screen.getByLabelText("학번")).toBeRequired();
    expect(screen.getByLabelText("비밀번호")).toHaveAttribute(
      "name",
      "password",
    );
    expect(screen.getByLabelText("비밀번호")).toHaveAttribute(
      "autocomplete",
      "new-password",
    );
    expect(screen.queryByLabelText(/닉네임|전화|계좌/)).not.toBeInTheDocument();
    await fillAccount();
    expect(screen.getByRole("button", { name: "회원가입" })).toBeDisabled();
    expect(
      screen.getByRole("link", { name: "로그인으로 돌아가기" }),
    ).toHaveAttribute("href", "/login");
  });

  it("계정 정보 단계에서 이름 공개 범위를 알린다", async () => {
    await setup();
    await verifyEmail();
    expect(screen.getByLabelText("이름")).toHaveAccessibleDescription(
      /모집글 작성자·참여자 명단·댓글에 보여요\. 학교 이메일과 학번은 다른 학생에게 보이지 않아요/,
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
    expect(screen.getByRole("status")).toHaveTextContent(
      "인증번호는 발급 후 5분 동안 유효해요",
    );
    expect(screen.getByText("발급 후 5분")).toBeVisible();
    expect(screen.getByText("인증번호를 보낸 주소")).toBeVisible();
    expect(screen.getByText("a@syuin.ac.kr")).toBeVisible();
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

  it("이메일 수정은 입력한 주소를 그대로 두고 주소 입력으로 돌아간다", async () => {
    const operations = await setup();
    type("학교 이메일", "a@syuin.ac.kr");
    await click("인증번호 받기");
    await click("이메일 수정");
    const input = screen.getByLabelText("학교 이메일");
    expect(input).toHaveValue("a@syuin.ac.kr");
    expect(input).toHaveFocus();
    expect(screen.queryByLabelText("인증번호")).not.toBeInTheDocument();
    // The resend cooldown still applies after editing.
    expect(
      screen.getByRole("button", { name: "인증번호 받기 (60초)" }),
    ).toBeDisabled();
    // Unchanged address: the code already sent can still be entered.
    await click("받은 인증번호 입력하기");
    expect(screen.getByLabelText("인증번호")).toHaveFocus();
    expect(operations.requestCode).toHaveBeenCalledTimes(1);
  });

  it("이메일 변경 후 발송에 실패하면 이전 주소의 인증 대기로 돌아가지 않는다", async () => {
    const requestCode = vi
      .fn<SignupOperations["requestCode"]>()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await setup({ requestCode });
    type("학교 이메일", "a@syuin.ac.kr");
    await click("인증번호 받기");
    await click("이메일 수정");
    type("학교 이메일", "b@syuin.ac.kr");
    expect(
      screen.queryByRole("button", { name: "받은 인증번호 입력하기" }),
    ).not.toBeInTheDocument();
    await act(async () => vi.advanceTimersByTime(60_000));
    await click("인증번호 받기");
    expect(requestCode).toHaveBeenLastCalledWith("b@syuin.ac.kr");
    expect(screen.getByRole("alert")).toHaveTextContent("네트워크");
    expect(screen.queryByLabelText("인증번호")).not.toBeInTheDocument();
    expect(screen.getByLabelText("학교 이메일")).toHaveValue("b@syuin.ac.kr");
    expect(screen.getByRole("group", { name: "학교 계정" })).toHaveTextContent(
      "미인증",
    );
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

  it("AC-AUTH-001-11: 틀린 인증번호는 입력칸 옆에 알리고 다시 입력하게 한다", async () => {
    await setup({
      verifyCode: vi.fn(async () => Promise.reject(new ApiError(400, ""))),
    });
    type("학교 이메일", "a@syuin.ac.kr");
    await click("인증번호 받기");
    type("인증번호", "000000");
    await click("확인");
    expect(screen.getByRole("alert")).toHaveTextContent("맞지 않아요");
    const input = screen.getByLabelText("인증번호");
    expect(input).toHaveFocus();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription(/맞지 않아요/);
    expect(screen.getByRole("group", { name: "학교 계정" })).toHaveTextContent(
      "인증 대기",
    );
    type("인증번호", "1");
    expect(input).not.toHaveAttribute("aria-invalid");
  });

  it.each([
    [299_999, "맞지 않아요"],
    [300_000, "만료됐어요"],
    [300_001, "만료됐어요"],
    [420_000, "만료됐어요"],
  ])("발송 후 %i ms의 인증 실패를 %s로 안내한다", async (elapsed, message) => {
    await setup({
      verifyCode: vi.fn(async () => Promise.reject(new ApiError(400, ""))),
    });
    type("학교 이메일", "a@syuin.ac.kr");
    await click("인증번호 받기");
    await act(async () => vi.advanceTimersByTime(elapsed));
    type("인증번호", "123456");
    await click("확인");
    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(screen.getByLabelText("인증번호")).toHaveAccessibleDescription(
      new RegExp(message),
    );
    expect(screen.getByLabelText("인증번호")).toHaveFocus();
  });

  it("서버가 만료로 응답하면 화면에서 5분이 지나지 않아도 만료로 안내한다", async () => {
    await setup({
      verifyCode: vi.fn(async () =>
        Promise.reject(
          new ApiError(
            400,
            JSON.stringify({ error: { code: "VERIFICATION_CODE_EXPIRED" } }),
          ),
        ),
      ),
    });
    await verifyEmail();
    expect(screen.getByRole("alert")).toHaveTextContent("만료됐어요");
    expect(screen.getByRole("alert")).not.toHaveTextContent("맞지 않아요");
  });

  it("재발송에 성공하면 새 번호의 발송 시각부터 5분을 계산한다", async () => {
    const operations = await setup({
      verifyCode: vi.fn(async () => Promise.reject(new ApiError(400, ""))),
    });
    type("학교 이메일", "a@syuin.ac.kr");
    await click("인증번호 받기");
    await act(async () => vi.advanceTimersByTime(420_000));
    await click("인증번호 다시 받기");
    expect(operations.requestCode).toHaveBeenCalledTimes(2);
    await act(async () => vi.advanceTimersByTime(299_999));
    type("인증번호", "123456");
    await click("확인");
    expect(screen.getByRole("alert")).toHaveTextContent("맞지 않아요");
    await act(async () => vi.advanceTimersByTime(1));
    await click("확인");
    expect(screen.getByRole("alert")).toHaveTextContent("만료됐어요");
  });

  it("5분이 지난 인증번호 실패는 만료로, 시도 초과는 새 번호 받기로 안내한다", async () => {
    const verifyCode = vi
      .fn<SignupOperations["verifyCode"]>()
      .mockRejectedValueOnce(new ApiError(400, ""))
      .mockRejectedValueOnce(new ApiError(429, ""));
    await setup({ verifyCode });
    type("학교 이메일", "a@syuin.ac.kr");
    await click("인증번호 받기");
    await act(async () => vi.advanceTimersByTime(300_000));
    type("인증번호", "123456");
    await click("확인");
    expect(screen.getByRole("alert")).toHaveTextContent("만료됐어요");
    type("인증번호", "123456");
    await click("확인");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "입력 실패가 많아 이 인증번호는 더 쓸 수 없어요",
    );
    expect(
      screen.getByRole("button", { name: "인증번호 다시 받기" }),
    ).toBeEnabled();
  });

  it("AC-AUTH-001-10: 인증 완료 후 계정 정보 단계로 넘어가 이름에 포커스한다", async () => {
    const operations = await setup();
    await verifyEmail();
    expect(operations.verifyCode).toHaveBeenCalledWith(
      "a@syuin.ac.kr",
      "123456",
    );
    expect(screen.getByLabelText("이름")).toHaveFocus();
    expect(screen.queryByLabelText("학교 이메일")).not.toBeInTheDocument();
    expect(screen.getByText("a@syuin.ac.kr")).toBeVisible();
    await click("이전");
    expect(screen.getByRole("group", { name: "학교 계정" })).toHaveTextContent(
      "인증 완료",
    );
    expect(
      screen.getByRole("button", { name: "다른 이메일로 변경" }),
    ).toHaveFocus();
    await click("다음");
    expect(screen.getByLabelText("이름")).toHaveFocus();
  });

  it("인증 후 이메일을 바꾸면 주소를 남긴 채 인증을 다시 시작한다", async () => {
    await setup();
    await verifyEmail();
    await click("이전");
    await click("다른 이메일로 변경");
    const input = screen.getByLabelText("학교 이메일");
    expect(input).not.toHaveAttribute("readonly");
    expect(input).toHaveValue("a@syuin.ac.kr");
    expect(screen.getByRole("group", { name: "학교 계정" })).toHaveTextContent(
      "미인증",
    );
    expect(currentStep()).toHaveTextContent("학교 이메일 인증");
  });

  it("필수 동의 전에는 가입할 수 없고 전체 동의로 모두 체크·해제한다", async () => {
    await setup();
    await verifyEmail();
    await fillAccount();
    const submit = screen.getByRole("button", { name: "회원가입" });
    expect(submit).toBeDisabled();
    expect(submit).toHaveAccessibleDescription("필수 약관에 동의해 주세요.");
    fireEvent.click(screen.getByLabelText("[필수] 이용약관 동의"));
    expect(submit).toBeDisabled();
    const all = screen.getByLabelText("전체 동의");
    expect(all).not.toBeChecked();
    expect(all).toHaveProperty("indeterminate", true);
    fireEvent.click(screen.getByLabelText("[필수] 개인정보 수집·이용 동의"));
    expect(all).toBeChecked();
    expect(submit).toBeEnabled();
    fireEvent.click(all);
    expect(screen.getByLabelText("[필수] 이용약관 동의")).not.toBeChecked();
    expect(
      screen.getByLabelText("[필수] 개인정보 수집·이용 동의"),
    ).not.toBeChecked();
    fireEvent.click(all);
    expect(screen.getByLabelText("[필수] 이용약관 동의")).toBeChecked();
    expect(submit).toBeEnabled();
  });

  it("빈 계정 정보로는 약관 단계로 넘어가지 않는다", async () => {
    const operations = await setup();
    await verifyEmail();
    await click("다음");
    expect(operations.register).not.toHaveBeenCalled();
    expect(currentStep()).toHaveTextContent("계정 정보");
    expect(screen.getByLabelText("이름")).toHaveFocus();
    expect(screen.getByLabelText("이름")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it.each([
    ["이름", "   ", "이름을 입력해 주세요.", "삼육 학생"],
    ["이름", "가".repeat(51), "이름은 50자 이하로 입력해 주세요.", "가"],
    ["학번", "   ", "학번을 입력해 주세요.", "0012345678"],
    ["학번", "0".repeat(21), "학번은 20자 이하로 입력해 주세요.", "0012345678"],
  ])(
    "잘못된 %s 입력은 요청 없이 안내하고 수정하면 오류를 지운다",
    async (label, invalid, message, valid) => {
      const operations = await setup();
      await verifyEmail();
      await fillAccount(
        label === "이름" ? { name: invalid } : { studentNo: invalid },
      );
      const field = screen.getByLabelText(label);
      expect(field).toHaveFocus();
      expect(field).toHaveAttribute("aria-invalid", "true");
      expect(field).toHaveAccessibleDescription(new RegExp(message));
      type(label, valid);
      expect(field).not.toHaveAttribute("aria-invalid");
      expect(screen.queryByText(message)).not.toBeInTheDocument();
      await click("다음");
      fireEvent.click(screen.getByLabelText("전체 동의"));
      await click("회원가입");
      expect(operations.register).toHaveBeenCalledTimes(1);
    },
  );

  it("AC-AUTH-001-21: 짧은 비밀번호는 요청 없이 해당 칸에서 안내하고 수정하면 지운다", async () => {
    const operations = await setup();
    await verifyEmail();
    await fillAccount({ password: "short" });
    expect(operations.register).not.toHaveBeenCalled();
    const password = screen.getByLabelText("비밀번호");
    expect(password).toHaveFocus();
    expect(password).toHaveAttribute("aria-invalid", "true");
    expect(password).toHaveAccessibleDescription(/15~128자로 입력해/);
    type("비밀번호", "a long enough password");
    expect(password).not.toHaveAttribute("aria-invalid");
  });

  it("비밀번호 확인이 다르면 안내한다", async () => {
    await setup();
    await verifyEmail();
    await fillAccount({ confirm: "different password!" });
    expect(screen.getByLabelText("비밀번호 확인")).toHaveFocus();
    expect(screen.getByText("비밀번호가 일치하지 않아요.")).toBeVisible();
  });

  it("AC-AUTH-004-05: 학번 앞자리 0과 원래 비밀번호를 보존하고 확정된 네 필드만 보낸다", async () => {
    const operations = await setup();
    await fillAll();
    await click("회원가입");
    expect(operations.register).toHaveBeenCalledWith({
      studentNo: "0012345678",
      name: "삼육 학생",
      schoolEmail: "a@syuin.ac.kr",
      password: " long password 15 ",
    });
    expect(
      Object.keys(vi.mocked(operations.register).mock.calls[0][0]).sort(),
    ).toEqual(["name", "password", "schoolEmail", "studentNo"]);
    expect(screen.getByRole("status")).toHaveTextContent("삼육 학생님");
    expect(
      screen.getByRole("heading", { name: "가입이 완료됐어요" }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "로그인하러 가기" }),
    ).toHaveAttribute("href", "/login");
  });

  it("AC-AUTH-001-22: 서버가 거절하면 원문 없이 안내하고 계정 정보에서 다시 시도할 수 있다", async () => {
    await setup({
      register: vi.fn(async () =>
        Promise.reject(new ApiError(400, "blocked: CompromisedPass15!")),
      ),
    });
    await fillAll();
    await click("회원가입");
    expect(screen.getByRole("alert")).toHaveTextContent("유출된 비밀번호");
    expect(screen.queryByText(/CompromisedPass/)).not.toBeInTheDocument();
    expect(currentStep()).toHaveTextContent("계정 정보");
    expect(screen.getByLabelText("비밀번호")).toHaveFocus();
    await click("다음");
    expect(screen.getByRole("button", { name: "회원가입" })).toBeEnabled();
  });

  it("인증이 만료되어 거절되면 주소를 남긴 채 인증을 다시 받게 한다", async () => {
    await setup({
      register: vi.fn(async () => Promise.reject(new ApiError(403, ""))),
    });
    await fillAll();
    await click("회원가입");
    expect(screen.getByRole("alert")).toHaveTextContent("다시 받아");
    expect(currentStep()).toHaveTextContent("학교 이메일 인증");
    expect(screen.getByRole("group", { name: "학교 계정" })).toHaveTextContent(
      "미인증",
    );
    expect(screen.getByLabelText("학교 이메일")).toHaveValue("a@syuin.ac.kr");
    expect(screen.getByLabelText("학교 이메일")).toHaveFocus();
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
    await verifyEmail();
    await fillAccount();
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
