"use client";

import { ResetPasswordScreen } from "./ResetPasswordScreen";
import type { PasswordResetOperations } from "./passwordReset";

export function ForgotPasswordScreen(props: {
  operations?: PasswordResetOperations;
  next?: string;
}) {
  return <ResetPasswordScreen {...props} requestFirst />;
}
