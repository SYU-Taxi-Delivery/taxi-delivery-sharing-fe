"use client";

import Link from "next/link";
import { useState } from "react";
import { ForgotPasswordScreen } from "@/features/auth/ForgotPasswordScreen";
import { ResetPasswordScreen } from "@/features/auth/ResetPasswordScreen";
import type { PasswordResetOperations } from "@/features/auth/passwordReset";
import { ApiError } from "@/lib/api";
import { DevTools } from "@/features/demo/DevTools";

const commonScenarios = [
  ["success", "성공"],
  ["mailFailed", "메일 발송 실패"],
  ["error", "네트워크 오류"],
] as const;

export function PasswordResetPreview({
  mode,
  next,
}: {
  mode: "request" | "reset";
  next?: string;
}) {
  const [scenario, setScenario] = useState("success");
  const pause = () =>
    new Promise<void>((resolve) => window.setTimeout(resolve, 400));
  const failIfNeeded = () => {
    if (scenario === "error") throw new Error("preview network failure");
    const errors: Record<string, [number, string]> = {
      expired: [400, "VERIFICATION_CODE_EXPIRED"],
      passwordRejected: [400, "INVALID_PASSWORD"],
      mailFailed: [503, "MAIL_DELIVERY_FAILED"],
    };
    const configured = errors[scenario];
    if (configured)
      throw new ApiError(
        configured[0],
        JSON.stringify({ error: { code: configured[1] } }),
      );
  };
  const operations: PasswordResetOperations = {
    requestCode: async () => {
      await pause();
      failIfNeeded();
    },
    resetPassword: async () => {
      await pause();
      failIfNeeded();
    },
  };

  return (
    <>
      <DevTools>
        <aside className="grid gap-2 text-sm">
          <p>비밀번호 복구 데모 · 예시 이메일과 비밀번호로 진행해 주세요.</p>
          <nav aria-label="비밀번호 재설정 미리보기" className="flex gap-4">
            <Link href="/password-reset-preview" className="underline">
              인증번호 요청 화면
            </Link>
            <Link
              href="/password-reset-preview?mode=reset"
              className="underline"
            >
              새 비밀번호 화면
            </Link>
          </nav>
          <label>
            상황{" "}
            <select
              value={scenario}
              onChange={(event) => setScenario(event.target.value)}
            >
              {commonScenarios.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
              {mode === "reset" && (
                <>
                  <option value="expired">만료된 인증번호</option>
                  <option value="passwordRejected">비밀번호 거절</option>
                </>
              )}
            </select>
          </label>
        </aside>
      </DevTools>
      {mode === "request" ? (
        <ForgotPasswordScreen
          key={scenario}
          operations={operations}
          next={next}
        />
      ) : (
        <ResetPasswordScreen
          key={scenario}
          next={next}
          operations={operations}
        />
      )}
    </>
  );
}
