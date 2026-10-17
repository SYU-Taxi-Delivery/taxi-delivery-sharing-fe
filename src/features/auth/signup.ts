import { SCHOOL_EMAIL_DOMAIN } from "./auth";

export type SignupRequest = {
  email: string;
  displayName: string;
  password: string;
};

// UI callbacks; the URI, DTO and how verification is tied to sign-up belong to #18.
export type SignupOperations = {
  /** Sends a 6-digit code. Same answer whether or not the email is registered. */
  requestCode: (email: string) => Promise<void>;
  /** Confirms the code for this email. Resolve only on success. */
  verifyCode: (email: string, code: string) => Promise<void>;
  /** Creates the account for the verified email. Never sends a role. */
  register: (request: SignupRequest) => Promise<void>;
};

export const PASSWORD_MIN = 15;
export const PASSWORD_MAX = 128;
export const DISPLAY_NAME_MIN = 2;
export const DISPLAY_NAME_MAX = 20;
export const RESEND_INTERVAL_MS = 60_000;

const codePoints = (value: string) => Array.from(value).length;

/** Nicknames keep inner spaces; only the ends are trimmed after NFC. */
export function normalizeDisplayName(value: string): string {
  return value.normalize("NFC").trim();
}

export function displayNameError(value: string): string | null {
  const length = codePoints(normalizeDisplayName(value));
  if (length === 0) return "닉네임을 입력해 주세요.";
  if (length < DISPLAY_NAME_MIN || length > DISPLAY_NAME_MAX) {
    return `닉네임은 ${DISPLAY_NAME_MIN}~${DISPLAY_NAME_MAX}자로 입력해 주세요.`;
  }
  return null;
}

/** Length is counted in code points after NFC; the password is never trimmed. */
export function passwordError(value: string): string | null {
  if (value === "") return "비밀번호를 입력해 주세요.";
  const length = codePoints(value.normalize("NFC"));
  if (length < PASSWORD_MIN || length > PASSWORD_MAX) {
    return `비밀번호는 ${PASSWORD_MIN}~${PASSWORD_MAX}자로 입력해 주세요.`;
  }
  return null;
}

export function passwordConfirmError(
  password: string,
  confirm: string,
): string | null {
  if (confirm === "") return "비밀번호를 한 번 더 입력해 주세요.";
  return password === confirm ? null : "비밀번호가 일치하지 않아요.";
}

export function codeError(code: string): string | null {
  return /^\d{6}$/.test(code) ? null : "인증번호 6자리 숫자를 입력해 주세요.";
}

function statusOf(error: unknown) {
  return typeof error === "object" && error !== null && "status" in error
    ? (error as { status: unknown }).status
    : undefined;
}

function notConnected(error: unknown) {
  return error instanceof Error && error.name === "AuthNotConnectedError";
}

const connectionMessage =
  "회원가입 연동을 준비하고 있어요. 잠시 후 다시 이용해 주세요.";
const networkMessage =
  "요청하지 못했어요. 네트워크를 확인한 후 다시 시도해 주세요.";

export function requestCodeErrorMessage(error: unknown): string {
  if (notConnected(error)) return connectionMessage;
  switch (statusOf(error)) {
    case 400:
      return `삼육대학교 이메일(@${SCHOOL_EMAIL_DOMAIN})을 확인해 주세요.`;
    case 429:
      return "인증번호는 1분에 한 번 받을 수 있어요. 잠시 후 다시 요청해 주세요.";
    default:
      return networkMessage;
  }
}

export function verifyCodeErrorMessage(error: unknown): string {
  if (notConnected(error)) return connectionMessage;
  switch (statusOf(error)) {
    case 400:
      return "인증번호가 맞지 않거나 만료됐어요. 다시 확인하거나 새 인증번호를 받아 주세요.";
    case 429:
      return "인증번호 입력 실패가 많아 이 번호를 더 쓸 수 없어요. 새 인증번호를 받아 주세요.";
    default:
      return networkMessage;
  }
}

export function registerErrorMessage(error: unknown): string {
  if (notConnected(error)) return connectionMessage;
  switch (statusOf(error)) {
    case 400:
      return "입력한 정보를 확인해 주세요. 흔히 쓰이거나 유출된 비밀번호는 사용할 수 없어요.";
    case 401:
    case 403:
      return "학교 이메일 인증이 만료됐어요. 인증번호를 다시 받아 주세요.";
    case 409:
      return "가입을 완료하지 못했어요. 이미 가입했다면 로그인해 주세요.";
    case 429:
      return "요청이 많아 잠시 제한됐어요. 잠시 후 다시 시도해 주세요.";
    default:
      return networkMessage;
  }
}
