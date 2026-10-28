// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import {
  loginErrorMessage,
  loginHref,
  safeNextPath,
  toCurrentUser,
  validateLogin,
} from "./auth";
import { AuthNotConnectedError } from "./authApi";

describe("toCurrentUser", () => {
  it("AC-AUTH-003-01: id·표시명·역할만 남긴다", () => {
    expect(
      toCurrentUser({
        id: 7,
        displayName: " 김삼육 ",
        role: "STUDENT",
        email: "a@syuin.ac.kr",
        studentNumber: "2024101234",
      }),
    ).toEqual({ id: "7", displayName: "김삼육", role: "STUDENT" });
  });

  it("AC-AUTH-003-02: ADMIN 역할을 그대로 반영한다", () => {
    expect(
      toCurrentUser({ id: "d", displayName: "운영자", role: "ADMIN" }),
    ).toMatchObject({ role: "ADMIN" });
  });

  it.each([null, undefined])("세션이 없는 %s 응답은 null이다", (value) => {
    expect(toCurrentUser(value)).toBeNull();
  });

  it.each([
    "user",
    { id: "", displayName: "a", role: "STUDENT" },
    { id: 0, displayName: "a", role: "STUDENT" },
    { id: 1.5, displayName: "a", role: "STUDENT" },
    { id: "1", displayName: "  ", role: "STUDENT" },
    { id: "1", displayName: "a", role: "student" },
    { id: "1", displayName: "a", role: "OWNER" },
    { id: "1", displayName: "a" },
  ])("AC-AUTH-004-03: 알 수 없는 사용자 응답 %j를 거부한다", (value) => {
    expect(() => toCurrentUser(value)).toThrow("사용자 정보");
  });
});

describe("safeNextPath", () => {
  it.each([
    ["/posts/1?tab=comments#c2", "/posts/1?tab=comments#c2"],
    ["/admin", "/admin"],
  ])("같은 출처의 경로 %s를 유지한다", (value, expected) => {
    expect(safeNextPath(value)).toBe(expected);
  });

  it.each([
    undefined,
    "",
    "posts",
    "https://evil.example/",
    "//evil.example/",
    "/\\evil.example",
    "/a\nb",
    "/login",
    "/login?next=/admin",
    "/login/",
    `/${"a".repeat(2048)}`,
  ])("외부·로그인 반복 경로 %j는 홈으로 바꾼다", (value) => {
    expect(safeNextPath(value)).toBe("/");
  });

  it("로그인 주소에 돌아올 경로를 인코딩한다", () => {
    expect(loginHref("/posts/1?tab=a")).toBe(
      "/login?next=%2Fposts%2F1%3Ftab%3Da",
    );
    expect(loginHref("/")).toBe("/login");
    expect(loginHref("https://evil.example")).toBe("/login");
  });
});

describe("validateLogin", () => {
  it("학교 이메일과 비밀번호가 있으면 통과한다", () => {
    expect(
      validateLogin({ email: "A@SYUIN.AC.KR", password: " 공백 포함 " }),
    ).toEqual({});
  });

  it("AC-AUTH-001-08: 학교 도메인이 아니면 요청 전에 안내한다", () => {
    for (const email of [
      "a@example.com",
      "a@syuin.ac.kr.evil.com",
      "a@mail.syuin.ac.kr",
      "a@syu.ac.kr",
      "@syuin.ac.kr",
      "a b@syuin.ac.kr",
      "syuin.ac.kr",
    ]) {
      expect(validateLogin({ email, password: "x" }).email).toContain(
        "@syuin.ac.kr",
      );
    }
  });

  it("빈 입력을 필드별로 안내한다", () => {
    expect(validateLogin({ email: " ", password: "" })).toEqual({
      email: "학교 이메일을 입력해 주세요.",
      password: "비밀번호를 입력해 주세요.",
    });
  });

  it.each(["a@@syuin.ac.kr", "a@b@syuin.ac.kr"])(
    "@가 여러 개인 이메일 %s를 거절한다",
    (email) => {
      expect(validateLogin({ email, password: "password" }).email).toContain(
        "@syuin.ac.kr",
      );
    },
  );

  it("공백만 있는 비밀번호도 그대로 입력값으로 본다", () => {
    expect(
      validateLogin({ email: "a@syuin.ac.kr", password: "   " }).password,
    ).toBeUndefined();
  });
});

describe("loginErrorMessage", () => {
  it("AC-AUTH-001-14, AC-AUTH-001-16: 틀린 비밀번호와 없는 계정을 구분하지 않는다", () => {
    expect(loginErrorMessage(new ApiError(401, "no such user"))).toBe(
      loginErrorMessage(new ApiError(401, "wrong password")),
    );
    expect(loginErrorMessage(new ApiError(401, "no such user"))).not.toContain(
      "no such user",
    );
  });

  it("403은 원인을 단정하지 않고 새로고침과 이메일 인증 상태 확인을 안내한다", () => {
    const message = loginErrorMessage(new ApiError(403, "missing CSRF token"));
    expect(message).toContain("새로고침");
    expect(message).toContain("학교 이메일 인증 상태");
    expect(message).not.toContain("missing CSRF token");
  });

  it("AC-AUTH-001-23: 시도 제한을 안내한다", () => {
    expect(loginErrorMessage(new ApiError(429, ""))).toContain("제한");
  });

  it.each([
    new ApiError(500, "stack trace"),
    new TypeError("Failed to fetch"),
    new SyntaxError("Unexpected token"),
  ])("서버·네트워크 오류 원문을 표시하지 않는다", (error) => {
    expect(loginErrorMessage(error)).toBe(
      "로그인하지 못했어요. 네트워크를 확인한 후 다시 시도해 주세요.",
    );
  });

  it("API가 연결되지 않았음을 알린다", () => {
    expect(loginErrorMessage(new AuthNotConnectedError())).toContain("준비");
  });
});
