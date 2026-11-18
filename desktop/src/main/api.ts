// Thin client for the server's /api/agent/* routes. Holds the access token
// in memory and refreshes it on a 401 (once per request). The refresh token
// itself is persisted by the caller through `onTokens`.

export class NetworkError extends Error {
  constructor(cause: unknown) {
    super("Can't reach the server");
    this.name = "NetworkError";
    this.cause = cause;
  }
}

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** The server refused our refresh token: the device was revoked or expired. */
export class SignedOutError extends ApiError {
  constructor(message = "Signed out. Please sign in again.") {
    super(401, message);
    this.name = "SignedOutError";
  }
}

export type Tokens = { deviceId: string; accessToken: string; refreshToken: string; refreshExpiresAt: string };
export type StoredAuth = { serverUrl: string; deviceId: string; refreshToken: string };

export type ClockStatus = "CLOCKED_IN" | "ON_BREAK" | "CLOCKED_OUT";
export type ClockState = {
  serverTime: string;
  status: ClockStatus;
  openEntry: { id: string; clockIn: string; source: "WEB" | "AGENT" | "MANUAL"; trackingThisDevice: boolean } | null;
  openBreak: { id: string; breakStart: string } | null;
  policy: { version: string; text: string; accepted: boolean };
  /** No input for this long and the app clocks the person out. */
  autoClockOutIdleMinutes: number;
};
export type Me = ClockState & {
  user: { id: string; name: string; email: string; role: string; timezone: string | null };
  device: { id: string; name: string };
};

export type DeviceInfo = { name: string; os: "win32" | "darwin"; appVersion: string };

const TIMEOUT_MS = 30_000;

export class ApiClient {
  private accessToken: string | null = null;
  private refreshing: Promise<void> | null = null;

  constructor(
    private auth: StoredAuth,
    private appVersion: string,
    private onTokens: (auth: StoredAuth) => void
  ) {}

  get serverUrl() {
    return this.auth.serverUrl;
  }

  /** Signs in without an existing device. Returns tokens or an MFA challenge. */
  static async login(
    serverUrl: string,
    body: ({ email: string; password: string } | { challenge: string; otp: string }) & { device: DeviceInfo }
  ): Promise<Tokens | { mfaRequired: true; challenge: string }> {
    return rawRequest(serverUrl, "/login", { method: "POST", json: body });
  }

  request<T>(path: string, init: { method?: string; json?: unknown; form?: FormData } = {}): Promise<T> {
    return this.withAuth((token) => rawRequest<T>(this.auth.serverUrl, path, { ...init, token }));
  }

  private async withAuth<T>(send: (token: string | null) => Promise<T>): Promise<T> {
    if (!this.accessToken) await this.refresh();
    const used = this.accessToken;
    try {
      return await send(used);
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error;
      // Another request already refreshed while this one was in flight:
      // retry with the new token instead of rotating again.
      if (this.accessToken === used) await this.refresh();
      return send(this.accessToken);
    }
  }

  private refresh(): Promise<void> {
    // Concurrent 401s share one refresh; a second refresh with the already
    // rotated token would look like token theft and revoke the device.
    this.refreshing ??= (async () => {
      try {
        const tokens = await rawRequest<Tokens>(this.auth.serverUrl, "/refresh", {
          method: "POST",
          json: { deviceId: this.auth.deviceId, refreshToken: this.auth.refreshToken, appVersion: this.appVersion },
        });
        this.accessToken = tokens.accessToken;
        this.auth = { ...this.auth, refreshToken: tokens.refreshToken };
        this.onTokens(this.auth);
      } catch (error) {
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) throw new SignedOutError(error.message);
        throw error;
      } finally {
        this.refreshing = null;
      }
    })();
    return this.refreshing;
  }
}

async function rawRequest<T>(
  serverUrl: string,
  path: string,
  init: { method?: string; json?: unknown; form?: FormData; token?: string | null }
): Promise<T> {
  const headers: Record<string, string> = {};
  if (init.token) headers.authorization = `Bearer ${init.token}`;
  let body: string | FormData | undefined;
  if (init.form) body = init.form;
  else if (init.json !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(init.json);
  }

  let response: Response;
  try {
    response = await fetch(`${serverUrl.replace(/\/+$/, "")}/api/agent${path}`, {
      method: init.method ?? "GET",
      headers,
      body,
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new NetworkError(error);
  }

  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    // Non-JSON body (proxy error page etc.): fall through to status handling.
  }
  if (!response.ok) {
    const message = (data as { error?: string } | null)?.error ?? `Server error (${response.status})`;
    throw new ApiError(response.status, message);
  }
  return data as T;
}

/** Retry later (offline, server down, rate limited) vs. never going to work. */
export function isRetryable(error: unknown): boolean {
  if (error instanceof NetworkError) return true;
  if (error instanceof ApiError) return error.status >= 500 || error.status === 429;
  return false;
}
