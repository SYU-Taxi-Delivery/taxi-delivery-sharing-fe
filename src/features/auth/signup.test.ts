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
  it("AC-AUTH-001-07: 15·128 코드포인트 경계와 양끝 공백을 허용한다", () => {
    expect(passwordError("a".repeat(15))).toBeNull();
    expect(passwordError("a".repeat(128))).toBeNull();
    expect(passwordError(` ${"a".repeat(13)} `)).toBeNull();
  });

  it("AC-AUTH-001-21: 14·129 코드포인트를 거절한다", () => {
    expect(passwordError("a".repeat(14))).toContain("15~128자");
    expect(passwordError("a".repeat(129))).toContain("15~128자");
  });

  it("UTF-16 길이가 아니라 NFC 후 코드포인트로 센다", () => {
    expect(passwordError("😀".repeat(15))).toBeNull();
    expect(passwordError("😀".repeat(14))).not.toBeNull();
    // e + combining acute becomes one code point after NFC.
    expect(passwordError("é".repeat(15))).toBeNull();
    expect(passwordError(`${"é".repeat(14)}`)).not.toBeNull();
  });

  it("빈 비밀번호를 안내한다", () => {
    expect(passwordError("")).toBe("비밀번호를 입력해 주세요.");
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

  it("발송 후 10분 경과 여부로 틀린 번호와 만료를 나눠 안내한다", () => {
    expect(
      verifyCodeErrorMessage(new ApiError(400, ""), { expired: false }),
    ).toContain("맞지 않아요");
    expect(
      verifyCodeErrorMessage(new ApiError(400, ""), { expired: true }),
    ).toContain("만료됐어요");
  });

  it("AC-AUTH-001-22: 차단 목록 비밀번호 거절을 안내한다", () => {
    expect(registerErrorMessage(new ApiError(400, ""))).toContain(
      "유출된 비밀번호",
    );
  });

  it("인증이 만료되면 다시 인증하도록 안내한다", () => {
    expect(registerErrorMessage(new ApiError(403, ""))).toContain("다시 받아");
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
