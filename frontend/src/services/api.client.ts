// src/services/api.client.ts
// Central fetch wrapper with centralized error handling

export async function apiFetch<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  try {
    const res = await fetch(input, init);
    if (!res.ok) {
      // Centralized error handling
      const error = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(error.message || 'API Error');
    }
    return res.json();
  } catch (err: any) {
    // Optionally log or rethrow
    throw err;
  }
}
