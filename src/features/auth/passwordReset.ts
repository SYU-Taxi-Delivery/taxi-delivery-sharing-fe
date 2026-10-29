// UI callbacks only; the backend contract and token validation are not connected.
export type PasswordResetOperations = {
  requestLink: (email: string) => Promise<void>;
  resetPassword: (request: {
    token: string;
    password: string;
  }) => Promise<void>;
};

export class PasswordResetError extends Error {
  constructor(
    readonly kind:
      "notConnected" | "invalidLink" | "passwordRejected" | "rateLimited",
  ) {
    super(kind);
    this.name = "PasswordResetError";
  }
}

const notConnected = async (): Promise<never> => {
  throw new PasswordResetError("notConnected");
};

export const passwordResetOperations: PasswordResetOperations = {
  requestLink: notConnected,
  resetPassword: notConnected,
};

export function passwordResetErrorMessage(error: unknown): string {
  if (error instanceof PasswordResetError) {
    switch (error.kind) {
      case "notConnected":
        return "비밀번호 재설정 연동을 준비하고 있어요. 잠시 후 다시 이용해 주세요.";
      case "invalidLink":
        return "재설정 링크가 올바르지 않거나 만료됐어요. 새 링크를 요청해 주세요.";
      case "passwordRejected":
        return "이 비밀번호는 사용할 수 없어요. 다른 비밀번호를 입력해 주세요.";
      case "rateLimited":
        return "요청이 많아 잠시 제한됐어요. 잠시 후 다시 시도해 주세요.";
    }
  }
  return "요청을 완료했는지 확인하지 못했어요. 네트워크를 확인하고 다시 시도해 주세요.";
}
