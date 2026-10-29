import type { Metadata } from "next";
import { ResetPasswordScreen } from "@/features/auth/ResetPasswordScreen";

export const metadata: Metadata = {
  title: "새 비밀번호 설정 | SYU 택시·배달 공유",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await searchParams;
  return (
    <ResetPasswordScreen
      token={typeof token === "string" ? token : undefined}
    />
  );
}
