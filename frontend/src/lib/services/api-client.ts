const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000"
export const AUTH_TOKEN_KEY = "matchmaker_auth_token"

function getAuthHeaders(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem(AUTH_TOKEN_KEY) : null
  if (!token) return {}
  return { Authorization: `Bearer ${token}` }
}

export class ApiError extends Error {
  status: number
  errorCode: string | undefined
  constructor(status: number, message: string, errorCode?: string) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.errorCode = errorCode
  }
}

function emitApiStatus(available: boolean) {
  window.dispatchEvent(new CustomEvent("api:status", { detail: { available } }))
}

async function handleResponse<T>(response: Response): Promise<T> {
  emitApiStatus(true)
  if (!response.ok) {
    const errorBody = await response.text().catch(() => "Unknown error")
    let message = "Unknown error"
    let errorCode: string | undefined
    try {
      const parsed = JSON.parse(errorBody) as { error?: string; message?: string; errorCode?: string }
      message = parsed.error ?? parsed.message ?? errorBody
      errorCode = parsed.errorCode
    } catch {
      message = errorBody || response.statusText
    }
    throw new ApiError(response.status, typeof message === "string" ? message : "Request failed", errorCode)
  }
  if (response.status === 204 || response.headers.get("content-length") === "0") {
    return undefined as T
  }
  return response.json() as Promise<T>
}

async function fetchWithAvailability(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init)
  } catch (err) {
    emitApiStatus(false)
    throw err
  }
}

export const apiClient = {
  async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${API_BASE_URL}${path}`)
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, value)
      })
    }
    const response = await fetchWithAvailability(url.toString(), {
      headers: getAuthHeaders(),
      cache: "no-store",
    })
    return handleResponse<T>(response)
  },

  async post<T>(path: string, body?: unknown): Promise<T> {
    const response = await fetchWithAvailability(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: body ? JSON.stringify(body) : undefined,
    })
    return handleResponse<T>(response)
  },

  async put<T>(path: string, body?: unknown): Promise<T> {
    const response = await fetchWithAvailability(`${API_BASE_URL}${path}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: body ? JSON.stringify(body) : undefined,
    })
    return handleResponse<T>(response)
  },

  async patch<T>(path: string, body?: unknown): Promise<T> {
    const response = await fetchWithAvailability(`${API_BASE_URL}${path}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: body ? JSON.stringify(body) : undefined,
    })
    return handleResponse<T>(response)
  },

  async delete<T>(path: string): Promise<T> {
    const response = await fetchWithAvailability(`${API_BASE_URL}${path}`, {
      method: "DELETE",
      headers: getAuthHeaders(),
    })
    return handleResponse<T>(response)
  },
}
