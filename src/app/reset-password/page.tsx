import type { Metadata } from "next";
import { ResetPasswordScreen } from "@/features/auth/ResetPasswordScreen";
import { safeNextPath } from "@/features/auth/auth";

export const metadata: Metadata = {
  title: "새 비밀번호 설정 | 두유팟",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { next } = await searchParams;
  return (
    <ResetPasswordScreen
      next={safeNextPath(Array.isArray(next) ? next[0] : next)}
    />
  );
}
