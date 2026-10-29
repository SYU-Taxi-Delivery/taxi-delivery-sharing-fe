// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  PasswordResetError,
  passwordResetErrorMessage,
  passwordResetOperations,
} from "./passwordReset";

describe("passwordResetOperations", () => {
  it("API 미연동 상태에서는 발송·변경 성공을 가장하거나 네트워크 요청을 보내지 않는다", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(
      passwordResetOperations.requestLink("a@syuin.ac.kr"),
    ).rejects.toMatchObject({ kind: "notConnected" });
    await expect(
      passwordResetOperations.resetPassword({
        token: "opaque-token",
        password: "new password 123",
      }),
    ).rejects.toMatchObject({ kind: "notConnected" });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("passwordResetErrorMessage", () => {
  it.each([
    ["notConnected", "준비"],
    ["invalidLink", "링크"],
    ["passwordRejected", "비밀번호"],
    ["rateLimited", "잠시"],
  ] as const)("%s 상태를 사용자 안내로 바꾼다", (kind, message) => {
    expect(passwordResetErrorMessage(new PasswordResetError(kind))).toContain(
      message,
    );
  });

  it("알 수 없는 오류 원문이나 토큰을 사용자에게 노출하지 않는다", () => {
    const message = passwordResetErrorMessage(
      new Error("SQL stack trace token=secret-token"),
    );
    expect(message).not.toMatch(/SQL|stack|secret-token/);
    expect(message).toContain("다시");
  });
});
