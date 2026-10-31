"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api";
import { AccountMenu } from "@/features/auth/AccountMenu";
import type { AuthOperations, CurrentUser } from "@/features/auth/auth";
import { AuthProvider, useAuth } from "@/features/auth/AuthProvider";
import { LoginScreen } from "@/features/auth/LoginScreen";
import { RequireAuth } from "@/features/auth/RequireAuth";

const PASSWORD = "preview-password";
const accounts: Record<string, CurrentUser | "unverified"> = {
  "student@syuin.ac.kr": { id: "1", displayName: "김삼육", role: "STUDENT" },
  "admin@syuin.ac.kr": { id: "2", displayName: "운영자", role: "ADMIN" },
  "unverified@syuin.ac.kr": "unverified",
};

const pause = () =>
  new Promise<void>((resolve) => window.setTimeout(resolve, 500));

function PreviewBody({
  failLogout,
  setFailLogout,
}: {
  failLogout: boolean;
  setFailLogout: (value: boolean) => void;
}) {
  const auth = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (auth.status === "authenticated") router.replace("/posts-preview");
  }, [auth.status, router]);

  if (auth.status !== "authenticated") {
    return <LoginScreen next="/posts-preview" />;
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-2xl font-bold">로그인 상태 미리보기</h1>
        <AccountMenu afterLogout="/auth-preview" />
      </div>
      <div className="mt-6 flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={failLogout}
            onChange={(event) => setFailLogout(event.target.checked)}
          />
          로그아웃 서버 요청 실패
        </label>
        <button
          type="button"
          className="underline"
          onClick={auth.handleUnauthorized}
        >
          보호 API 401(세션 만료) 응답
        </button>
      </div>
      <h2 className="mt-8 mb-3 font-bold">로그인 사용자 화면</h2>
      <RequireAuth>
        <p>로그인한 사용자만 보는 내용이에요.</p>
      </RequireAuth>
      <h2 className="mt-8 mb-3 font-bold">관리자 전용 화면</h2>
      <RequireAuth role="ADMIN">
        <p>관리자만 보는 내용이에요.</p>
      </RequireAuth>
    </main>
  );
}

export function AuthPreview() {
  const session = useRef<CurrentUser | null>(null);
  const [failLogout, setFailLogout] = useState(false);

  const operations = useMemo<AuthOperations>(
    () => ({
      me: async () => session.current,
      login: async ({ email, password }) => {
        await pause();
        const account = accounts[email.toLowerCase()];
        if (!account || password !== PASSWORD) throw new ApiError(401, "");
        if (account === "unverified") throw new ApiError(403, "");
        session.current = account;
      },
      logout: async () => {
        await pause();
        if (failLogout) throw new TypeError("Failed to fetch");
        session.current = null;
      },
    }),
    [failLogout],
  );

  return (
    <AuthProvider operations={operations}>
      <p className="bg-yellow-100 px-4 py-2 text-xs">
        로그인 데모 · student@syuin.ac.kr / admin@syuin.ac.kr /
        unverified@syuin.ac.kr, 비밀번호 {PASSWORD} · 새로고침하면 초기화돼요.
      </p>
      <PreviewBody failLogout={failLogout} setFailLogout={setFailLogout} />
    </AuthProvider>
  );
}
