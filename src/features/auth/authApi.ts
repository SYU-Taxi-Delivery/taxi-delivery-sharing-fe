import { ApiError, apiFetch } from "@/lib/api";
import {
  InvalidBackendResponse,
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

export const SESSION_CHANGE_KEY = "syu-session-change";
export const SESSION_SIGNED_OUT = "signed-out";
const LOGOUT_PENDING = "logout-pending";

function signalSessionChange(signal?: string) {
  try {
    window.localStorage.setItem(
      SESSION_CHANGE_KEY,
      signal ?? crypto.randomUUID(),
    );
  } catch {
    // With storage disabled, other tabs still recheck on focus.
  }
}

/** Login and GET /api/users/me return the same unwrapped user DTO. */
function toSessionUser(value: unknown) {
  const { userId, name, role } = (value ?? {}) as Record<string, unknown>;
  if (
    typeof userId !== "string" ||
    !userId.trim() ||
    typeof name !== "string" ||
    !name.trim() ||
    (role !== "ADMIN" && role !== "STUDENT")
  ) {
    throw new InvalidBackendResponse();
  }
  return { id: userId, displayName: name, role };
}

export const authOperations: AuthOperations = {
  isLogoutPending: () => {
    try {
      return window.localStorage.getItem(SESSION_CHANGE_KEY) === LOGOUT_PENDING;
    } catch {
      return false;
    }
  },
  me: async () => {
    try {
      // Remove identity cached by older clients. The session cookie is authoritative.
      window.localStorage.removeItem("syu-session-user");
    } catch {
      // Reading the session works without local storage.
    }
    try {
      return toSessionUser(await apiFetch("/api/users/me"));
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null;
      throw error;
    }
  },
  login: async ({ email, password }) => {
    // The backend accepts a student number or school email as the identifier.
    const response = await backendSend("POST", "/api/auth/local/login", {
      identifier: email.trim(),
      password,
    });
    // Login rotates the session and its CSRF token.
    resetCsrfToken();
    toSessionUser(response);
    signalSessionChange();
  },
  logout: async () => {
    try {
      // Spring Security answers 302; the redirect itself is not followed.
      await backendSend("POST", "/logout", undefined, { redirect: "manual" });
    } catch (error) {
      if (!(error instanceof ApiError && [0, 401].includes(error.status))) {
        signalSessionChange(LOGOUT_PENDING);
        throw error;
      }
    } finally {
      resetCsrfToken();
    }
    signalSessionChange(SESSION_SIGNED_OUT);
  },
};

/** Verification issues a single-use token; registration returns a numeric ID. */
export const signupOperations: SignupOperations = {
  requestCode: async (email) => {
    await backendSend(
      "POST",
      "/api/auth/school-email/send-code",
      {
        schoolEmail: email.trim().toLowerCase(),
      },
      { responseType: "text" },
    );
  },
  verifyCode: async (email, code) => {
    const response = await backendSend(
      "POST",
      "/api/auth/school-email/verify-code",
      {
        schoolEmail: email.trim().toLowerCase(),
        code,
      },
    );
    if (
      typeof response !== "object" ||
      response === null ||
      !("verificationToken" in response) ||
      typeof response.verificationToken !== "string" ||
      !response.verificationToken.trim()
    ) {
      throw new InvalidBackendResponse();
    }
    return response.verificationToken;
  },
  register: async ({
    studentNo,
    name,
    schoolEmail,
    password,
    verificationToken,
  }) => {
    const userId = await backendSend(
      "POST",
      "/api/auth/school-email/register",
      {
        studentNo: studentNo.trim(),
        name: name.trim(),
        schoolEmail: schoolEmail.trim().toLowerCase(),
        password,
        verificationToken,
      },
    );
    if (
      typeof userId !== "number" ||
      !Number.isSafeInteger(userId) ||
      userId <= 0
    ) {
      throw new InvalidBackendResponse();
    }
  },
};
