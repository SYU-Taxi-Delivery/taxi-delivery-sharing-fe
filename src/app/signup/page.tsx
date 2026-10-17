import type { Metadata } from "next";
import { SignupScreen } from "@/features/auth/SignupScreen";

export const metadata: Metadata = { title: "회원가입 | SYU 택시·배달 공유" };

export default function SignupPage() {
  return <SignupScreen />;
}
