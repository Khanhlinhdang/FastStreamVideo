import {
  ApiError,
  apiFetch,
  apiFetchSafe,
  buildQuery,
  getAccessToken,
  tryRefresh,
} from './client'
import type {
  AdminEpisodeInput,
  AdminGenreInput,
  AdminScheduleInput,
  AdminSeriesInput,
  AdminStats,
  AuthResponse,
  Comment,
  EncodeJob,
  Episode,
  Genre,
  HomeResponse,
  Paginated,
  ScheduleItem,
  SearchParams,
  Series,
  SeriesListParams,
  User,
  WatchHistoryItem,
} from './types'

function unwrapList<T>(data: T[] | Paginated<T> | null | undefined): T[] {
  if (!data) return []
  if (Array.isArray(data)) return data
  return data.items ?? []
}

function asId(value: unknown): string {
  return String(value ?? '')
}

function toNum(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

/** Normalize history / continue-watching rows from API → UI shape */
function mapWatchHistory(raw: Record<string, unknown>): WatchHistoryItem {
  const series = (raw.series as Record<string, unknown> | undefined) ?? undefined
  const episodeId = asId(raw.episodeId ?? raw.id)
  return {
    episodeId,
    seriesId: raw.seriesId != null ? asId(raw.seriesId) : series?.id != null ? asId(series.id) : undefined,
    seriesSlug: (raw.seriesSlug as string | undefined) ?? (series?.slug as string | undefined),
    seriesTitle: (raw.seriesTitle as string | undefined) ?? (series?.title as string | undefined),
    posterUrl:
      (raw.posterUrl as string | undefined) ??
      (series?.posterUrl as string | undefined) ??
      undefined,
    episodeNumber: toNum(raw.episodeNumber ?? raw.number),
    episodeTitle: (raw.episodeTitle as string | undefined) ?? (raw.title as string | undefined),
    positionSec: toNum(raw.positionSec),
    durationSec: raw.durationSec != null ? toNum(raw.durationSec) : undefined,
    updatedAt: asId(raw.updatedAt ?? raw.watchedAt ?? ''),
  }
}

/**
 * Schedule API returns flat series rows with weekday/scheduleNote/scheduleId.
 * UI expects ScheduleItem with nested `series`.
 */
function mapScheduleItem(raw: Record<string, unknown>): ScheduleItem {
  if (raw.series && typeof raw.series === 'object') {
    const series = raw.series as Series
    return {
      id: asId(raw.id ?? raw.scheduleId),
      seriesId: asId(raw.seriesId ?? series.id),
      weekday: toNum(raw.weekday),
      note: (raw.note as string | null | undefined) ?? (raw.scheduleNote as string | null | undefined),
      series,
    }
  }

  const {
    weekday,
    scheduleNote,
    scheduleId,
    note,
    seriesTitle,
    seriesSlug,
    ...rest
  } = raw

  const series = rest as unknown as Series
  return {
    id: asId(scheduleId ?? raw.id),
    seriesId: asId(raw.seriesId ?? series.id),
    weekday: toNum(weekday),
    note: (note as string | null | undefined) ?? (scheduleNote as string | null | undefined) ?? (seriesTitle as string | undefined),
    series: {
      ...series,
      id: asId(series.id),
      slug: (series.slug as string) || asId(seriesSlug),
      title: (series.title as string) || asId(seriesTitle),
    },
  }
}

function mapComment(raw: Record<string, unknown>): Comment {
  const user =
    raw.user && typeof raw.user === 'object'
      ? (raw.user as Comment['user'])
      : {
          id: asId(raw.userId),
          displayName: asId(raw.displayName || 'Người dùng'),
          avatarUrl: (raw.avatarUrl as string | null | undefined) ?? null,
        }
  return {
    id: asId(raw.id),
    userId: asId(raw.userId ?? user?.id),
    episodeId: asId(raw.episodeId),
    body: asId(raw.body),
    createdAt: asId(raw.createdAt),
    displayName: (raw.displayName as string | undefined) ?? user?.displayName,
    user,
  }
}

function mapEncodeJob(raw: Record<string, unknown> | null): EncodeJob | null {
  if (!raw) return null
  return {
    id: asId(raw.id),
    episodeId: asId(raw.episodeId),
    status: raw.status as EncodeJob['status'],
    progress: toNum(raw.progress),
    error: (raw.error as string | null | undefined) ?? null,
    createdAt: asId(raw.createdAt),
    finishedAt: (raw.finishedAt as string | null | undefined) ?? null,
  }
}

export const api = {
  home: async () => {
    const data = await apiFetchSafe<HomeResponse & { continueWatching?: unknown[] }>(
      '/api/home',
      { auth: true },
      { hot: [], latest: [], scheduleToday: [], ranking: [], continueWatching: [] },
    )
    return {
      ...data,
      scheduleToday: (data.scheduleToday ?? []).map((item) =>
        mapScheduleItem(item as unknown as Record<string, unknown>),
      ),
      continueWatching: (data.continueWatching ?? []).map((item) =>
        mapWatchHistory(item as unknown as Record<string, unknown>),
      ),
    } satisfies HomeResponse
  },

  seriesList: async (params: SeriesListParams = {}) => {
    const { pageSize, ...rest } = params
    const query = {
      ...rest,
      limit: params.limit ?? pageSize,
    }
    const data = await apiFetchSafe<Series[] | Paginated<Series>>(
      `/api/series${buildQuery(query)}`,
      {},
      [],
    )
    return unwrapList(data)
  },

  seriesBySlug: (slug: string) =>
    apiFetchSafe<Series | null>(`/api/series/${encodeURIComponent(slug)}`, { auth: true }, null),

  episodes: async (slug: string) => {
    const data = await apiFetchSafe<Episode[] | Paginated<Episode>>(
      `/api/series/${encodeURIComponent(slug)}/episodes`,
      {},
      [],
    )
    return unwrapList(data)
  },

  genres: async () => {
    const data = await apiFetchSafe<Genre[] | Paginated<Genre>>('/api/genres', {}, [])
    return unwrapList(data)
  },

  search: async (params: string | SearchParams, page = 1) => {
    const query =
      typeof params === 'string'
        ? { q: params, page }
        : { page: params.page ?? page, ...params }
    const data = await apiFetchSafe<Series[] | Paginated<Series>>(
      `/api/search${buildQuery(query)}`,
      {},
      [],
    )
    return unwrapList(data)
  },

  related: async (slug: string, limit = 12) => {
    const data = await apiFetchSafe<Series[] | Paginated<Series>>(
      `/api/series/${encodeURIComponent(slug)}/related${buildQuery({ limit })}`,
      {},
      [],
    )
    return unwrapList(data)
  },

  personalized: async () => {
    const data = await apiFetchSafe<Series[] | Paginated<Series>>(
      '/api/me/personalized',
      { auth: true },
      [],
    )
    return unwrapList(data)
  },

  person: async (personSlug: string) =>
    apiFetchSafe<{ slug: string; name: string; items: Series[] } | null>(
      `/api/people/${encodeURIComponent(personSlug)}`,
      {},
      null,
    ),

  forgotPassword: (email: string) =>
    apiFetch<{ ok: boolean; devToken?: string }>('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  resetPassword: (token: string, password: string) =>
    apiFetch<{ ok: boolean }>('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    }),

  schedule: async () => {
    const data = await apiFetchSafe<
      ScheduleItem[] | Paginated<ScheduleItem> | { items?: unknown[]; byWeekday?: unknown }
    >('/api/schedule', {}, [])
    const list = Array.isArray(data) ? data : unwrapList(data as Paginated<ScheduleItem>)
    return list.map((item) => mapScheduleItem(item as unknown as Record<string, unknown>))
  },

  ranking: async () => {
    const data = await apiFetchSafe<Series[] | Paginated<Series>>('/api/ranking', {}, [])
    return unwrapList(data)
  },

  completed: async (page = 1) => {
    const data = await apiFetchSafe<Series[] | Paginated<Series>>(
      `/api/completed${buildQuery({ page })}`,
      {},
      [],
    )
    return unwrapList(data)
  },

  register: (body: { email: string; password: string; displayName: string }) =>
    apiFetch<AuthResponse>('/api/auth/register', { method: 'POST', body }),

  login: (body: { email: string; password: string }) =>
    apiFetch<AuthResponse>('/api/auth/login', { method: 'POST', body }),

  logout: () => apiFetch<void>('/api/auth/logout', { method: 'POST', auth: true }),

  me: async () => {
    const data = await apiFetchSafe<User | { user: User } | null>(
      '/api/me',
      { auth: true },
      null,
    )
    if (!data) return null
    if ('user' in data && data.user) return data.user
    if ('email' in data && 'id' in data) return data as User
    return null
  },

  favorites: async () => {
    const data = await apiFetchSafe<Series[] | Paginated<Series>>(
      '/api/me/favorites',
      { auth: true },
      [],
    )
    return unwrapList(data)
  },

  addFavorite: (seriesId: string | number) =>
    apiFetch<void>('/api/me/favorites', {
      method: 'POST',
      auth: true,
      body: { seriesId: toNum(seriesId) },
    }),

  removeFavorite: (seriesId: string | number) =>
    apiFetch<void>(`/api/me/favorites/${encodeURIComponent(String(seriesId))}`, {
      method: 'DELETE',
      auth: true,
    }),

  history: async () => {
    const data = await apiFetchSafe<unknown[] | Paginated<unknown>>(
      '/api/me/history',
      { auth: true },
      [],
    )
    return unwrapList(data).map((item) => mapWatchHistory(item as Record<string, unknown>))
  },

  putHistory: (body: { episodeId: string | number; positionSec: number }) =>
    apiFetch<void>('/api/me/history', {
      method: 'PUT',
      auth: true,
      body: { episodeId: toNum(body.episodeId), positionSec: body.positionSec },
    }),

  getComments: async (episodeId: string | number) => {
    const data = await apiFetchSafe<Comment[] | Paginated<Comment>>(
      `/api/episodes/${encodeURIComponent(String(episodeId))}/comments`,
      {},
      [],
    )
    return unwrapList(data).map((c) => mapComment(c as unknown as Record<string, unknown>))
  },

  postComment: async (episodeId: string | number, body: string) => {
    const raw = await apiFetch<Record<string, unknown>>(
      `/api/episodes/${encodeURIComponent(String(episodeId))}/comments`,
      {
        method: 'POST',
        auth: true,
        body: { body },
      },
    )
    return mapComment(raw)
  },

  deleteComment: (commentId: string | number) =>
    apiFetch<void>(`/api/comments/${encodeURIComponent(String(commentId))}`, {
      method: 'DELETE',
      auth: true,
    }),

  // Admin
  adminStats: () =>
    apiFetchSafe<AdminStats>(
      '/api/admin/stats',
      { auth: true },
      {
        series: 0,
        episodes: 0,
        genres: 0,
        jobsQueued: 0,
        jobsReady: 0,
        jobsFailed: 0,
        totalViews: 0,
        recentJobs: [],
      },
    ),

  adminSeriesList: async (params?: { q?: string; status?: string; country?: string }) => {
    const data = await apiFetchSafe<Series[] | Paginated<Series>>(
      `/api/admin/series${buildQuery(params ?? {})}`,
      { auth: true },
      [],
    )
    return unwrapList(data)
  },

  adminCreateSeries: (body: AdminSeriesInput) =>
    apiFetch<Series & { movieEpisodeId?: string | number }>('/api/admin/series', {
      method: 'POST',
      auth: true,
      body: {
        ...body,
        year: toNum(body.year),
        genreIds: body.genreIds?.map(toNum),
        scheduleWeekdays: body.scheduleWeekdays,
      },
    }),

  adminUpdateSeries: (id: string, body: Partial<AdminSeriesInput>) =>
    apiFetch<Series>(`/api/admin/series/${encodeURIComponent(id)}`, {
      method: 'PUT',
      auth: true,
      body: {
        ...body,
        year: body.year != null ? toNum(body.year) : undefined,
        genreIds: body.genreIds?.map(toNum),
        scheduleWeekdays: body.scheduleWeekdays,
      },
    }),

  adminDeleteSeries: (id: string) =>
    apiFetch<void>(`/api/admin/series/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      auth: true,
    }),

  adminUploadPoster: async (seriesId: string, file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return apiFetch<Series>(`/api/admin/series/${encodeURIComponent(seriesId)}/poster`, {
      method: 'POST',
      auth: true,
      formData: fd,
    })
  },

  adminEpisodes: async (params?: string | { seriesId?: string; q?: string }) => {
    const query =
      typeof params === 'string'
        ? buildQuery({ seriesId: params })
        : buildQuery(params ?? {})
    const data = await apiFetchSafe<Episode[] | Paginated<Episode>>(
      `/api/admin/episodes${query}`,
      { auth: true },
      [],
    )
    return unwrapList(data).map((ep) => ({
      ...ep,
      id: asId(ep.id),
      seriesId: asId(ep.seriesId),
    }))
  },

  adminCreateEpisode: async (body: AdminEpisodeInput) => {
    const ep = await apiFetch<Episode>('/api/admin/episodes', {
      method: 'POST',
      auth: true,
      body: {
        ...body,
        seriesId: toNum(body.seriesId),
        number: toNum(body.number),
      },
    })
    return {
      ...ep,
      id: asId(ep.id),
      seriesId: asId(ep.seriesId),
    }
  },

  adminUpdateEpisode: (id: string, body: Partial<AdminEpisodeInput>) =>
    apiFetch<Episode>(`/api/admin/episodes/${encodeURIComponent(id)}`, {
      method: 'PUT',
      auth: true,
      body: {
        ...body,
        seriesId: body.seriesId != null ? toNum(body.seriesId) : undefined,
        number: body.number != null ? toNum(body.number) : undefined,
        introEndSec:
          body.introEndSec === undefined
            ? undefined
            : body.introEndSec == null
              ? null
              : toNum(body.introEndSec),
        creditsStartSec:
          body.creditsStartSec === undefined
            ? undefined
            : body.creditsStartSec == null
              ? null
              : toNum(body.creditsStartSec),
      },
    }),

  adminDeleteEpisode: (id: string) =>
    apiFetch<void>(`/api/admin/episodes/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      auth: true,
    }),

  /**
   * Upload video — uses chunked resumable API for files ≥2MB (byte progress + no gateway timeout).
   * Smaller files still use single multipart for speed.
   */
  adminUpload: async (
    episodeId: string,
    file: File,
    onProgress?: (p: { loaded: number; total: number; percent: number; phase: string }) => void,
  ) => {
    const CHUNK_THRESHOLD = 2 * 1024 * 1024
    const CHUNK_SIZE = 4 * 1024 * 1024
    const total = file.size || 1

    const report = (loaded: number, phase: string) => {
      onProgress?.({
        loaded,
        total,
        percent: Math.min(100, Math.round((loaded / total) * 100)),
        phase,
      })
    }

    async function authFetch(path: string, init: RequestInit): Promise<Response> {
      let token = getAccessToken()
      const headers = new Headers(init.headers)
      if (token) headers.set('Authorization', `Bearer ${token}`)
      let res = await fetch(path, { ...init, headers, credentials: 'include' })
      if (res.status === 401) {
        token = await tryRefresh()
        if (token) {
          headers.set('Authorization', `Bearer ${token}`)
          res = await fetch(path, { ...init, headers, credentials: 'include' })
        }
      }
      return res
    }

    if (file.size < CHUNK_THRESHOLD) {
      report(0, 'upload')
      const fd = new FormData()
      fd.append('file', file)
      const res = await apiFetch<{ jobId: string | number; job?: EncodeJob; ok?: boolean }>(
        `/api/admin/episodes/${encodeURIComponent(episodeId)}/upload`,
        { method: 'POST', auth: true, formData: fd },
      )
      report(total, 'done')
      return {
        jobId: asId(res.jobId),
        job: res.job ? mapEncodeJob(res.job as unknown as Record<string, unknown>) ?? undefined : undefined,
      }
    }

    report(0, 'init')
    const initRes = await authFetch(
      `/api/admin/episodes/${encodeURIComponent(episodeId)}/upload/init`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, size: file.size }),
      },
    )
    if (!initRes.ok) {
      const errBody = await initRes.json().catch(() => ({}))
      throw new ApiError(
        typeof (errBody as { error?: string }).error === 'string'
          ? (errBody as { error: string }).error
          : `Upload init failed (${initRes.status})`,
        initRes.status,
        errBody,
      )
    }
    const { uploadId } = (await initRes.json()) as { uploadId: string }

    let loaded = 0
    let part = 0
    while (loaded < file.size) {
      const end = Math.min(loaded + CHUNK_SIZE, file.size)
      const blob = file.slice(loaded, end)
      report(loaded, 'parts')
      const putRes = await authFetch(
        `/api/admin/episodes/${encodeURIComponent(episodeId)}/upload/${encodeURIComponent(uploadId)}/${part}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: blob,
        },
      )
      if (!putRes.ok) {
        const errBody = await putRes.json().catch(() => ({}))
        throw new ApiError(
          typeof (errBody as { error?: string }).error === 'string'
            ? (errBody as { error: string }).error
            : `Upload part ${part} failed (${putRes.status})`,
          putRes.status,
          errBody,
        )
      }
      loaded = end
      part += 1
      report(loaded, 'parts')
    }

    report(total, 'complete')
    const doneRes = await authFetch(
      `/api/admin/episodes/${encodeURIComponent(episodeId)}/upload/${encodeURIComponent(uploadId)}/complete`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
    )
    if (!doneRes.ok) {
      const errBody = await doneRes.json().catch(() => ({}))
      throw new ApiError(
        typeof (errBody as { error?: string }).error === 'string'
          ? (errBody as { error: string }).error
          : `Upload complete failed (${doneRes.status})`,
        doneRes.status,
        errBody,
      )
    }
    const res = (await doneRes.json()) as {
      jobId: string | number
      job?: EncodeJob
      ok?: boolean
    }
    report(total, 'done')
    return {
      jobId: asId(res.jobId),
      job: res.job ? mapEncodeJob(res.job as unknown as Record<string, unknown>) ?? undefined : undefined,
    }
  },

  adminUploadSubtitle: async (
    episodeId: string,
    file: File,
    opts?: { label?: string; lang?: string },
  ) => {
    const fd = new FormData()
    fd.append('file', file)
    if (opts?.label) fd.append('label', opts.label)
    if (opts?.lang) fd.append('lang', opts.lang)
    return apiFetch<{ ok: boolean; id: number; label: string; lang: string; url: string }>(
      `/api/admin/episodes/${encodeURIComponent(episodeId)}/subtitles`,
      { method: 'POST', auth: true, formData: fd },
    )
  },

  adminListSubtitles: async (episodeId: string) => {
    const data = await apiFetchSafe<{ items: Array<{ id: number; label: string; lang: string; url: string }> }>(
      `/api/admin/episodes/${encodeURIComponent(episodeId)}/subtitles`,
      { auth: true },
      { items: [] },
    )
    return data.items
  },

  adminDeleteSubtitle: (episodeId: string, subId: string | number) =>
    apiFetch<{ ok: boolean }>(
      `/api/admin/episodes/${encodeURIComponent(episodeId)}/subtitles/${encodeURIComponent(String(subId))}`,
      { method: 'DELETE', auth: true },
    ),

  adminUploadAudio: async (
    episodeId: string,
    file: File,
    opts?: { label?: string; lang?: string },
  ) => {
    const fd = new FormData()
    fd.append('file', file)
    if (opts?.label) fd.append('label', opts.label)
    if (opts?.lang) fd.append('lang', opts.lang)
    return apiFetch<{
      ok: boolean
      id: number
      packaged: boolean
      tracks: unknown[]
      note?: string
    }>(`/api/admin/episodes/${encodeURIComponent(episodeId)}/audio`, {
      method: 'POST',
      auth: true,
      formData: fd,
    })
  },

  adminListAudio: async (episodeId: string) => {
    return apiFetchSafe<{ items: unknown[]; hlsTracks: unknown[] }>(
      `/api/admin/episodes/${encodeURIComponent(episodeId)}/audio`,
      { auth: true },
      { items: [], hlsTracks: [] },
    )
  },

  adminFlaggedComments: async () => {
    const data = await apiFetchSafe<
      | Array<{
          id: number
          body: string
          flagCount: number
          hiddenAt: string | null
          episodeId: number
          createdAt: string
          displayName: string
          episodeNumber?: number
          seriesTitle?: string
        }>
      | { items: Array<{
          id: number
          body: string
          flagCount: number
          hiddenAt: string | null
          episodeId: number
          createdAt: string
          displayName: string
          episodeNumber?: number
          seriesTitle?: string
        }> }
    >('/api/admin/comments/flagged', { auth: true }, { items: [] })
    return Array.isArray(data) ? data : data.items
  },

  adminHideComment: (id: string | number) =>
    apiFetch<{ ok: boolean }>(`/api/admin/comments/${encodeURIComponent(String(id))}/hide`, {
      method: 'POST',
      auth: true,
      body: {},
    }),

  adminUnhideComment: (id: string | number) =>
    apiFetch<{ ok: boolean }>(`/api/admin/comments/${encodeURIComponent(String(id))}/unhide`, {
      method: 'POST',
      auth: true,
      body: {},
    }),

  adminDeleteComment: (id: string | number) =>
    apiFetch<{ ok: boolean }>(`/api/admin/comments/${encodeURIComponent(String(id))}`, {
      method: 'DELETE',
      auth: true,
    }),

  adminDiskUsage: () =>
    apiFetchSafe<{ hlsBytes: number; uploadsBytes: number; totalBytes: number }>(
      '/api/admin/disk-usage',
      { auth: true },
      { hlsBytes: 0, uploadsBytes: 0, totalBytes: 0 },
    ),

  adminPurgeJobs: (olderThanDays = 30) =>
    apiFetch<{ ok: boolean; deleted: number }>(`/api/admin/jobs/purge`, {
      method: 'POST',
      auth: true,
      body: { olderThanDays },
    }),

  adminJob: async (jobId: string) => {
    const raw = await apiFetchSafe<Record<string, unknown> | null>(
      `/api/admin/jobs/${encodeURIComponent(jobId)}`,
      { auth: true },
      null,
    )
    return mapEncodeJob(raw)
  },

  adminJobs: async () => {
    const data = await apiFetchSafe<EncodeJob[] | Paginated<EncodeJob>>(
      '/api/admin/jobs',
      { auth: true },
      [],
    )
    return unwrapList(data).map((j) => mapEncodeJob(j as unknown as Record<string, unknown>)!)
  },

  adminRetryJob: async (jobId: string) => {
    const res = await apiFetch<{ ok: boolean; job?: Record<string, unknown> }>(
      `/api/admin/jobs/${encodeURIComponent(jobId)}/retry`,
      { method: 'POST', auth: true, body: {} },
    )
    return {
      ok: res.ok,
      job: res.job ? mapEncodeJob(res.job) : null,
    }
  },

  adminClearJob: (jobId: string) =>
    apiFetch<{ ok: boolean }>(`/api/admin/jobs/${encodeURIComponent(jobId)}`, {
      method: 'DELETE',
      auth: true,
    }),

  adminPlaybackStats: (sinceHours = 24) =>
    apiFetch<{
      sinceHours: number
      totals: Array<{ type: string; c: number; avgMs: number | null }>
      items: Array<{
        episodeId: number
        episodeNumber?: number
        seriesTitle?: string
        type: string
        eventCount: number
        avgDurationMs: number | null
      }>
    }>(`/api/admin/playback-stats?since=${sinceHours}`, { auth: true }),

  recordView: (episodeId: string | number) =>
    apiFetchSafe<{ ok: boolean; seriesViewCount?: number; episodeViewCount?: number }>(
      `/api/episodes/${encodeURIComponent(String(episodeId))}/view`,
      { method: 'POST', body: {} },
      { ok: false },
    ),

  rateSeries: (seriesId: string | number, score: number) =>
    apiFetch<{ ratingAvg: number | null; ratingCount: number; userRating: number | null }>(
      `/api/series/${encodeURIComponent(String(seriesId))}/rating`,
      { method: 'POST', auth: true, body: { score } },
    ),

  adminGenres: async () => {
    const data = await apiFetchSafe<Genre[] | Paginated<Genre>>(
      '/api/admin/genres',
      { auth: true },
      [],
    )
    return unwrapList(data)
  },

  adminCreateGenre: (body: AdminGenreInput) =>
    apiFetch<Genre>('/api/admin/genres', { method: 'POST', auth: true, body }),

  adminSchedule: async () => {
    const data = await apiFetchSafe<unknown[] | Paginated<unknown>>(
      '/api/admin/schedule',
      { auth: true },
      [],
    )
    return unwrapList(data).map((item) => mapScheduleItem(item as Record<string, unknown>))
  },

  adminCreateSchedule: (body: AdminScheduleInput) =>
    apiFetch<ScheduleItem>('/api/admin/schedule', {
      method: 'POST',
      auth: true,
      body: {
        seriesId: toNum(body.seriesId),
        weekday: toNum(body.weekday),
        note: body.note,
      },
    }),

  adminDeleteSchedule: (id: string) =>
    apiFetch<void>(`/api/admin/schedule/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      auth: true,
    }),
}

/** Fallback when episode.playbackUrl is missing — matches backend static layout */
export function mediaUrl(episodeId: string | number): string {
  return `/media/hls/${encodeURIComponent(String(episodeId))}/master.m3u8`
}
