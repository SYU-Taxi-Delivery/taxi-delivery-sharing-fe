import { ApiError } from "@/lib/api";
import {
  InvalidBackendResponse,
  backendGet,
  backendSend,
  resetCsrfToken,
} from "@/lib/backend";
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
 * The backend has no current-user endpoint yet, so the login response is kept
 * in this browser and every me() confirms the session with an authenticated
 * read. Only id, display name and role are stored, never credentials.
 */
const USER_KEY = "syu-session-user";

function rememberedUser(): unknown {
  try {
    return JSON.parse(window.localStorage.getItem(USER_KEY) ?? "null");
  } catch {
    return null;
  }
}

function remember(user: unknown) {
  try {
    if (user === null) window.localStorage.removeItem(USER_KEY);
    else window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    // Storage may be blocked; the session then lasts for this page only.
  }
}

/** POST /api/auth/local/login answers `{ userId, name, role }` without an envelope. */
function toSessionUser(value: unknown) {
  const { userId, name, role } = (value ?? {}) as Record<string, unknown>;
  if (typeof userId !== "string" || typeof name !== "string") {
    throw new InvalidBackendResponse();
  }
  return { id: userId, displayName: name, role };
}

export const authOperations: AuthOperations = {
  me: async () => {
    const user = rememberedUser();
    if (!user) return null;
    try {
      await backendGet("/api/users/me/participations?page=0&size=1");
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        remember(null);
        return null;
      }
      throw error;
    }
    return user;
  },
  login: async ({ email, password }) => {
    // The backend accepts a student number or school email as the identifier.
    const response = await backendSend("POST", "/api/auth/local/login", {
      identifier: email.trim(),
      password,
    });
    // Login rotates the session and its CSRF token.
    resetCsrfToken();
    remember(toSessionUser(response));
  },
  logout: async () => {
    try {
      // Spring Security answers 302; the redirect itself is not followed.
      await backendSend("POST", "/logout", undefined, { redirect: "manual" });
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 0)) throw error;
    } finally {
      remember(null);
      resetCsrfToken();
    }
  },
};

/**
 * Not connected: the backend sign-up takes @syu.ac.kr addresses and a student
 * number, which differs from the screen (@syuin.ac.kr, nickname). See
 * docs/backend-integration.md.
 */
export const signupOperations: SignupOperations = {
  requestCode: notConnected,
  verifyCode: notConnected,
  register: notConnected,
};
