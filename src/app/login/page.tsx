import type { Metadata } from "next";
import { safeNextPath } from "@/features/auth/auth";
import { LoginScreen } from "@/features/auth/LoginScreen";

export const metadata: Metadata = { title: "로그인 | SYU 택시·배달 공유" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { next } = await searchParams;
  return (
    <LoginScreen next={safeNextPath(Array.isArray(next) ? next[0] : next)} />
  );
}
