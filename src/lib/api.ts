export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`API 요청에 실패했습니다. (HTTP ${status})`);
    this.name = "ApiError";
  }
}

/** JSON REST request. Empty responses return undefined; auth follows RequestInit. */
export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T | undefined> {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

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
    headers.set("Accept", "application/json");
  }

  const response = await fetch(`${base.href.replace(/\/+$/, "")}${path}`, {
    cache: "no-store",
    ...options,
    headers,
  });
  const body = await response.text();

  if (!response.ok) {
    throw new ApiError(response.status, body);
  }

  return body ? (JSON.parse(body) as T) : undefined;
}
