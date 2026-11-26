import { errorCode } from "@/lib/backend";
import { SCHOOL_EMAIL_DOMAIN } from "./auth";

export type SignupRequest = {
  studentNo: string;
  name: string;
  schoolEmail: string;
  password: string;
};

// UI callbacks; the real ones (authApi.ts) call /api/auth/school-email/*.
export type SignupOperations = {
  /** Sends a 6-digit code. An already registered email is refused (409). */
  requestCode: (email: string) => Promise<void>;
  /** Confirms the code for this email. Resolve only on success. */
  verifyCode: (email: string, code: string) => Promise<void>;
  /** Creates the account for the verified email. Never sends a role. */
  register: (request: SignupRequest) => Promise<void>;
};

/** Backend PasswordPolicy: 8~64 UTF-16 units, at most 72 UTF-8 bytes (bcrypt). */
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 64;
export const PASSWORD_MAX_BYTES = 72;
export const NAME_MAX = 50;
export const STUDENT_NO_MAX = 20;
export const RESEND_INTERVAL_MS = 60_000;
/** Matches the backend EmailVerificationStore.CODE_TTL. */
export const CODE_TTL_MS = 5 * 60_000;

/** Names keep inner spaces; only the ends are trimmed after NFC. */
export function normalizeName(value: string): string {
  return value.normalize("NFC").trim();
}

export function nameError(value: string): string | null {
  const length = normalizeName(value).length;
  if (length === 0) return "이름을 입력해 주세요.";
  if (length > NAME_MAX) {
    return `이름은 ${NAME_MAX}자 이하로 입력해 주세요.`;
  }
  return null;
}

export function studentNoError(value: string): string | null {
  const length = value.trim().length;
  if (length === 0) return "학번을 입력해 주세요.";
  if (length > STUDENT_NO_MAX) {
    return `학번은 ${STUDENT_NO_MAX}자 이하로 입력해 주세요.`;
  }
  return null;
}

/**
 * Same rule as the backend PasswordPolicy, on the text as typed (sent as is,
 * never trimmed or normalized): 8~64 UTF-16 units, not only spaces, and at
 * most 72 UTF-8 bytes, since bcrypt reads no further.
 */
export function passwordError(value: string): string | null {
  if (value === "") return "비밀번호를 입력해 주세요.";
  if (value.trim() === "") return "공백만으로는 비밀번호를 만들 수 없어요.";
  if (value.length < PASSWORD_MIN || value.length > PASSWORD_MAX) {
    return `비밀번호는 ${PASSWORD_MIN}~${PASSWORD_MAX}자로 입력해 주세요.`;
  }
  if (new TextEncoder().encode(value).length > PASSWORD_MAX_BYTES) {
    return "비밀번호가 너무 길어요. 한글은 영문보다 길게 계산돼요. 조금 줄여 주세요.";
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

const unavailableMessage =
  "인증 메일을 보내지 못했어요. 잠시 후 다시 시도해 주세요.";

export function requestCodeErrorMessage(error: unknown): string {
  if (notConnected(error)) return connectionMessage;
  switch (statusOf(error)) {
    case 400:
      return `삼육대학교 이메일(@${SCHOOL_EMAIL_DOMAIN})을 확인해 주세요.`;
    case 409:
      return "이미 가입된 학교 이메일이에요. 로그인하거나 비밀번호를 재설정해 주세요.";
    case 429:
      return "인증번호는 1분에 한 번 받을 수 있어요. 잠시 후 다시 요청해 주세요.";
    case 503:
      return unavailableMessage;
    default:
      return networkMessage;
  }
}

/**
 * The server reason takes precedence over the client's elapsed-time estimate.
 */
export function verifyCodeErrorMessage(
  error: unknown,
  { expired }: { expired?: boolean } = {},
): string {
  if (notConnected(error)) return connectionMessage;
  switch (statusOf(error)) {
    case 400: {
      const code = errorCode(error);
      if (code === "VERIFICATION_CODE_EXPIRED") expired = true;
      else if (code === "VERIFICATION_CODE_MISMATCH") expired = false;
      if (expired === true)
        return "인증번호가 만료됐어요. '인증번호 다시 받기'로 새 번호를 받아 주세요.";
      if (expired === false)
        return "인증번호가 맞지 않아요. 가장 최근에 받은 메일의 6자리 숫자를 확인해 주세요.";
      return "인증번호가 맞지 않거나 만료됐어요. 다시 확인하거나 새 인증번호를 받아 주세요.";
    }
    case 429:
      return "입력 실패가 많아 이 인증번호는 더 쓸 수 없어요. '인증번호 다시 받기'로 새 번호를 받아 주세요.";
    default:
      return networkMessage;
  }
}

export function registerErrorMessage(error: unknown): string {
  if (notConnected(error)) return connectionMessage;
  const code = errorCode(error);
  switch (statusOf(error)) {
    case 400:
      return code === "INVALID_PASSWORD"
        ? `비밀번호는 ${PASSWORD_MIN}~${PASSWORD_MAX}자로 입력해 주세요. 한글이 많으면 더 짧아야 해요.`
        : "입력한 정보를 확인해 주세요.";
    case 401:
    case 403:
      return "학교 이메일 인증이 만료됐어요. 인증번호를 다시 받아 주세요.";
    case 409:
      return code === "STUDENT_NO_ALREADY_REGISTERED"
        ? "이미 등록된 학번이에요. 학번을 확인하거나, 가입했다면 로그인해 주세요."
        : "이미 가입된 계정이에요. 로그인해 주세요.";
    case 429:
    case 503:
      return "요청이 많아 잠시 제한됐어요. 잠시 후 다시 시도해 주세요.";
    default:
      return networkMessage;
  }
}
