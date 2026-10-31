"use client";

import Image from "next/image";
import Link from "next/link";
import { Noto_Sans_KR } from "next/font/google";
import type { ReactNode } from "react";
import { AccountMenu } from "@/features/auth/AccountMenu";
import styles from "./posts.module.css";
import { useAppPath } from "@/features/demo/AppProviders";

const notoSansKr = Noto_Sans_KR({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

/** Signed-in service frame: logo, account menu, main navigation and footer. */
export function AppShell({
  current,
  postsPath = "/posts",
  wide = false,
  children,
}: {
  current: "posts" | "my" | "admin";
  postsPath?: string;
  wide?: boolean;
  children: ReactNode;
}) {
  const path = useAppPath();
  return (
    <div className={`${styles.screen} ${notoSansKr.className}`}>
      <header className={styles.frameHeader}>
        <div className={styles.header}>
          <p className={styles.brand}>
            <Image src="/auth/logo.svg" width={32} height={32} alt="" />
            두유팟
          </p>
          <AccountMenu />
        </div>
        <nav className={styles.nav} aria-label="주요 메뉴">
          <Link
            href={path(postsPath)}
            className={styles.navLink}
            aria-current={current === "posts" ? "page" : undefined}
          >
            모집글
          </Link>
          <Link
            href={path("/my")}
            className={styles.navLink}
            aria-current={current === "my" ? "page" : undefined}
          >
            내 참여 · 모집
          </Link>
        </nav>
      </header>
      <main className={`${styles.main} ${wide ? styles.mainWide : ""}`}>
        {children}
      </main>
      <footer className={styles.footer}>
        <p>두유팟 · 학생끼리 함께하는 이동과 배달</p>
        <p>학생 운영 커뮤니티 · 학교 공식 서비스 아님</p>
      </footer>
    </div>
  );
}
