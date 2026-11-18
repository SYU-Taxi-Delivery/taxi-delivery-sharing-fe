// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import { AuthNotConnectedError } from "./authApi";
import {
  codeError,
  nameError,
  normalizeName,
  passwordConfirmError,
  passwordError,
  registerErrorMessage,
  requestCodeErrorMessage,
  studentNoError,
  verifyCodeErrorMessage,
} from "./signup";

describe("passwordError", () => {
  it("원문 8·64 UTF-16 길이 경계와 양끝 공백을 허용한다", () => {
    expect(passwordError("a".repeat(8))).toBeNull();
    expect(passwordError("a".repeat(64))).toBeNull();
    expect(passwordError(` ${"a".repeat(6)} `)).toBeNull();
  });

  it("7·65 UTF-16 길이를 거절한다", () => {
    expect(passwordError("a".repeat(7))).toContain("8~64자");
    expect(passwordError("a".repeat(65))).toContain("8~64자");
  });

  it("UTF-16 길이를 세고 NFC 정규화를 하지 않는다", () => {
    expect(passwordError("😀".repeat(4))).toBeNull();
    expect(passwordError("😀".repeat(3))).not.toBeNull();
    expect(passwordError("e\u0301".repeat(4))).toBeNull();
    expect(passwordError("é".repeat(4))).not.toBeNull();
  });

  it("한글·이모지도 UTF-8 72바이트 경계를 적용한다", () => {
    expect(passwordError("가".repeat(24))).toBeNull();
    expect(passwordError("가".repeat(25))).toContain("72바이트");
    expect(passwordError("😀".repeat(18))).toBeNull();
    expect(passwordError("😀".repeat(19))).toContain("72바이트");
  });

  it.each(["", " ".repeat(8), "\u3000".repeat(8), "\t\n\r      "])(
    "빈 값과 Java 기준 공백만 있는 비밀번호를 거절한다",
    (value) => {
      expect(passwordError(value)).toContain("비밀번호를 입력");
    },
  );

  it("Java에서 공백으로 세지 않는 non-breaking space는 원문대로 허용한다", () => {
    expect(passwordError("\u00a0".repeat(8))).toBeNull();
  });

  it("확인 값은 정규화 없이 그대로 비교한다", () => {
    expect(passwordConfirmError("abc ", "abc ")).toBeNull();
    expect(passwordConfirmError("abc ", "abc")).toBe(
      "비밀번호가 일치하지 않아요.",
    );
    expect(passwordConfirmError("abc", "")).toContain("한 번 더");
  });
});

describe("name", () => {
  it("NFC 후 양끝 공백만 정리하고 내부 공백은 유지한다", () => {
    expect(normalizeName("  삼육 학생 ")).toBe("삼육 학생");
    expect(normalizeName("é")).toBe("é");
  });

  it.each([
    ["", "이름을 입력해 주세요."],
    ["   ", "이름을 입력해 주세요."],
    ["가".repeat(51), "50자 이하"],
    ["😀".repeat(25) + "가", "50자 이하"],
  ])("%j를 거절한다", (value, message) => {
    expect(nameError(value)).toContain(message);
  });

  it.each(["가", " 가나 ", "가".repeat(50), "😀".repeat(25)])(
    "%j를 허용한다",
    (value) => {
      expect(nameError(value)).toBeNull();
    },
  );
});

describe("studentNoError", () => {
  it.each([
    ["", "학번을 입력해 주세요."],
    ["   ", "학번을 입력해 주세요."],
    ["0".repeat(21), "20자 이하"],
  ])("%j를 거절한다", (value, message) => {
    expect(studentNoError(value)).toContain(message);
  });

  it.each(["0", " 0012345678 ", "0".repeat(20), "A012345678"])(
    "%j를 문자열 학번으로 허용한다",
    (value) => {
      expect(studentNoError(value)).toBeNull();
    },
  );
});

describe("codeError", () => {
  it("AC-AUTH-001-10: 6자리 숫자만 허용한다", () => {
    expect(codeError("123456")).toBeNull();
    for (const code of ["", "12345", "1234567", "12345a", "１２３４５６"]) {
      expect(codeError(code)).not.toBeNull();
    }
  });
});

describe("오류 메시지", () => {
  it("AC-AUTH-001-24: 재발송 간격 제한을 안내한다", () => {
    expect(requestCodeErrorMessage(new ApiError(429, ""))).toContain("1분");
  });

  it("AC-AUTH-001-11, AC-AUTH-001-12: 불일치·만료는 같은 안내, 실패 초과는 새 번호를 요구한다", () => {
    expect(verifyCodeErrorMessage(new ApiError(400, ""))).toContain("만료");
    expect(verifyCodeErrorMessage(new ApiError(429, ""))).toContain(
      "새 번호를 받아",
    );
  });

  it("발송 후 5분 경과 여부로 틀린 번호와 만료를 나눠 안내한다", () => {
    expect(
      verifyCodeErrorMessage(new ApiError(400, ""), { expired: false }),
    ).toContain("맞지 않아요");
    expect(
      verifyCodeErrorMessage(new ApiError(400, ""), { expired: true }),
    ).toContain("만료됐어요");
  });

  it.each([
    ["VERIFICATION_CODE_EXPIRED", false, "만료됐어요"],
    ["VERIFICATION_CODE_MISMATCH", true, "맞지 않아요"],
  ])("%s는 브라우저의 경과 시간보다 우선한다", (code, expired, message) => {
    expect(
      verifyCodeErrorMessage(
        new ApiError(400, JSON.stringify({ error: { code } })),
        { expired },
      ),
    ).toContain(message);
  });

  it("비밀번호 거절은 실제 서버 정책을 안내한다", () => {
    expect(
      registerErrorMessage(
        new ApiError(
          400,
          JSON.stringify({ error: { code: "INVALID_PASSWORD" } }),
        ),
      ),
    ).toContain("8~64자, UTF-8 72바이트");
    expect(registerErrorMessage(new ApiError(400, ""))).toContain(
      "입력한 이름·학번",
    );
  });

  it("인증이 만료되면 다시 인증하도록 안내한다", () => {
    expect(
      registerErrorMessage(
        new ApiError(
          403,
          JSON.stringify({ error: { code: "EMAIL_NOT_VERIFIED" } }),
        ),
      ),
    ).toContain("다시 받아");
    expect(
      registerErrorMessage(
        new ApiError(403, JSON.stringify({ error: { code: "CSRF_INVALID" } })),
      ),
    ).toContain("새로고침");
  });

  it("메일 발송 실패와 이미 등록된 이메일·학번을 구분한다", () => {
    expect(requestCodeErrorMessage(new ApiError(503, ""))).toContain(
      "메일을 보내지 못했어요",
    );
    expect(requestCodeErrorMessage(new ApiError(409, ""))).toContain(
      "이미 가입된 학교 이메일",
    );
    expect(
      registerErrorMessage(
        new ApiError(
          409,
          JSON.stringify({ error: { code: "STUDENT_NO_ALREADY_REGISTERED" } }),
        ),
      ),
    ).toContain("이미 등록된 학번");
  });

  it.each([
    requestCodeErrorMessage,
    verifyCodeErrorMessage,
    registerErrorMessage,
  ])("서버 원문을 노출하지 않고 미연결을 알린다", (message) => {
    expect(message(new ApiError(500, "stack trace"))).not.toContain("stack");
    expect(message(new TypeError("Failed to fetch"))).toContain("네트워크");
    expect(message(new AuthNotConnectedError())).toContain("준비");
  });
});
