/**
 * Single fetch helper for the API.
 *
 * All requests use relative /api URLs so the browser stays on one origin: Vite
 * proxies them in development and the reverse proxy routes them in deployment.
 * No backend hostname or port appears in client code, and no session token is
 * ever stored in localStorage.
 */

const API_PREFIX = '/api'

/** Session-bound CSRF token, held in memory only. */
let csrfToken = null

export class ApiError extends Error {
  constructor(status, code, message, details, requestId) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details ?? []
    this.requestId = requestId
  }

  /** Field-level messages, keyed by field name, for form rendering. */
  get fieldErrors() {
    return Object.fromEntries(this.details.map((detail) => [detail.field, detail.message]))
  }
}

/** Raised when a request never produced a response, so the outcome is unknown. */
export class NetworkError extends Error {
  constructor(message) {
    super(message)
    this.name = 'NetworkError'
  }
}

export function setCsrfToken(token) {
  csrfToken = token
}

export function getCsrfToken() {
  return csrfToken
}

/**
 * Fetches a CSRF token and remembers it for subsequent writes.
 */
export async function bootstrapCsrf() {
  const data = await apiRequest('/auth/csrf')
  setCsrfToken(data.csrfToken)
  return data.csrfToken
}

/**
 * Performs an API request and unwraps the `{ data }` envelope.
 *
 * @param {string} path Path beginning with a slash, e.g. '/auth/me'.
 * @param {{method?: string, body?: unknown, signal?: AbortSignal}} [options]
 */
export async function apiRequest(path, options = {}) {
  const { method = 'GET', body, signal } = options
  const isWrite = method !== 'GET' && method !== 'HEAD'

  const headers = { Accept: 'application/json' }

  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (isWrite && csrfToken) headers['x-csrf-token'] = csrfToken

  let response

  try {
    response = await fetch(`${API_PREFIX}${path}`, {
      method,
      // Same-origin: the session cookie travels automatically.
      credentials: 'same-origin',
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    })
  } catch (error) {
    if (error.name === 'AbortError') throw error
    // The request may or may not have reached the server: the caller must
    // present this as an uncertain outcome, never as a definite failure.
    throw new NetworkError('The server could not be reached.')
  }

  const contentType = response.headers.get('content-type') ?? ''
  const payload = contentType.includes('application/json') ? await response.json() : null

  if (!response.ok) {
    const error = payload?.error
    throw new ApiError(
      response.status,
      error?.code ?? 'UNKNOWN_ERROR',
      error?.message ?? `Request failed with status ${response.status}`,
      error?.details,
      payload?.requestId,
    )
  }

  return payload?.data
}

export const api = {
  // Authentication
  csrf: () => bootstrapCsrf(),
  me: (signal) => apiRequest('/auth/me', { signal }),
  register: (body) => apiRequest('/auth/register', { method: 'POST', body }),
  login: async (body) => {
    const data = await apiRequest('/auth/login', { method: 'POST', body })
    // Login rotates the session and the token together.
    if (data?.csrfToken) setCsrfToken(data.csrfToken)
    return data
  },
  logout: () => apiRequest('/auth/logout', { method: 'POST', body: {} }),

  // Catalogue
  resources: (query, signal) => apiRequest(`/resources?${query}`, { signal }),
  resourceFilters: (signal) => apiRequest('/resources/filters', { signal }),
  resource: (id, signal) => apiRequest(`/resources/${id}`, { signal }),
  slots: (id, date, signal) => apiRequest(`/resources/${id}/slots?date=${date}`, { signal }),

  // Bookings
  createBooking: (body) => apiRequest('/bookings', { method: 'POST', body }),
  myBookings: (query, signal) => apiRequest(`/bookings/mine?${query}`, { signal }),
  cancelBooking: (id, reason) =>
    apiRequest(`/bookings/${id}/cancel`, { method: 'POST', body: reason ? { reason } : {} }),

  // Admin
  adminResources: (query, signal) => apiRequest(`/admin/resources?${query}`, { signal }),
  adminResource: (id, signal) => apiRequest(`/admin/resources/${id}`, { signal }),
  createResource: (body) => apiRequest('/admin/resources', { method: 'POST', body }),
  updateResource: (id, body) => apiRequest(`/admin/resources/${id}`, { method: 'PATCH', body }),
  generateSlots: (id, body) =>
    apiRequest(`/admin/resources/${id}/slots/generate`, { method: 'POST', body }),
  setSlotOpen: (id, isOpen) => apiRequest(`/admin/slots/${id}`, { method: 'PATCH', body: { isOpen } }),
  adminBookings: (query, signal) => apiRequest(`/admin/bookings?${query}`, { signal }),
  bookingEvents: (id, signal) => apiRequest(`/admin/bookings/${id}/events`, { signal }),
}
