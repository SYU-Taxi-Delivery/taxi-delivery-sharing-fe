import type { Metadata } from "next";
import { ForgotPasswordScreen } from "@/features/auth/ForgotPasswordScreen";
import { safeNextPath } from "@/features/auth/auth";

export const metadata: Metadata = {
  title: "비밀번호 재설정 | SYU 택시·배달 공유",
  robots: { index: false, follow: false },
};

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { next } = await searchParams;
  return (
    <ForgotPasswordScreen
      next={safeNextPath(Array.isArray(next) ? next[0] : next)}
    />
  );
}
