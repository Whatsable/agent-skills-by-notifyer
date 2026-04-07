/**
 * Notifyer HTTP client.
 *
 * Loads configuration from env vars and exposes a single `requestJson` function
 * that handles auth headers, JSON serialization, and structured error responses.
 *
 * Auth modes:
 *   CONSOLE (default) — Authorization: Bearer <token>   (es_con surface)
 *   CHAT              — Authorization: <token>           (es_chat surface, raw token)
 *
 * Required env vars:
 *   NOTIFYER_API_BASE_URL   e.g. https://api.insightssystem.com
 *   NOTIFYER_API_TOKEN      JWT from login.js (omit for unauthenticated calls like signup)
 */

export const AUTH_MODE_CONSOLE = "console";
export const AUTH_MODE_CHAT = "chat";

/**
 * Load and validate configuration from environment variables.
 *
 * @param {{ authMode?: "console"|"chat", requireToken?: boolean }} [options]
 * @returns {{ baseUrl: string, token: string|null, authMode: string }}
 */
export function loadConfig(options = {}) {
  const { authMode = AUTH_MODE_CONSOLE, requireToken = true } = options;

  const baseUrl = process.env.NOTIFYER_API_BASE_URL;
  if (!baseUrl) {
    console.error(
      "Error: NOTIFYER_API_BASE_URL is not set.\n" +
        "  export NOTIFYER_API_BASE_URL=https://api.insightssystem.com"
    );
    process.exit(1);
  }

  const token = process.env.NOTIFYER_API_TOKEN ?? null;
  if (requireToken && !token) {
    console.error(
      "Error: NOTIFYER_API_TOKEN is not set.\n" +
        "  Run: node scripts/login.js --email you@example.com --password yourpassword\n" +
        "  Then: export NOTIFYER_API_TOKEN=<authToken>"
    );
    process.exit(1);
  }

  return { baseUrl: baseUrl.replace(/\/$/, ""), token, authMode };
}

/**
 * Build the Authorization header value for a given config.
 *
 * @param {{ token: string|null, authMode: string }} config
 * @returns {string|null}
 */
function authHeader(config) {
  if (!config.token) return null;
  if (config.authMode === AUTH_MODE_CHAT) {
    return config.token; // raw token, no Bearer prefix
  }
  return `Bearer ${config.token}`; // console default
}

/**
 * Make a JSON API request and return a structured result.
 *
 * @param {{ baseUrl: string, token: string|null, authMode: string }} config
 * @param {{
 *   method?: string,
 *   path: string,
 *   body?: object,
 *   query?: Record<string, string|number|boolean|(string|number)[]>,
 *   extraHeaders?: Record<string, string>
 * }} options
 * @returns {Promise<{ ok: boolean, data?: any, error?: string, status?: number }>}
 */
export async function requestJson(config, options) {
  const {
    method = "GET",
    path,
    body,
    query,
    extraHeaders = {},
  } = options;

  let url = `${config.baseUrl}${path}`;

  if (query && Object.keys(query).length > 0) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (Array.isArray(value)) {
        for (const v of value) params.append(`${key}[]`, String(v));
      } else if (value !== undefined && value !== null) {
        params.set(key, String(value));
      }
    }
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }

  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...extraHeaders,
  };

  const auth = authHeader(config);
  if (auth) headers["Authorization"] = auth;

  let res;
  try {
    res = await fetch(url, {
      method: method.toUpperCase(),
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    return { ok: false, error: `Network error: ${e.message}` };
  }

  let responseBody;
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      responseBody = await res.json();
    } catch {
      responseBody = null;
    }
  } else {
    responseBody = await res.text();
  }

  if (!res.ok) {
    const message =
      (typeof responseBody === "object" && responseBody?.message) ||
      (typeof responseBody === "string" && responseBody) ||
      `HTTP ${res.status}`;
    return { ok: false, error: message, status: res.status, data: responseBody };
  }

  return { ok: true, data: responseBody };
}
