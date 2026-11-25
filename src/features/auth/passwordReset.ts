import { backendSend, errorCode } from "@/lib/backend";

export type PasswordResetOperations = {
  requestCode: (schoolEmail: string) => Promise<void>;
  resetPassword: (request: {
    schoolEmail: string;
    code: string;
    newPassword: string;
  }) => Promise<void>;
};

export const passwordResetOperations: PasswordResetOperations = {
  async requestCode(schoolEmail) {
    await backendSend(
      "POST",
      "/api/auth/password-reset/send-code",
      { schoolEmail },
      { responseType: "text" },
    );
  },
  async resetPassword(request) {
    await backendSend("POST", "/api/auth/password-reset/confirm", request, {
      responseType: "text",
    });
  },
};

export function passwordResetErrorMessage(error: unknown): string {
  switch (errorCode(error)) {
    case "INVALID_SCHOOL_EMAIL":
      return "학교 이메일 주소를 확인해 주세요.";
    case "VERIFICATION_CODE_MISMATCH":
      return "인증번호가 맞지 않아요. 메일의 6자리 숫자를 확인해 주세요.";
    case "VERIFICATION_CODE_EXPIRED":
      return "인증번호가 만료됐어요. 새 번호를 요청해 주세요.";
    case "VERIFICATION_ATTEMPTS_EXCEEDED":
      return "인증번호 입력 횟수를 초과했어요. 새 번호를 요청해 주세요.";
    case "INVALID_PASSWORD":
      return "비밀번호 조건을 확인하고 다시 입력해 주세요.";
    case "MAIL_DELIVERY_FAILED":
      return "인증 메일을 보내지 못했어요. 잠시 후 다시 요청해 주세요.";
    default:
      return "요청 결과를 확인하지 못했어요. 다시 시도하기 전에 메일함이나 로그인 상태를 확인해 주세요.";
  }
}
