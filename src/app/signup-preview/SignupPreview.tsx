"use client";

import { useRef } from "react";
import { ApiError } from "@/lib/api";
import { SignupScreen } from "@/features/auth/SignupScreen";
import { DevTools } from "@/features/demo/DevTools";

const CODE = "123456";
const REJECTED = "server-reject-demo";

const pause = () =>
  new Promise<void>((resolve) => window.setTimeout(resolve, 500));

export function SignupPreview() {
  const sentTo = useRef<string | null>(null);

  return (
    <>
      <DevTools>
        <p className="text-xs">
          회원가입 데모: 인증번호는 {CODE}, 비밀번호 {REJECTED}로 서버의 입력
          거절 안내를 확인할 수 있어요.
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
            return "signup-preview-token";
          },
          register: async ({ password }) => {
            await pause();
            if (password === REJECTED) throw new ApiError(400, "");
          },
        }}
      />
    </>
  );
}
