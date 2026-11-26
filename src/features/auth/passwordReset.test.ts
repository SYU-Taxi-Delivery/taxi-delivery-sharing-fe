// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { resetCsrfToken } from "@/lib/backend";
import { passwordResetFailure, passwordResetOperations } from "./passwordReset";

const csrf = {
  data: { headerName: "X-XSRF-TOKEN", token: "csrf-token" },
  meta: { evaluatedAt: "2026-11-26T12:00:00+09:00" },
};

function backend(reply: () => Response) {
  const fetch = vi.fn(async (input: RequestInfo | URL) =>
    String(input).endsWith("/api/csrf")
      ? new Response(JSON.stringify(csrf))
      : reply(),
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

const sent = (fetch: ReturnType<typeof backend>) => {
  const [url, init] = fetch.mock.calls.at(-1) as unknown as [
    string,
    RequestInit,
  ];
  return {
    url,
    method: init.method,
    csrf: new Headers(init.headers).get("X-XSRF-TOKEN"),
    body: JSON.parse(String(init.body)),
  };
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  resetCsrfToken();
});

describe("passwordResetOperations", () => {
  it("인증번호 요청은 send-code에 학교 이메일만 CSRF와 함께 보내고, 문장 응답도 성공으로 본다", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.test");
    const fetch = backend(
      () => new Response("가입된 이메일이라면 인증 번호를 보냈습니다."),
    );
    await passwordResetOperations.requestCode("a@syuin.ac.kr");
    expect(sent(fetch)).toEqual({
      url: "https://api.test/api/auth/password-reset/send-code",
      method: "POST",
      csrf: "csrf-token",
      body: { schoolEmail: "a@syuin.ac.kr" },
    });
  });

  it("변경 확정은 confirm에 이메일·인증번호·새 비밀번호(원문 그대로)를 보낸다", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.test");
    const fetch = backend(() => new Response("비밀번호가 변경되었습니다."));
    await passwordResetOperations.confirm({
      email: "a@syuin.ac.kr",
      code: "012345",
      password: " new pass 1 ",
    });
    expect(sent(fetch)).toMatchObject({
      url: "https://api.test/api/auth/password-reset/confirm",
      body: {
        schoolEmail: "a@syuin.ac.kr",
        code: "012345",
        newPassword: " new pass 1 ",
      },
    });
  });

  it("서버 거절은 오류 코드와 함께 그대로 전달한다", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.test");
    backend(
      () =>
        new Response(
          JSON.stringify({ error: { code: "VERIFICATION_CODE_MISMATCH" } }),
          { status: 400 },
        ),
    );
    await expect(
      passwordResetOperations.confirm({
        email: "a@syuin.ac.kr",
        code: "000000",
        password: "new pass 12",
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

const api = (status: number, code?: string) =>
  new ApiError(status, code ? JSON.stringify({ error: { code } }) : "");

describe("passwordResetFailure", () => {
  it.each([
    [400, "INVALID_SCHOOL_EMAIL", "email", false, "삼육대학교 이메일"],
    [400, "VERIFICATION_CODE_MISMATCH", "code", false, "맞지 않아요"],
    [400, "VERIFICATION_CODE_EXPIRED", "code", true, "다시 받기"],
    [429, "VERIFICATION_ATTEMPTS_EXCEEDED", "code", true, "더 쓸 수 없어요"],
    [400, "INVALID_PASSWORD", "password", false, "8~64자"],
    [503, "MAIL_DELIVERY_FAILED", null, false, "메일을 보내지 못했어요"],
    [429, undefined, null, false, "잠시 제한"],
  ] as const)("%s %s → %s 칸 안내", (status, code, field, newCode, message) => {
    const result = passwordResetFailure(api(status, code));
    expect(result).toMatchObject({ field, newCode });
    expect(result.message).toContain(message);
  });

  it("알 수 없는 오류 원문을 사용자에게 노출하지 않는다", () => {
    const { message } = passwordResetFailure(
      new Error("SQL stack trace token=secret-token"),
    );
    expect(message).not.toMatch(/SQL|stack|secret-token/);
    expect(message).toContain("다시");
  });
});
