import type { AuthOperations } from "./auth";
import type { SignupOperations } from "./signup";

export class AuthNotConnectedError extends Error {
  constructor() {
    super("로그인 연동이 아직 준비되지 않았습니다.");
    this.name = "AuthNotConnectedError";
  }
}

const notConnected = async (): Promise<never> => {
  throw new AuthNotConnectedError();
};

/**
 * Placeholder until the login/me/logout contract is agreed in #18.
 * Replace with an apiFetch-based adapter; do not guess URIs here.
 */
export const authOperations: AuthOperations = {
  me: notConnected,
  login: notConnected,
  logout: notConnected,
};

/** Placeholder until the sign-up and verification contract is agreed in #18. */
export const signupOperations: SignupOperations = {
  requestCode: notConnected,
  verifyCode: notConnected,
  register: notConnected,
};
