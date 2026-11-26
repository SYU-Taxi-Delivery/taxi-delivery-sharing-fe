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

/**
 * The backend has no current-user endpoint yet, so the login response is kept
 * in this browser and every me() confirms the session with an authenticated
 * read. Only id, display name and role are stored, never credentials.
 */
export const USER_KEY = "syu-session-user";
let fallbackUser: unknown;
let fallbackStored: string | null | undefined;

function rememberedUser(): unknown {
  try {
    const stored = window.localStorage.getItem(USER_KEY);
    if (fallbackUser !== undefined && fallbackStored === undefined) {
      // Recovery cannot establish whether storage changed while reads failed.
      fallbackUser = null;
      fallbackStored = stored;
    }
    if (fallbackUser !== undefined && stored === fallbackStored) {
      return fallbackUser;
    }
    // A later storage change or clear takes precedence over the page fallback.
    fallbackUser = undefined;
    return JSON.parse(stored ?? "null");
  } catch {
    return fallbackUser ?? null;
  }
}

function remember(user: unknown) {
  let stored: string | null | undefined;
  try {
    stored = window.localStorage.getItem(USER_KEY);
    if (user === null) window.localStorage.removeItem(USER_KEY);
    else window.localStorage.setItem(USER_KEY, JSON.stringify(user));
    fallbackUser = undefined;
  } catch {
    // Keep the latest identity (or sign-out) over an unchanged stale value.
    fallbackUser = user;
    fallbackStored = stored;
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
 * School email and password reset endpoints answer success with a plain
 * sentence (or a bare id), not a data envelope. Only the 2xx status counts;
 * a failure still arrives as ApiError with the usual `{ error: { code } }`.
 */
export async function sendAuthRequest(
  path: string,
  body: Record<string, string>,
): Promise<void> {
  try {
    await backendSend("POST", path, body);
  } catch (error) {
    // apiFetch reads every 2xx body as JSON; a sentence body fails that parse
    // only after the status was already ok.
    if (error instanceof SyntaxError) return;
    throw error;
  }
}

/** POST /api/auth/school-email/{send-code, verify-code, register}. */
export const signupOperations: SignupOperations = {
  requestCode: (schoolEmail) =>
    sendAuthRequest("/api/auth/school-email/send-code", { schoolEmail }),
  verifyCode: (schoolEmail, code) =>
    sendAuthRequest("/api/auth/school-email/verify-code", {
      schoolEmail,
      code,
    }),
  // No automatic login after signup: the screen sends the user to /login.
  register: ({ studentNo, name, schoolEmail, password }) =>
    sendAuthRequest("/api/auth/school-email/register", {
      studentNo,
      name,
      schoolEmail,
      password,
    }),
};
