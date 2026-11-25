// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import { fakeBackend } from "@/test/fakeBackend";
import {
  passwordResetErrorMessage,
  passwordResetOperations,
} from "./passwordReset";

describe("재설정 통신", () => {
  it("발송과 변경에서 CSRF와 계약 필드를 전송하고 일반 문자열 성공 응답을 받는다", async () => {
    const { calls } = fakeBackend({
      "POST /api/auth/password-reset/send-code": () => new Response("안내"),
      "POST /api/auth/password-reset/confirm": () => new Response("변경 완료"),
    });
    const schoolEmail = "a@syu.ac.kr";
    const request = {
      schoolEmail,
      code: "012345",
      newPassword: "  password-e\u0301  ",
    };
    await passwordResetOperations.requestCode(schoolEmail);
    await passwordResetOperations.resetPassword(request);
    expect(calls.slice(1).map((c) => c.body)).toEqual([
      { schoolEmail },
      request,
    ]);
    for (const call of calls.slice(1))
      expect(call.headers.get("X-XSRF-TOKEN")).toBe("csrf-token");
  });
  it.each([
    ["VERIFICATION_CODE_MISMATCH", "맞지"],
    ["VERIFICATION_CODE_EXPIRED", "만료"],
    ["VERIFICATION_ATTEMPTS_EXCEEDED", "초과"],
    ["MAIL_DELIVERY_FAILED", "메일"],
    ["INVALID_PASSWORD", "조건"],
    ["INVALID_SCHOOL_EMAIL", "학교 이메일"],
  ])("%s 오류를 사용자에게 안내한다", (code, copy) => {
    expect(
      passwordResetErrorMessage(
        new ApiError(400, JSON.stringify({ error: { code } })),
      ),
    ).toContain(copy);
  });
  it("알 수 없는 오류 원문은 숨긴다", () => {
    expect(passwordResetErrorMessage(new Error("SQL stack trace"))).not.toMatch(
      /SQL|stack/i,
    );
  });
});
