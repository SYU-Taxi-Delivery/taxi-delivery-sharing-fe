export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`API 요청에 실패했습니다. (HTTP ${status})`);
    this.name = "ApiError";
  }
}

/** Parse JSON by default. Only the code-based auth operations expect plain text. */
export async function apiFetch<T = unknown>(
  path: string,
  options?: RequestInit,
  responseType?: "json",
): Promise<T | undefined>;
export async function apiFetch(
  path: string,
  options: RequestInit,
  responseType: "text",
): Promise<string>;
export async function apiFetch(
  path: string,
  options: RequestInit = {},
  responseType: "json" | "text" = "json",
): Promise<unknown> {
  const baseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    (typeof window !== "undefined" ? window.location.origin : undefined);

  if (!baseUrl) {
    throw new Error("NEXT_PUBLIC_API_BASE_URL을 설정해 주세요.");
  }

  const base = new URL(baseUrl);
  if (
    !["http:", "https:"].includes(base.protocol) ||
    base.username ||
    base.password ||
    base.search ||
    base.hash
  ) {
    throw new Error(
      "API 기본 주소에는 HTTP(S) origin과 경로만 사용할 수 있습니다.",
    );
  }

  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new Error("API 경로는 /로 시작하는 상대 경로여야 합니다.");
  }

  const headers = new Headers(options.headers);
  if (!headers.has("Accept")) {
    headers.set(
      "Accept",
      responseType === "text"
        ? "text/plain, application/json;q=0.9"
        : "application/json",
    );
  }

  const response = await fetch(`${base.href.replace(/\/+$/, "")}${path}`, {
    cache: "no-store",
    // The backend authenticates with a session cookie (JSESSIONID).
    credentials: "include",
    ...options,
    headers,
  });
  const body = await response.text();

  if (!response.ok) {
    throw new ApiError(response.status, body);
  }

  if (responseType === "text") {
    if (
      response.status !== 200 ||
      response.redirected ||
      !body.trim() ||
      response.headers
        .get("content-type")
        ?.split(";")[0]
        .trim()
        .toLowerCase() !== "text/plain"
    ) {
      throw new Error("인증 요청의 응답 형식을 확인할 수 없습니다.");
    }
    return body;
  }
  return body ? JSON.parse(body) : undefined;
}
