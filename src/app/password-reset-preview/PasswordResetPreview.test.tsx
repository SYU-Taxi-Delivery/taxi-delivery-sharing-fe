import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PasswordResetOperations } from "@/features/auth/passwordReset";
import { PasswordResetPreview } from "./PasswordResetPreview";
import PasswordResetPreviewPage from "./page";

const { renderScreen, notFound } = vi.hoisted(() => ({
  renderScreen: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("preview not found");
  }),
}));
vi.mock("next/navigation", () => ({ notFound }));
vi.mock("@/features/auth/ForgotPasswordScreen", () => ({
  ForgotPasswordScreen: (props: unknown) => {
    renderScreen(props);
    return <input aria-label="테스트 이메일 초안" defaultValue="" />;
  },
}));

beforeEach(() => {
  vi.useFakeTimers();
  renderScreen.mockClear();
  notFound.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const props = () =>
  renderScreen.mock.lastCall?.[0] as {
    operations: PasswordResetOperations;
    next?: string;
  };
const choose = (value: string) =>
  fireEvent.change(screen.getByRole("combobox", { name: "상황" }), {
    target: { value },
  });
const request = {
  email: "a@syuin.ac.kr",
  code: "123456",
  password: "pass 1234",
};

async function finish(promise: Promise<void>) {
  await Promise.all([promise, vi.advanceTimersByTimeAsync(400)]);
}

describe("PasswordResetPreview", () => {
  it("실제 메일 발송 없이 서버 응답별 상황을 재현한다", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    render(<PasswordResetPreview />);
    expect(screen.getByText(/비밀번호 복구 데모/)).toBeVisible();
    await expect(
      finish(props().operations.requestCode(request.email)),
    ).resolves.toBeUndefined();
    await expect(
      finish(props().operations.confirm(request)),
    ).resolves.toBeUndefined();

    for (const [scenario, status, code] of [
      ["mismatch", 400, "VERIFICATION_CODE_MISMATCH"],
      ["expired", 400, "VERIFICATION_CODE_EXPIRED"],
      ["attempts", 429, "VERIFICATION_ATTEMPTS_EXCEEDED"],
      ["password", 400, "INVALID_PASSWORD"],
    ] as const) {
      choose(scenario);
      // Code and password refusals come on confirm, not when sending.
      await expect(
        finish(props().operations.requestCode(request.email)),
      ).resolves.toBeUndefined();
      await expect(
        finish(props().operations.confirm(request)),
      ).rejects.toMatchObject({
        status,
        body: JSON.stringify({ error: { code } }),
      });
    }

    choose("mail");
    await expect(
      finish(props().operations.requestCode(request.email)),
    ).rejects.toMatchObject({ status: 503 });
    choose("error");
    await expect(finish(props().operations.confirm(request))).rejects.toThrow(
      "preview network failure",
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("상황을 바꾸면 이전 폼 초안을 초기화한다", () => {
    render(<PasswordResetPreview />);
    const label = "테스트 이메일 초안";
    fireEvent.change(screen.getByLabelText(label), {
      target: { value: "previous draft" },
    });
    choose("mismatch");
    expect(screen.getByLabelText(label)).toHaveValue("");
  });

  it("운영 환경에서도 열리고 안전한 복귀 경로만 넘긴다", async () => {
    for (const environment of ["test", "production"] as const) {
      vi.stubEnv("NODE_ENV", environment);
      const page = await PasswordResetPreviewPage({
        searchParams: Promise.resolve({ next: "/my" }),
      });
      expect(page.props.next).toBe("/my");
    }
    const unsafe = await PasswordResetPreviewPage({
      searchParams: Promise.resolve({ next: "https://evil.example" }),
    });
    expect(unsafe.props.next).not.toContain("evil");
    expect(notFound).not.toHaveBeenCalled();
  });
});
