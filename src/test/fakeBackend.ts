import { vi } from "vitest";
import { resetCsrfToken } from "@/lib/backend";

/** Response shapes copied from taxi-delivery-sharing docs/*.md and a local run. */
export const EVALUATED_AT = "2026-10-27T09:25:23.588615+09:00";

export const envelope = (data: unknown) => ({
  data,
  meta: { evaluatedAt: EVALUATED_AT, requestId: "test-request" },
});

export const failure = (status: number, code: string) =>
  Response.json(
    { error: { code, message: "서버 메시지" }, meta: envelope(null).meta },
    { status },
  );

type Handler = (request: { method: string; body: unknown }) => Response;

/**
 * Stubs fetch with "METHOD /path" handlers and a working CSRF endpoint.
 * Returns the recorded calls for assertions.
 */
export function fakeBackend(routes: Record<string, Handler>) {
  resetCsrfToken();
  vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "http://localhost:3000");
  const calls: {
    method: string;
    path: string;
    headers: Headers;
    body: unknown;
  }[] = [];
  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const path = `${url.pathname}${url.search}`;
    const body =
      typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ method, path, headers: new Headers(init?.headers), body });
    if (method === "GET" && path === "/api/csrf") {
      return Response.json(
        envelope({ headerName: "X-XSRF-TOKEN", token: "csrf-token" }),
      );
    }
    const handler = routes[`${method} ${path}`];
    if (!handler) return failure(404, "API_NOT_FOUND");
    return handler({ method, body });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock };
}

export const taxiItem = {
  postId: "1",
  type: "TAXI",
  title: "석계역 → 삼육대학교",
  postStatus: "OPEN",
  referenceTime: "2026-10-27T11:25:00+09:00",
  participationDeadline: "2026-10-27T11:15:00+09:00",
  capacity: 4,
  currentMemberCount: 1,
  remainingSeats: 3,
  joinable: true,
  departure: "석계역",
  destination: "삼육대학교",
};

export const taxiDetail = {
  ...taxiItem,
  content: "모집 안내",
  author: { displayName: "author" },
  createdAt: "2026-10-27T09:25:20.067827+09:00",
  updatedAt: "2026-10-27T09:25:20.067827+09:00",
  viewer: {
    isAuthor: false,
    myParticipationStatus: "NONE",
    canJoin: true,
    canCancel: false,
    canEdit: false,
    canEditCore: false,
    canViewCommunicationUrl: false,
  },
};
