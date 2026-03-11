const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000"
const AUTH_TOKEN_KEY = "matchmaker_auth_token"

function getAuthHeaders(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem(AUTH_TOKEN_KEY) : null
  if (!token) return {}
  return { Authorization: `Bearer ${token}` }
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = "ApiError"
    this.status = status
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorBody = await response.text().catch(() => "Unknown error")
    let message = "Unknown error"
    try {
      const parsed = JSON.parse(errorBody) as { error?: string; message?: string }
      message = parsed.error ?? parsed.message ?? errorBody
    } catch {
      message = errorBody || response.statusText
    }
    throw new ApiError(response.status, typeof message === "string" ? message : "Request failed")
  }
  return response.json() as Promise<T>
}

export const apiClient = {
  async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${API_BASE_URL}${path}`)
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, value)
      })
    }
    const response = await fetch(url.toString(), {
      headers: getAuthHeaders(),
    })
    return handleResponse<T>(response)
  },

  async post<T>(path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: body ? JSON.stringify(body) : undefined,
    })
    return handleResponse<T>(response)
  },

  async put<T>(path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: body ? JSON.stringify(body) : undefined,
    })
    return handleResponse<T>(response)
  },

  async patch<T>(path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: body ? JSON.stringify(body) : undefined,
    })
    return handleResponse<T>(response)
  },

  async delete<T>(path: string): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: "DELETE",
      headers: getAuthHeaders(),
    })
    return handleResponse<T>(response)
  },
}
