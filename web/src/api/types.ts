export type SeriesStatus = 'ongoing' | 'completed'
export type ContentKind = 'movie' | 'series'
export type EncodeStatus = 'queued' | 'encoding' | 'ready' | 'failed' | 'pending' | 'none'
export type UserRole = 'user' | 'admin' | 'editor'

export interface Genre {
  id: string
  name: string
  slug: string
}

export interface CastMember {
  name: string
  slug?: string
  role?: string
}

export interface Series {
  id: string
  slug: string
  title: string
  synopsis: string
  posterUrl: string
  status: SeriesStatus
  kind?: ContentKind
  year: number
  country?: string
  viewCount: number
  updatedAt: string
  genres?: Genre[]
  latestEpisode?: number
  episodeCount?: number
  qualityLabel?: string
  audioLabel?: string
  isHot?: boolean
  ratingAvg?: number | null
  ratingCount?: number
  userRating?: number | null
  scheduleWeekdays?: number[]
  tagline?: string
  runtimeSec?: number | null
  ageRating?: string
  director?: string
  cast?: CastMember[]
  tags?: string[]
  trailerUrl?: string | null
}

export interface Episode {
  id: string
  seriesId: string
  seasonNumber?: number
  number: number
  title: string
  durationSec: number
  qualityLabel: string
  audioLabel: string
  statusEncode: EncodeStatus
  hlsPath?: string | null
  viewCount: number
  playbackUrl?: string | null
  playbackCandidates?: string[]
  seriesTitle?: string
  seriesSlug?: string
  subtitles?: Array<{ id: number | string; label: string; lang: string; url: string }>
  thumbsVttUrl?: string | null
  audioTracks?: Array<{ index: number; label: string; lang: string; uri?: string }>
  introEndSec?: number | null
  creditsStartSec?: number | null
}

export interface ScheduleItem {
  id: string
  seriesId: string
  weekday: number
  note?: string | null
  series?: Series
}

export interface WatchHistoryItem {
  episodeId: string
  seriesId?: string
  seriesSlug?: string
  seriesTitle?: string
  posterUrl?: string
  episodeNumber: number
  episodeTitle?: string
  positionSec: number
  durationSec?: number
  updatedAt: string
}

export interface HomeResponse {
  hot: Series[]
  latest: Series[]
  scheduleToday: ScheduleItem[]
  ranking: Series[]
  continueWatching?: WatchHistoryItem[]
}

export interface User {
  id: string
  email: string
  displayName: string
  role: UserRole
  avatarUrl?: string | null
}

export interface AuthResponse {
  accessToken: string
  user: User
}

export interface Comment {
  id: string
  userId: string
  episodeId: string
  body: string
  createdAt: string
  displayName?: string
  user?: Pick<User, 'id' | 'displayName' | 'avatarUrl'>
}

export interface EncodeJob {
  id: string
  episodeId: string
  status: EncodeStatus
  progress: number
  error?: string | null
  createdAt: string
  finishedAt?: string | null
}

export interface Paginated<T> {
  items: T[]
  total: number
  page?: number
  pageSize?: number
}

export interface SeriesListParams {
  page?: number
  pageSize?: number
  limit?: number
  status?: SeriesStatus
  kind?: ContentKind
  genre?: string
  year?: number
  country?: string
  q?: string
  sort?: 'updated' | 'views' | 'title' | 'year' | 'rating' | 'oldest'
  preset?: string
  tag?: string
}

export interface SearchParams {
  q?: string
  page?: number
  kind?: ContentKind | ''
  genre?: string
  year?: string
  country?: string
  status?: SeriesStatus | ''
  sort?: string
}

export interface AdminSeriesInput {
  slug: string
  title: string
  synopsis: string
  posterUrl: string
  status: SeriesStatus
  kind?: ContentKind
  year: number
  country?: string
  qualityLabel?: string
  audioLabel?: string
  isHot?: boolean
  genreIds?: string[]
  scheduleWeekdays?: number[]
  scheduleNote?: string
  tagline?: string
  runtimeSec?: number | null
  ageRating?: string
  director?: string
  cast?: Array<string | CastMember>
  tags?: string[]
  trailerUrl?: string | null
}

export interface AdminStats {
  series: number
  episodes: number
  genres: number
  jobsQueued: number
  jobsReady: number
  jobsFailed: number
  totalViews: number
  recentJobs: Array<{
    id: number
    episodeId: number
    status: string
    progress: number
    error?: string | null
    episodeNumber?: number
    seriesTitle?: string
  }>
}

export interface AdminEpisodeInput {
  seriesId: string
  number: number
  seasonNumber?: number
  title: string
  qualityLabel?: string
  audioLabel?: string
  introEndSec?: number | null
  creditsStartSec?: number | null
}

export interface AdminScheduleInput {
  seriesId: string
  weekday: number
  note?: string
}

export interface AdminGenreInput {
  name: string
  slug: string
}
