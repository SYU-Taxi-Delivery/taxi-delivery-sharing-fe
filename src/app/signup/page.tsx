import type { Metadata } from "next";
import { SignupScreen } from "@/features/auth/SignupScreen";

export const metadata: Metadata = { title: "회원가입 | 두유팟" };

export default function SignupPage() {
  return <SignupScreen />;
}
