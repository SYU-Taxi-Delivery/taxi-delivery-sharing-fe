import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppProviders } from "@/features/demo/AppProviders";
import "./globals.css";

export const metadata: Metadata = {
  title: "SYU 택시·배달 공유",
  description: "삼육대학교 택시·배달 공유 서비스",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
