const BASE = "/api";

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(typeof body === "object" && body && "error" in body ? String((body as { error: unknown }).error) : "request failed");
  }
}

let currentToken: string | null = null;

export function setToken(token: string | null): void {
  currentToken = token;
  if (token) localStorage.setItem("bord_token", token);
  else localStorage.removeItem("bord_token");
}

export function loadStoredToken(): string | null {
  currentToken = localStorage.getItem("bord_token");
  return currentToken;
}

export async function api<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
  const authToken = token ?? currentToken;
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  const parsed = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new ApiError(res.status, parsed);
  }
  return parsed as T;
}
