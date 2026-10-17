"use client";

import { useRef } from "react";
import { ApiError } from "@/lib/api";
import { SignupScreen } from "@/features/auth/SignupScreen";

const CODE = "123456";
const BLOCKED = "compromised-password";

const pause = () =>
  new Promise<void>((resolve) => window.setTimeout(resolve, 500));

export function SignupPreview() {
  const sentTo = useRef<string | null>(null);

  return (
    <>
      <p className="bg-yellow-100 px-4 py-2 text-xs">
        개발 전용 모의 화면 · 인증번호 {CODE} · 비밀번호 {BLOCKED}는 차단
        목록으로 거절돼요 · 새로고침하면 초기화돼요.
      </p>
      <SignupScreen
        operations={{
          requestCode: async (email) => {
            await pause();
            sentTo.current = email;
          },
          verifyCode: async (email, code) => {
            await pause();
            if (email !== sentTo.current || code !== CODE) {
              throw new ApiError(400, "");
            }
          },
          register: async ({ password }) => {
            await pause();
            if (password === BLOCKED) throw new ApiError(400, "");
          },
        }}
      />
    </>
  );
}
