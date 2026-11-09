"use client";

import { useRef } from "react";
import { ApiError } from "@/lib/api";
import { SignupScreen } from "@/features/auth/SignupScreen";
import { DevTools } from "@/features/demo/DevTools";

const CODE = "123456";
const BLOCKED = "compromised-password";

const pause = () =>
  new Promise<void>((resolve) => window.setTimeout(resolve, 500));

export function SignupPreview() {
  const sentTo = useRef<string | null>(null);

  return (
    <>
      <DevTools>
        <p className="text-xs">
          회원가입 데모: 인증번호는 {CODE}, 비밀번호 {BLOCKED}는 차단 목록으로
          거절돼요.
          <br />
          새로고침하면 초기화돼요.
        </p>
      </DevTools>
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
