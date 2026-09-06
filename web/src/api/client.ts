const ACCESS_TOKEN_KEY = 'livestream_access_token'

export function getAccessToken(): string | null {
  try {
    return localStorage.getItem(ACCESS_TOKEN_KEY)
  } catch {
    return null
  }
}

export function setAccessToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(ACCESS_TOKEN_KEY, token)
    else localStorage.removeItem(ACCESS_TOKEN_KEY)
  } catch {
    /* ignore */
  }
}

export class ApiError extends Error {
  status: number
  body: unknown

  constructor(message: string, status: number, body?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

type RequestOptions = {
  method?: string
  body?: unknown
  auth?: boolean
  formData?: FormData
  signal?: AbortSignal
}

let refreshPromise: Promise<string | null> | null = null

export async function tryRefresh(): Promise<string | null> {
  if (refreshPromise) return refreshPromise
  refreshPromise = (async () => {
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) {
        setAccessToken(null)
        return null
      }
      const data = (await res.json()) as { accessToken?: string }
      if (data.accessToken) {
        setAccessToken(data.accessToken)
        return data.accessToken
      }
      return null
    } catch {
      setAccessToken(null)
      return null
    } finally {
      refreshPromise = null
    }
  })()
  return refreshPromise
}

export async function apiFetch<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = 'GET', body, auth = false, formData, signal } = options
  const headers: Record<string, string> = {}

  if (!formData && body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  let token = getAccessToken()
  if (auth && token) {
    headers.Authorization = `Bearer ${token}`
  }

  const init: RequestInit = {
    method,
    headers,
    credentials: 'include',
    signal,
    body: formData ?? (body !== undefined ? JSON.stringify(body) : undefined),
  }

  let res = await fetch(path, init)

  if (res.status === 401 && auth) {
    token = await tryRefresh()
    if (token) {
      headers.Authorization = `Bearer ${token}`
      res = await fetch(path, { ...init, headers })
    }
  }

  if (!res.ok) {
    let errBody: unknown
    try {
      errBody = await res.json()
    } catch {
      errBody = await res.text().catch(() => null)
    }
    const msg =
      typeof errBody === 'object' && errBody
        ? typeof (errBody as { message?: unknown }).message === 'string'
          ? (errBody as { message: string }).message
          : typeof (errBody as { error?: unknown }).error === 'string'
            ? (errBody as { error: string }).error
            : `Request failed (${res.status})`
        : `Request failed (${res.status})`
    throw new ApiError(msg, res.status, errBody)
  }

  if (res.status === 204) return undefined as T
  const text = await res.text()
  if (!text) return undefined as T
  return JSON.parse(text) as T
}

export async function apiFetchSafe<T>(
  path: string,
  options?: RequestOptions,
  fallback?: T,
): Promise<T> {
  try {
    return await apiFetch<T>(path, options)
  } catch {
    return fallback as T
  }
}

export function buildQuery(
  params: object,
): string {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params as Record<string, unknown>)) {
    if (v === undefined || v === null || v === '') continue
    qs.set(k, String(v))
  }
  const s = qs.toString()
  return s ? `?${s}` : ''
}
