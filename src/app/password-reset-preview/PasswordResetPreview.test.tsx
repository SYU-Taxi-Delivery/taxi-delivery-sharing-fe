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
    token?: string;
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
  it("실제 메일 발송 없이 요청 성공·제한·네트워크 실패를 재현한다", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    render(<PasswordResetPreview mode="request" />);
    expect(
      screen.getByText(/실제 메일 발송이나 비밀번호 변경은 없어요/),
    ).toBeVisible();
    await expect(
      finish(requestProps().operations.requestLink("a@syuin.ac.kr")),
    ).resolves.toBeUndefined();
    choose("rateLimited");
    await expect(
      finish(requestProps().operations.requestLink("a@syuin.ac.kr")),
    ).rejects.toMatchObject({ kind: "rateLimited" });
    choose("error");
    await expect(
      finish(requestProps().operations.requestLink("a@syuin.ac.kr")),
    ).rejects.toThrow("preview network failure");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("모의 토큰으로 변경 성공·만료 링크·비밀번호 거절을 재현한다", async () => {
    render(<PasswordResetPreview mode="reset" />);
    expect(resetProps().token).toBe("preview-only-token");
    const request = {
      token: resetProps().token!,
      password: "new password 123",
    };
    await expect(
      finish(resetProps().operations.resetPassword(request)),
    ).resolves.toBeUndefined();
    for (const kind of ["invalidLink", "passwordRejected"] as const) {
      choose(kind);
      await expect(
        finish(resetProps().operations.resetPassword(request)),
      ).rejects.toMatchObject({ kind });
    }
    choose("missing");
    expect(resetProps().token).toBeUndefined();
    choose("success");
    expect(resetProps().token).toBe("preview-only-token");
  });

  it.each([
    ["request", "테스트 이메일 초안"],
    ["reset", "테스트 비밀번호 초안"],
  ] as const)("%s 상황 변경 시 이전 폼 초안을 초기화한다", (mode, label) => {
    render(<PasswordResetPreview mode={mode} />);
    fireEvent.change(screen.getByLabelText(label), {
      target: { value: "previous draft" },
    });
    choose("rateLimited");
    expect(screen.getByLabelText(label)).toHaveValue("");
    fireEvent.change(screen.getByLabelText(label), {
      target: { value: "failed draft" },
    });
    choose("success");
    expect(screen.getByLabelText(label)).toHaveValue("");
  });

  it("개발 환경에서만 요청·변경 화면을 선택하며 그 외 환경은 404다", async () => {
    for (const environment of ["test", "production"] as const) {
      vi.stubEnv("NODE_ENV", environment);
      await expect(
        PasswordResetPreviewPage({ searchParams: Promise.resolve({}) }),
      ).rejects.toThrow("preview not found");
    }
    expect(notFound).toHaveBeenCalledTimes(2);
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
