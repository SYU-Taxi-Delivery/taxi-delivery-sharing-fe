"use client";

import { useState } from "react";
import { ForgotPasswordScreen } from "@/features/auth/ForgotPasswordScreen";
import type { PasswordResetOperations } from "@/features/auth/passwordReset";
import { DevTools } from "@/features/demo/DevTools";
import { ApiError } from "@/lib/api";

/** Answers the demo can play, as the backend would send them. */
const scenarios = [
  ["success", "성공", null],
  ["mismatch", "인증번호 불일치", [400, "VERIFICATION_CODE_MISMATCH"]],
  ["expired", "인증번호 만료", [400, "VERIFICATION_CODE_EXPIRED"]],
  ["attempts", "입력 횟수 초과", [429, "VERIFICATION_ATTEMPTS_EXCEEDED"]],
  ["password", "비밀번호 거절", [400, "INVALID_PASSWORD"]],
  ["mail", "메일 발송 실패", [503, "MAIL_DELIVERY_FAILED"]],
  ["error", "네트워크 오류", null],
] as const;

type Scenario = (typeof scenarios)[number][0];

export function PasswordResetPreview({ next }: { next?: string }) {
  const [scenario, setScenario] = useState<Scenario>("success");
  const pause = () =>
    new Promise<void>((resolve) => window.setTimeout(resolve, 400));
  const answer = (step: "request" | "confirm") => {
    if (scenario === "error") throw new Error("preview network failure");
    const reply = scenarios.find(([value]) => value === scenario)?.[2];
    if (!reply) return;
    // Mail failures happen when sending; code and password ones on confirm.
    if ((reply[1] === "MAIL_DELIVERY_FAILED") !== (step === "request")) return;
    throw new ApiError(reply[0], JSON.stringify({ error: { code: reply[1] } }));
  };
  const operations: PasswordResetOperations = {
    requestCode: async () => {
      await pause();
      answer("request");
    },
    confirm: async () => {
      await pause();
      answer("confirm");
    },
  };

  return (
    <>
      <DevTools>
        <aside className="grid gap-2 text-sm">
          <p>
            비밀번호 복구 데모 · 예시 이메일, 아무 6자리 숫자, 예시 비밀번호로
            진행해 주세요.
          </p>
          <label>
            상황{" "}
            <select
              value={scenario}
              onChange={(event) => setScenario(event.target.value as Scenario)}
            >
              {scenarios.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </aside>
      </DevTools>
      <ForgotPasswordScreen
        key={scenario}
        operations={operations}
        next={next}
      />
    </>
  );
}
