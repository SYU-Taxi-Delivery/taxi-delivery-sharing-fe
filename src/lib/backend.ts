import { ApiError, apiFetch } from "./api";

/**
 * Backend contract (taxi-delivery-sharing docs/post-api.md, participation-api.md):
 * success `{ data, meta: { evaluatedAt } }`, failure `{ error: { code }, meta }`,
 * session cookie authentication and a CSRF token on every mutation.
 */
export type Envelope<T> = { data: T; evaluatedAt: string };

/** Keep a server observation advancing while dependent requests complete. */
export function serverTimeNow(evaluatedAt: string): () => number {
  const serverMs = Date.parse(evaluatedAt);
  const observedAt = performance.now();
  return () => serverMs + performance.now() - observedAt;
}

type CsrfToken = { headerName: string; token: string };

const offsetInstant = /(?:Z|[+-]\d{2}:\d{2})$/i;

export class InvalidBackendResponse extends Error {
  constructor() {
    super("서버 응답 형식을 확인할 수 없습니다.");
    this.name = "InvalidBackendResponse";
  }
}

/** The backend error code, e.g. "POST_NOT_FOUND"; null for other failures. */
export function errorCode(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  try {
    const code = (JSON.parse(error.body) as { error?: { code?: unknown } })
      ?.error?.code;
    return typeof code === "string" ? code : null;
  } catch {
    return null;
  }
}

function toEnvelope<T>(value: unknown): Envelope<T> {
  if (typeof value !== "object" || value === null || !("data" in value)) {
    throw new InvalidBackendResponse();
  }
  const { data, meta } = value as { data: T; meta?: { evaluatedAt?: unknown } };
  const evaluatedAt = meta?.evaluatedAt;
  if (
    typeof evaluatedAt !== "string" ||
    !offsetInstant.test(evaluatedAt) ||
    !Number.isFinite(Date.parse(evaluatedAt))
  ) {
    throw new InvalidBackendResponse();
  }
  return { data, evaluatedAt };
}

let csrfToken: Promise<CsrfToken> | null = null;

/** Login and logout rotate the token; call this after either. */
export function resetCsrfToken() {
  csrfToken = null;
}

function loadCsrfToken(): Promise<CsrfToken> {
  csrfToken ??= apiFetch("/api/csrf")
    .then((value) => {
      const { data } = toEnvelope<Partial<CsrfToken>>(value);
      if (
        typeof data?.headerName !== "string" ||
        typeof data.token !== "string" ||
        data.headerName === "" ||
        data.token === ""
      ) {
        throw new InvalidBackendResponse();
      }
      return { headerName: data.headerName, token: data.token };
    })
    .catch((error: unknown) => {
      csrfToken = null;
      throw error;
    });
  return csrfToken;
}

export async function backendGet<T>(path: string): Promise<Envelope<T>> {
  return toEnvelope<T>(await apiFetch(path));
}

/**
 * Sends a mutation with the CSRF header. A rejected token is fetched again and
 * the request retried once, since the session may have rotated it.
 */
export async function backendSend(
  method: "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
  init: Pick<RequestInit, "redirect"> = {},
): Promise<unknown> {
  const send = async () => {
    const { headerName, token } = await loadCsrfToken();
    const headers = new Headers({ [headerName]: token });
    if (body !== undefined) headers.set("Content-Type", "application/json");
    return apiFetch(path, {
      ...init,
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  };
  try {
    return await send();
  } catch (error) {
    if (errorCode(error) !== "CSRF_INVALID") throw error;
    resetCsrfToken();
    return send();
  }
}

/** Mutation whose success body is a data envelope. */
export async function backendSendData<T>(
  method: "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<Envelope<T>> {
  return toEnvelope<T>(await backendSend(method, path, body));
}
