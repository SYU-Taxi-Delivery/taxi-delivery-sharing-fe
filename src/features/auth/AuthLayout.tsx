import Image from "next/image";
import { Noto_Sans_KR } from "next/font/google";
import type { ReactNode } from "react";
import styles from "./auth.module.css";

const notoSansKr = Noto_Sans_KR({
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

/** Header, centered card column and footer shared by the login and sign-up designs. */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`${styles.screen} ${notoSansKr.className}`}>
      <header className={styles.header}>
        <p className={styles.brand}>
          <Image src="/auth/logo.svg" width={24} height={24} alt="" />
          두유팟
        </p>
        <p className={styles.tagline}>삼육대학교 재학생 커뮤니티</p>
      </header>
      <main className={styles.main}>
        {children}
        <p className={styles.caption}>
          삼육대학교 재학생 커뮤니티
          <br />
          학교 공식 서비스와 별도 운영
        </p>
      </main>
      <footer className={styles.footer}>
        <p>두유팟 · 학생끼리 함께하는 이동과 배달</p>
        <p>학생 운영 커뮤니티 · 학교 공식 서비스 아님</p>
      </footer>
    </div>
  );
}
