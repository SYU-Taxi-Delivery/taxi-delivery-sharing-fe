import { ApiError } from "@/lib/api";
import { errorCode } from "@/lib/backend";
import { SCHOOL_EMAIL_DOMAIN } from "./auth";
import { sendAuthRequest } from "./authApi";
import { PASSWORD_MAX, PASSWORD_MIN } from "./signup";

/**
 * Backend password reset (taxi-delivery-sharing docs/running.md):
 * POST /api/auth/password-reset/send-code `{ schoolEmail }`, then
 * POST /api/auth/password-reset/confirm `{ schoolEmail, code, newPassword }`.
 * The code step answers the same whether or not the account exists, and a
 * repeat within 60 seconds sends nothing new while still answering 200.
 */
export type PasswordResetOperations = {
  requestCode: (email: string) => Promise<void>;
  confirm: (request: {
    email: string;
    code: string;
    password: string;
  }) => Promise<void>;
};

export const passwordResetOperations: PasswordResetOperations = {
  requestCode: (schoolEmail) =>
    sendAuthRequest("/api/auth/password-reset/send-code", { schoolEmail }),
  confirm: ({ email, code, password }) =>
    sendAuthRequest("/api/auth/password-reset/confirm", {
      schoolEmail: email,
      code,
      newPassword: password,
    }),
};

export type PasswordResetFailure = {
  message: string;
  /** The field the message is about; the screen focuses it. */
  field: "email" | "code" | "password" | null;
  /** The code can no longer be used: the user needs a new one. */
  newCode: boolean;
};

const failure = (
  message: string,
  field: PasswordResetFailure["field"] = null,
  newCode = false,
): PasswordResetFailure => ({ message, field, newCode });

/** Turns a send-code or confirm failure into what the screen shows. */
export function passwordResetFailure(error: unknown): PasswordResetFailure {
  if (!(error instanceof ApiError)) {
    return failure(
      "요청을 완료했는지 확인하지 못했어요. 네트워크를 확인하고 다시 시도해 주세요.",
    );
  }
  const code = errorCode(error);
  switch (code) {
    case "INVALID_SCHOOL_EMAIL":
      return failure(
        `삼육대학교 이메일(@${SCHOOL_EMAIL_DOMAIN})을 확인해 주세요.`,
        "email",
      );
    case "VERIFICATION_CODE_MISMATCH":
      return failure(
        "인증번호가 맞지 않아요. 가장 최근에 받은 메일의 6자리 숫자를 확인해 주세요.",
        "code",
      );
    case "VERIFICATION_CODE_EXPIRED":
      return failure(
        "인증번호가 만료됐거나 발급되지 않았어요. '인증번호 다시 받기'로 새 번호를 받아 주세요.",
        "code",
        true,
      );
    case "VERIFICATION_ATTEMPTS_EXCEEDED":
      return failure(
        "입력 실패가 많아 이 인증번호는 더 쓸 수 없어요. '인증번호 다시 받기'로 새 번호를 받아 주세요.",
        "code",
        true,
      );
    case "INVALID_PASSWORD":
      return failure(
        `비밀번호는 ${PASSWORD_MIN}~${PASSWORD_MAX}자로 입력해 주세요. 한글이 많으면 더 짧아야 해요.`,
        "password",
      );
  }
  if (error.status === 400) return failure("입력한 내용을 확인해 주세요.");
  if (error.status === 429) {
    return failure("요청이 많아 잠시 제한됐어요. 잠시 후 다시 시도해 주세요.");
  }
  if (error.status === 503) {
    return failure("메일을 보내지 못했어요. 잠시 후 다시 시도해 주세요.");
  }
  return failure(
    "요청을 완료했는지 확인하지 못했어요. 네트워크를 확인하고 다시 시도해 주세요.",
  );
}
