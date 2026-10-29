import type { Metadata } from "next";
import { ForgotPasswordScreen } from "@/features/auth/ForgotPasswordScreen";

export const metadata: Metadata = {
  title: "비밀번호 재설정 | SYU 택시·배달 공유",
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return <ForgotPasswordScreen />;
}
