import type { Metadata } from "next";
import { safeNextPath } from "@/features/auth/auth";
import { LoginScreen } from "@/features/auth/LoginScreen";

export const metadata: Metadata = { title: "로그인 | 두유팟" };

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
