"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AuthProvider } from "@/features/auth/AuthProvider";
import type { AuthOperations } from "@/features/auth/auth";
import { demoPath, previewPages } from "./demoPaths";
import { DevToolsSlotProvider } from "./DevTools";
import styles from "./demo.module.css";

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
  const [slotElement, setSlotElement] = useState<HTMLElement | null>(null);
  const slot = useMemo(() => ({ element: slotElement }), [slotElement]);
  const body = (
    <AuthProvider
      key={preview ? "demo" : "live"}
      operations={preview ? demoAuth : undefined}
    >
      {preview && (
        <aside className={styles.devDock} aria-label="데모 안내">
          <details className={styles.devPanel}>
            <summary className={styles.devBadge}>
              <span className={styles.devTag}>데모</span>
              예시 데이터로 보는 화면
              <span className={styles.devToggle}>데모 도구</span>
            </summary>
            <div className={styles.devBody}>
              <p>
                실제 계정과 모집글에 반영되지 않아요. 아래에서 화면 상황을 바꿔
                볼 수 있어요.
              </p>
              <nav className={styles.devLinks} aria-label="데모 메뉴">
                <Link href="/posts-preview">모집글</Link>
                <Link href="/my-preview">내 참여 · 모집</Link>
                <Link href="/auth-preview">로그인</Link>
                <Link href="/signup-preview">회원가입</Link>
                <Link href="/">실제 서비스로 돌아가기</Link>
              </nav>
              <div ref={setSlotElement} />
            </div>
          </details>
        </aside>
      )}
      {children}
    </AuthProvider>
  );
  return (
    <AppPathContext.Provider value={preview ? demoPath : livePath}>
      {preview ? (
        <DevToolsSlotProvider value={slot}>{body}</DevToolsSlotProvider>
      ) : (
        body
      )}
    </AppPathContext.Provider>
  );
}
