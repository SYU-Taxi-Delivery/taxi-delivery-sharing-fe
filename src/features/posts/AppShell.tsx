"use client";

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { AccountMenu } from "@/features/auth/AccountMenu";
import styles from "./posts.module.css";
import { useAppPath } from "@/features/demo/AppProviders";
import { BoardIcon, PersonIcon } from "@/features/ui/art";
import { useTypingFlag } from "./useTypingFlag";

/*
 * Signed-in service frame: logo, account menu, main navigation and footer.
 * The logo + name goes to the posts list, the same place as the 모집글 tab.
 * The one main nav sits in the header on wide screens and becomes the phone's
 * bottom bar. A page's main action (participation button, form submit row,
 * marked data-bottom-action) stacks on top of that bar in the same bottom
 * area; posts.module.css sizes both and pads the page by their real height.
 * While a text field has focus (data-typing) that area steps aside so the
 * phone keyboard never sits on top of a field or a button.
 */
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
  const typing = useTypingFlag();
  return (
    <div className={styles.screen} data-typing={typing || undefined}>
      <header className={styles.frameHeader}>
        <div className={styles.header}>
          <Link href={path(postsPath)} className={styles.brand}>
            <Image src="/auth/logo.svg" width={32} height={32} alt="" />
            두유팟
          </Link>
          <nav className={styles.nav} aria-label="주요 메뉴">
            <Link
              href={path(postsPath)}
              className={styles.navLink}
              aria-current={current === "posts" ? "page" : undefined}
            >
              <BoardIcon className={styles.navIcon} />
              모집글
            </Link>
            <Link
              href={path("/my")}
              className={styles.navLink}
              aria-current={current === "my" ? "page" : undefined}
            >
              <PersonIcon className={styles.navIcon} />내 참여 · 모집
            </Link>
          </nav>
          <AccountMenu />
        </div>
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
