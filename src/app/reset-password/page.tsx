import type { Metadata } from "next";
import { ForgotPasswordScreen } from "@/features/auth/ForgotPasswordScreen";

export const metadata: Metadata = {
  title: "비밀번호 재설정 | 두유팟",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/**
 * The backend resets with an emailed code, not a link token. This older
 * address still opens the same code-based reset screen.
 */
export default function ResetPasswordPage() {
  return <ForgotPasswordScreen />;
}
