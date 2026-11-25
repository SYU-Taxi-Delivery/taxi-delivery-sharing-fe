import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PasswordResetOperations } from "@/features/auth/passwordReset";
import { PasswordResetPreview } from "./PasswordResetPreview";
import PasswordResetPreviewPage from "./page";

const { renderRequest, renderReset, notFound } = vi.hoisted(() => ({
  renderRequest: vi.fn(),
  renderReset: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("preview not found");
  }),
}));
vi.mock("next/navigation", () => ({ notFound }));
vi.mock("@/features/auth/ForgotPasswordScreen", () => ({
  ForgotPasswordScreen: (props: unknown) => {
    renderRequest(props);
    return <input aria-label="테스트 이메일 초안" defaultValue="" />;
  },
}));
vi.mock("@/features/auth/ResetPasswordScreen", () => ({
  ResetPasswordScreen: (props: unknown) => {
    renderReset(props);
    return <input aria-label="테스트 비밀번호 초안" defaultValue="" />;
  },
}));

beforeEach(() => {
  vi.useFakeTimers();
  renderRequest.mockClear();
  renderReset.mockClear();
  notFound.mockClear();
});
afterEach(() => vi.useRealTimers());

const requestProps = () =>
  renderRequest.mock.lastCall?.[0] as { operations: PasswordResetOperations };
const resetProps = () =>
  renderReset.mock.lastCall?.[0] as {
    operations: PasswordResetOperations;
  };
const choose = (value: string) =>
  fireEvent.change(screen.getByRole("combobox", { name: "상황" }), {
    target: { value },
  });

async function finish(promise: Promise<void>) {
  await Promise.all([promise, vi.advanceTimersByTimeAsync(400)]);
}

describe("PasswordResetPreview", () => {
  it("실제 메일 발송 없이 요청 성공·메일 실패·네트워크 실패를 재현한다", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    render(<PasswordResetPreview mode="request" />);
    expect(screen.getByText(/비밀번호 복구 데모/)).toBeVisible();
    await expect(
      finish(requestProps().operations.requestCode("a@syuin.ac.kr")),
    ).resolves.toBeUndefined();
    choose("mailFailed");
    await expect(
      finish(requestProps().operations.requestCode("a@syuin.ac.kr")),
    ).rejects.toMatchObject({ status: 503 });
    choose("error");
    await expect(
      finish(requestProps().operations.requestCode("a@syuin.ac.kr")),
    ).rejects.toThrow("preview network failure");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("모의 인증번호로 변경 성공·만료 코드·비밀번호 거절을 재현한다", async () => {
    render(<PasswordResetPreview mode="reset" />);
    const request = {
      schoolEmail: "demo@syu.ac.kr",
      code: "123456",
      newPassword: "new password 123",
    };
    await expect(
      finish(resetProps().operations.resetPassword(request)),
    ).resolves.toBeUndefined();
    for (const kind of ["expired", "passwordRejected"] as const) {
      choose(kind);
      await expect(
        finish(resetProps().operations.resetPassword(request)),
      ).rejects.toMatchObject({ status: 400 });
    }
  });

  it.each([
    ["request", "테스트 이메일 초안"],
    ["reset", "테스트 비밀번호 초안"],
  ] as const)("%s 상황 변경 시 이전 폼 초안을 초기화한다", (mode, label) => {
    render(<PasswordResetPreview mode={mode} />);
    fireEvent.change(screen.getByLabelText(label), {
      target: { value: "previous draft" },
    });
    choose("mailFailed");
    expect(screen.getByLabelText(label)).toHaveValue("");
    fireEvent.change(screen.getByLabelText(label), {
      target: { value: "failed draft" },
    });
    choose("success");
    expect(screen.getByLabelText(label)).toHaveValue("");
  });

  it("운영 환경에서도 요청·변경 화면을 선택할 수 있다", async () => {
    for (const environment of ["test", "production"] as const) {
      vi.stubEnv("NODE_ENV", environment);
      const page = await PasswordResetPreviewPage({
        searchParams: Promise.resolve({}),
      });
      expect(page.props.mode).toBe("request");
    }
    expect(notFound).not.toHaveBeenCalled();
    vi.stubEnv("NODE_ENV", "development");
    const reset = await PasswordResetPreviewPage({
      searchParams: Promise.resolve({ mode: "reset" }),
    });
    expect(reset.props.mode).toBe("reset");
    const request = await PasswordResetPreviewPage({
      searchParams: Promise.resolve({ mode: ["reset", "request"] }),
    });
    expect(request.props.mode).toBe("request");
  });
});
