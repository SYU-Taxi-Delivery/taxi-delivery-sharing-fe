export type UserRole = "STUDENT" | "ADMIN";

/** Minimum user data shown on screen (AUTH-003). Not a server DTO. */
export type CurrentUser = {
  id: string;
  displayName: string;
  role: UserRole;
};

export type AuthStatus =
  "checking" | "authenticated" | "anonymous" | "expired" | "unavailable";

export type LoginCredentials = { email: string; password: string };

// UI callbacks; the URI, DTO and session transport belong to the API adapter (#18).
export type AuthOperations = {
  /** Current user, or null when the server reports no valid session (401). */
  me: () => Promise<unknown>;
  /** School email login. Resolve only when the server issued a session. */
  login: (credentials: LoginCredentials) => Promise<void>;
  /** Ends the server session. Resolve for success or an already-ended session. */
  logout: () => Promise<void>;
};

export const SCHOOL_EMAIL_DOMAIN = "syuin.ac.kr";

export type LoginFieldErrors = { email?: string; password?: string };

export function schoolEmailError(email: string): string | null {
  const address = email.trim();
  const at = address.lastIndexOf("@");
  if (address === "") return "학교 이메일을 입력해 주세요.";
  if (
    at < 1 ||
    /\s/.test(address) ||
    address.slice(at + 1).toLowerCase() !== SCHOOL_EMAIL_DOMAIN
  ) {
    return `삼육대학교 이메일(@${SCHOOL_EMAIL_DOMAIN})을 입력해 주세요.`;
  }
  return null;
}

/** Client-side hints only; the server decides. The password is never trimmed. */
export function validateLogin({
  email,
  password,
}: LoginCredentials): LoginFieldErrors {
  const errors: LoginFieldErrors = {};
  const emailError = schoolEmailError(email);
  if (emailError) errors.email = emailError;
  if (password === "") errors.password = "비밀번호를 입력해 주세요.";
  return errors;
}

/** Maps a login failure to a safe message; server bodies are never shown. */
export function loginErrorMessage(error: unknown): string {
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? (error as { status: unknown }).status
      : undefined;
  if (error instanceof Error && error.name === "AuthNotConnectedError") {
    return "로그인 연동을 준비하고 있어요. 잠시 후 다시 이용해 주세요.";
  }
  switch (status) {
    case 400:
    case 401:
      // Same message for unknown accounts and wrong passwords (AC-AUTH-001-14, -16).
      return "학교 이메일 또는 비밀번호를 확인한 후 다시 입력해 주세요.";
    case 403:
      return "학교 이메일 인증이 필요해요. 가입할 때 받은 인증번호로 인증을 완료해 주세요.";
    case 429:
      return "로그인 시도가 많아 잠시 제한됐어요. 잠시 후 다시 시도해 주세요.";
    default:
      return "로그인하지 못했어요. 네트워크를 확인한 후 다시 시도해 주세요.";
  }
}

export const roleLabels: Record<UserRole, string> = {
  STUDENT: "학생",
  ADMIN: "관리자",
};

/** Keeps only id/displayName/role and rejects anything else. */
export function toCurrentUser(value: unknown): CurrentUser | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object") {
    throw new Error("사용자 정보를 확인할 수 없습니다.");
  }
  const { id, displayName, role } = value as Record<string, unknown>;
  const validId =
    (typeof id === "string" && id.trim() !== "") ||
    (typeof id === "number" && Number.isSafeInteger(id) && id > 0);
  if (
    !validId ||
    typeof displayName !== "string" ||
    displayName.trim() === "" ||
    (role !== "STUDENT" && role !== "ADMIN")
  ) {
    throw new Error("사용자 정보를 확인할 수 없습니다.");
  }
  return { id: String(id), displayName: displayName.trim(), role };
}

/** Same-origin path to return to after login; anything else falls back to "/". */
export function safeNextPath(value: unknown): string {
  if (typeof value !== "string" || value.length > 2048) return "/";
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    return "/";
  }
  const url = new URL(value, "https://same-origin.invalid");
  if (url.origin !== "https://same-origin.invalid") return "/";
  if (url.pathname === "/login" || url.pathname.startsWith("/login/")) {
    return "/";
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

export function loginHref(next: string): string {
  const path = safeNextPath(next);
  return path === "/" ? "/login" : `/login?next=${encodeURIComponent(path)}`;
}
