/**
 * Single fetch helper for the API.
 *
 * All requests use relative /api URLs so the browser stays on one origin: Vite
 * proxies them in development and the reverse proxy routes them in deployment.
 * No backend hostname or port appears in client code.
 *
 * CSRF handling, session behaviour and typed error mapping are added in later
 * phases; this phase provides only the transport and the response envelope.
 */

const API_PREFIX = '/api';

export class ApiError extends Error {
  constructor(status, code, message, requestId) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

/**
 * Performs an API request and unwraps the `{ data }` envelope.
 *
 * @param {string} path Path beginning with a slash, e.g. '/health/live'.
 * @param {RequestInit} [options]
 * @returns {Promise<unknown>} The `data` field of the response envelope.
 */
export async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_PREFIX}${path}`, {
    // Session cookie travels with every request once auth exists.
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      ...options.headers,
    },
    ...options,
  })

  const contentType = response.headers.get('content-type') ?? ''
  const isJson = contentType.includes('application/json')
  const body = isJson ? await response.json() : null

  if (!response.ok) {
    const error = body?.error
    throw new ApiError(
      response.status,
      error?.code ?? 'UNKNOWN_ERROR',
      error?.message ?? `Request failed with status ${response.status}`,
      body?.requestId,
    )
  }

  return body?.data
}

/**
 * Reads API liveness. Used to confirm the dev proxy is wired correctly.
 */
export function getLiveness() {
  return apiRequest('/health/live')
}
