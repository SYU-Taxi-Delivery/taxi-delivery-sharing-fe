"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, type ReactNode } from "react";
import { AuthProvider } from "@/features/auth/AuthProvider";
import type { AuthOperations } from "@/features/auth/auth";
import { demoPath, previewPages } from "./demoPaths";

const livePath = (href: string) => href;
const AppPathContext = createContext<(href: string) => string>(livePath);
export const useAppPath = () => useContext(AppPathContext);

const demoAuth: AuthOperations = {
  me: async () => null,
  login: async () => {},
  logout: async () => {},
};

export function AppProviders({ children }: { children: ReactNode }) {
  const preview = previewPages.includes(usePathname());
  return (
    <AppPathContext.Provider value={preview ? demoPath : livePath}>
      <AuthProvider
        key={preview ? "demo" : "live"}
        operations={preview ? demoAuth : undefined}
      >
        {preview && (
          <aside
            className="border-b border-lime-200 bg-lime-50 px-4 py-3 text-sm text-neutral-800"
            aria-label="데모 안내"
          >
            <div className="mx-auto grid max-w-5xl gap-2">
              <p>
                데모를 둘러보고 있어요. 예시 데이터로 동작하며 실제 계정과
                모집글에 반영되지 않아요.
              </p>
              <nav
                className="flex flex-wrap gap-x-4 gap-y-2 font-bold"
                aria-label="데모 메뉴"
              >
                <Link href="/posts-preview">모집글</Link>
                <Link href="/my-preview">내 참여 · 모집</Link>
                <Link href="/auth-preview">로그인</Link>
                <Link href="/signup-preview">회원가입</Link>
                <Link href="/">실제 서비스로 돌아가기</Link>
              </nav>
            </div>
          </aside>
        )}
        {children}
      </AuthProvider>
    </AppPathContext.Provider>
  );
}
