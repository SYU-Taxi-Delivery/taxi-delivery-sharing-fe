// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "@/lib/api";

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.example.test/api/");
});

describe("apiFetch", () => {
  it("기본 주소의 경로를 유지하고 JSON 요청 옵션을 전달한다", async () => {
    fetchMock.mockResolvedValue(Response.json({ id: 1 }));
    const options: RequestInit = {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Request-ID": "test" },
      body: JSON.stringify({ name: "테스트" }),
      signal: new AbortController().signal,
    };

    await expect(
      apiFetch<{ id: number }>("/rooms?type=taxi", options),
    ).resolves.toEqual({
      id: 1,
    });

    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.example.test/api/rooms?type=taxi");
    expect(request).toMatchObject({
      ...options,
      headers: expect.any(Headers),
      cache: "no-store",
    });
    const headers = new Headers(request?.headers);
    expect(headers.get("Accept")).toBe("application/json");
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("X-Request-ID")).toBe("test");
  });

  it("호출자가 지정한 헤더와 캐시 옵션을 유지한다", async () => {
    fetchMock.mockResolvedValue(Response.json({ ok: true }));

    await apiFetch("/rooms", {
      headers: new Headers({ accept: "application/problem+json" }),
      cache: "force-cache",
    });

    const request = fetchMock.mock.calls[0][1];
    expect(new Headers(request?.headers).get("Accept")).toBe(
      "application/problem+json",
    );
    expect(request?.cache).toBe("force-cache");
  });

  it("FormData의 Content-Type을 임의로 설정하지 않는다", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const body = new FormData();
    body.set("name", "테스트");

    await apiFetch("/uploads", { method: "POST", body });

    const request = fetchMock.mock.calls[0][1];
    expect(request?.body).toBe(body);
    expect(new Headers(request?.headers).has("Content-Type")).toBe(false);
  });

  it.each([200, 204, 205])(
    "빈 HTTP %i 응답은 undefined를 반환한다",
    async (status) => {
      fetchMock.mockResolvedValue(new Response(null, { status }));

      await expect(apiFetch("/rooms")).resolves.toBeUndefined();
    },
  );

  it.each([400, 401, 500])(
    "HTTP %i 오류의 상태와 원문을 보존한다",
    async (status) => {
      fetchMock.mockResolvedValue(new Response("backend error", { status }));

      await expect(apiFetch("/rooms")).rejects.toMatchObject({
        name: "ApiError",
        status,
        body: "backend error",
      });
    },
  );

  it("ApiError를 Error 타입으로 처리할 수 있다", () => {
    expect(new ApiError(500, "")).toBeInstanceOf(Error);
  });

  it("주소가 미정이면 네트워크 요청 전에 실패한다", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "");

    await expect(apiFetch("/rooms")).rejects.toThrow(
      "NEXT_PUBLIC_API_BASE_URL",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    "ftp://api.example.test",
    "https://user:secret@api.example.test",
    "https://api.example.test?key=value",
    "https://api.example.test#fragment",
    "invalid",
  ])("잘못된 기본 주소 %s를 거부한다", async (baseUrl) => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", baseUrl);

    await expect(apiFetch("/rooms")).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    "https://other.example.test/rooms",
    "//other.example.test/rooms",
    "rooms",
  ])("상대 경로가 아닌 %s를 거부한다", async (path) => {
    await expect(apiFetch(path)).rejects.toThrow("상대 경로");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("JSON이 아닌 성공 응답을 잘못된 데이터로 반환하지 않는다", async () => {
    fetchMock.mockResolvedValue(new Response("invalid json"));

    await expect(apiFetch("/rooms")).rejects.toBeInstanceOf(SyntaxError);
  });

  it.each([
    new TypeError("Failed to fetch"),
    new DOMException("Aborted", "AbortError"),
  ])("네트워크 실패와 취소 오류를 그대로 전달한다", async (error) => {
    fetchMock.mockRejectedValue(error);

    await expect(apiFetch("/rooms")).rejects.toBe(error);
  });
});
