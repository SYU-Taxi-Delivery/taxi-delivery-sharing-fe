"use client";

import Link from "next/link";
import { useState } from "react";
import { ForgotPasswordScreen } from "@/features/auth/ForgotPasswordScreen";
import { ResetPasswordScreen } from "@/features/auth/ResetPasswordScreen";
import {
  PasswordResetError,
  type PasswordResetOperations,
} from "@/features/auth/passwordReset";

const commonScenarios = [
  ["success", "성공"],
  ["rateLimited", "요청 제한"],
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
    if (
      scenario === "invalidLink" ||
      scenario === "passwordRejected" ||
      scenario === "rateLimited"
    ) {
      throw new PasswordResetError(scenario);
    }
  };
  const operations: PasswordResetOperations = {
    requestLink: async () => {
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
      <aside className="grid gap-2 bg-yellow-100 px-4 py-2 text-sm">
        <p>비밀번호 복구 데모 · 예시 이메일과 비밀번호로 진행해 주세요.</p>
        <nav aria-label="비밀번호 재설정 미리보기" className="flex gap-4">
          <Link href="/password-reset-preview" className="underline">
            링크 요청 화면
          </Link>
          <Link href="/password-reset-preview?mode=reset" className="underline">
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
                <option value="invalidLink">만료·사용된 링크</option>
                <option value="passwordRejected">비밀번호 거절</option>
                <option value="missing">링크 토큰 없음</option>
              </>
            )}
          </select>
        </label>
      </aside>
      {mode === "request" ? (
        <ForgotPasswordScreen
          key={scenario}
          operations={operations}
          next={next}
        />
      ) : (
        <ResetPasswordScreen
          key={scenario}
          token={scenario === "missing" ? undefined : "preview-only-token"}
          operations={operations}
        />
      )}
    </>
  );
}
