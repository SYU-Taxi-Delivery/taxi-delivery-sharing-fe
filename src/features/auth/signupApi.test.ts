import { afterEach, describe, expect, it, vi } from "vitest";
import { InvalidBackendResponse, errorCode } from "@/lib/backend";
import { failure, fakeBackend } from "@/test/fakeBackend";
import { signupOperations } from "./authApi";

const prefix = "/api/auth/school-email";
const signup = {
  studentNo: " 0012345678 ",
  name: " 삼육 학생 ",
  schoolEmail: " Student@SYU.AC.KR ",
  password: " e\u0301abc123 ",
  verificationToken: "opaque-ticket-from-server",
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("학교 이메일 회원가입 연동", () => {
  it("인증 응답의 증표를 가입 DTO에 보내고 자동 로그인하거나 증표를 저장하지 않는다", async () => {
    const { calls } = fakeBackend({
      [`POST ${prefix}/send-code`]: () =>
        new Response("학교 이메일로 인증 코드가 발송되었습니다."),
      [`POST ${prefix}/verify-code`]: () =>
        Response.json({ verificationToken: signup.verificationToken }),
      [`POST ${prefix}/register`]: () => Response.json(7),
    });
    await signupOperations.requestCode(signup.schoolEmail);
    const verificationToken = await signupOperations.verifyCode(
      signup.schoolEmail,
      "012345",
    );
    await signupOperations.register({
      ...signup,
      verificationToken,
      role: "ADMIN",
    } as typeof signup);

    const mutations = calls.filter(({ method }) => method === "POST");
    expect(mutations.map(({ path, body }) => ({ path, body }))).toEqual([
      {
        path: `${prefix}/send-code`,
        body: { schoolEmail: "student@syu.ac.kr" },
      },
      {
        path: `${prefix}/verify-code`,
        body: { schoolEmail: "student@syu.ac.kr", code: "012345" },
      },
      {
        path: `${prefix}/register`,
        body: {
          studentNo: "0012345678",
          name: "삼육 학생",
          schoolEmail: "student@syu.ac.kr",
          password: signup.password,
          verificationToken: signup.verificationToken,
        },
      },
    ]);
    expect(
      mutations.every(
        ({ headers }) => headers.get("X-XSRF-TOKEN") === "csrf-token",
      ),
    ).toBe(true);
    expect(calls.some(({ path }) => path === "/api/auth/local/login")).toBe(
      false,
    );
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it.each([
    null,
    "인증 완료",
    {},
    { verificationToken: 7 },
    { verificationToken: " " },
  ])("유효한 인증 증표가 없는 응답 %j은 거부한다", async (response) => {
    fakeBackend({
      [`POST ${prefix}/verify-code`]: () => Response.json(response),
    });
    await expect(
      signupOperations.verifyCode(signup.schoolEmail, "012345"),
    ).rejects.toBeInstanceOf(InvalidBackendResponse);
  });

  it.each(["7", { userId: 7 }, null, 0, -1, 1.5])(
    "가입 ID가 숫자 계약이 아닌 %j이면 완료 처리하지 않는다",
    async (response) => {
      fakeBackend({
        [`POST ${prefix}/register`]: () => Response.json(response),
      });
      await expect(signupOperations.register(signup)).rejects.toBeInstanceOf(
        InvalidBackendResponse,
      );
    },
  );

  it.each([
    ["send-code", 409, "EMAIL_ALREADY_REGISTERED"],
    ["send-code", 429, "VERIFICATION_RESEND_TOO_SOON"],
    ["send-code", 503, "MAIL_DELIVERY_FAILED"],
    ["verify-code", 400, "VERIFICATION_CODE_MISMATCH"],
    ["verify-code", 429, "VERIFICATION_ATTEMPTS_EXCEEDED"],
    ["register", 403, "EMAIL_NOT_VERIFIED"],
    ["register", 409, "STUDENT_NO_ALREADY_REGISTERED"],
  ] as const)(
    "%s의 %s 오류를 화면까지 전달한다",
    async (path, status, code) => {
      fakeBackend({ [`POST ${prefix}/${path}`]: () => failure(status, code) });
      const operation =
        path === "send-code"
          ? signupOperations.requestCode(signup.schoolEmail)
          : path === "verify-code"
            ? signupOperations.verifyCode(signup.schoolEmail, "012345")
            : signupOperations.register(signup);
      await expect(operation).rejects.toMatchObject({ status });
      await operation.catch((error: unknown) =>
        expect(errorCode(error)).toBe(code),
      );
    },
  );
});
