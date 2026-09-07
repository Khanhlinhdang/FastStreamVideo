/**
 * Remove catalog rows that do not have playable local HLS (master.m3u8).
 * Soft-deletes episodes/series (matches app queries), purges related rows,
 * cancels encode jobs, and removes orphan HLS folders.
 */
import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'

const root = path.resolve('.')
const dbPath = path.join(root, 'data', 'livestream.db')
const hlsDir = path.join(root, 'media', 'hls')
const uploadsDir = path.join(root, 'media', 'uploads')

const db = new Database(dbPath)
db.pragma('foreign_keys = ON')

function hasPlayableVideo(ep) {
  if (ep.statusEncode !== 'ready' || !ep.hlsPath) return false
  const masterA = path.join(hlsDir, String(ep.id), 'master.m3u8')
  if (fs.existsSync(masterA)) return true
  if (typeof ep.hlsPath === 'string') {
    const cleaned = ep.hlsPath.replace(/^\/?media\//, '')
    const abs = path.join(root, 'media', cleaned)
    if (fs.existsSync(abs)) return true
  }
  return false
}

function rmDir(dir) {
  if (!fs.existsSync(dir)) return false
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
    return true
  } catch (err) {
    console.warn('Skip locked/unremovable:', dir, err.code || err.message)
    return false
  }
}

const eps = db
  .prepare(
    `SELECT e.*, s.slug as seriesSlug, s.title as seriesTitle
     FROM episodes e
     JOIN series s ON s.id = e.seriesId
     WHERE e.deletedAt IS NULL AND s.deletedAt IS NULL`,
  )
  .all()

const keepEpisodeIds = new Set()
const dropEpisodeIds = []
for (const e of eps) {
  if (hasPlayableVideo(e)) keepEpisodeIds.add(e.id)
  else dropEpisodeIds.push(e.id)
}

const seriesRows = db
  .prepare(`SELECT id, slug, title FROM series WHERE deletedAt IS NULL`)
  .all()

const dropSeriesIds = []
const keepSeriesIds = new Set()
for (const s of seriesRows) {
  const children = eps.filter((e) => e.seriesId === s.id)
  const keepKids = children.filter((e) => keepEpisodeIds.has(e.id))
  if (keepKids.length === 0) dropSeriesIds.push(s.id)
  else keepSeriesIds.add(s.id)
}

console.log('Keep episodes:', [...keepEpisodeIds].join(', ') || '(none)')
console.log('Drop episodes:', dropEpisodeIds.join(', ') || '(none)')
console.log('Drop series:', dropSeriesIds.join(', ') || '(none)')

const tx = db.transaction(() => {
  const now = `datetime('now')`

  if (dropEpisodeIds.length) {
    const ph = dropEpisodeIds.map(() => '?').join(',')
    db.prepare(`DELETE FROM encode_jobs WHERE episodeId IN (${ph})`).run(...dropEpisodeIds)
    db.prepare(`DELETE FROM watch_history WHERE episodeId IN (${ph})`).run(...dropEpisodeIds)
    db.prepare(`DELETE FROM comments WHERE episodeId IN (${ph})`).run(...dropEpisodeIds)
    db.prepare(`DELETE FROM playback_events WHERE episodeId IN (${ph})`).run(...dropEpisodeIds)
    db.prepare(`DELETE FROM episode_subtitles WHERE episodeId IN (${ph})`).run(...dropEpisodeIds)
    db.prepare(`DELETE FROM episode_audio_tracks WHERE episodeId IN (${ph})`).run(...dropEpisodeIds)
    db.prepare(
      `UPDATE episodes SET deletedAt = ${now}, statusEncode = 'none', hlsPath = NULL, sourcePath = NULL, updatedAt = ${now}
       WHERE id IN (${ph})`,
    ).run(...dropEpisodeIds)
  }

  if (dropSeriesIds.length) {
    const ph = dropSeriesIds.map(() => '?').join(',')
    db.prepare(`DELETE FROM schedule WHERE seriesId IN (${ph})`).run(...dropSeriesIds)
    db.prepare(`DELETE FROM favorites WHERE seriesId IN (${ph})`).run(...dropSeriesIds)
    db.prepare(`DELETE FROM ratings WHERE seriesId IN (${ph})`).run(...dropSeriesIds)
    db.prepare(`DELETE FROM series_genres WHERE seriesId IN (${ph})`).run(...dropSeriesIds)
    // Soft-delete any remaining episodes under those series
    db.prepare(
      `UPDATE episodes SET deletedAt = ${now}, updatedAt = ${now}
       WHERE seriesId IN (${ph}) AND deletedAt IS NULL`,
    ).run(...dropSeriesIds)
    db.prepare(
      `UPDATE series SET deletedAt = ${now}, updatedAt = ${now} WHERE id IN (${ph})`,
    ).run(...dropSeriesIds)
  }

  // Hard-purge already soft-deleted empty noise (optional hard delete of soft rows)
  // Keep soft-deleted for audit; user asked to remove catalog without video — soft is enough for UI.
})

tx()

// Remove HLS trees that are not for kept ready episodes
let removedHls = 0
if (fs.existsSync(hlsDir)) {
  for (const name of fs.readdirSync(hlsDir)) {
    const full = path.join(hlsDir, name)
    if (!fs.statSync(full).isDirectory()) continue
    const id = Number(name)
    if (Number.isFinite(id) && keepEpisodeIds.has(id)) continue
    // keep non-numeric test folders? User asked to remove data without real video — remove orphans
    if (rmDir(full)) {
      removedHls += 1
      console.log('Removed HLS folder:', name)
    }
  }
}

// Remove upload sources for dropped episodes (ep-{id}-*)
let removedUploads = 0
if (fs.existsSync(uploadsDir)) {
  for (const name of fs.readdirSync(uploadsDir)) {
    const m = /^ep-(\d+)-/.exec(name)
    if (!m) continue
    const id = Number(m[1])
    if (keepEpisodeIds.has(id)) continue
    const full = path.join(uploadsDir, name)
    try {
      fs.rmSync(full, { recursive: true, force: true })
      removedUploads += 1
      console.log('Removed upload:', name)
    } catch {
      /* ignore */
    }
  }
  const chunksDir = path.join(uploadsDir, 'chunks')
  if (fs.existsSync(chunksDir)) {
    for (const name of fs.readdirSync(chunksDir)) {
      const id = Number(String(name).split('-')[0])
      if (keepEpisodeIds.has(id)) continue
      if (rmDir(path.join(chunksDir, name))) {
        console.log('Removed chunk session:', name)
      }
    }
  }
}

// Verify
const leftSeries = db
  .prepare(`SELECT id, slug, title FROM series WHERE deletedAt IS NULL`)
  .all()
const leftEps = db
  .prepare(
    `SELECT id, seriesId, number, title, statusEncode, hlsPath FROM episodes WHERE deletedAt IS NULL`,
  )
  .all()

console.log('\n=== AFTER CLEANUP ===')
console.log('Series left:', leftSeries.length)
for (const s of leftSeries) console.log(`  #${s.id} ${s.slug} — ${s.title}`)
console.log('Episodes left:', leftEps.length)
for (const e of leftEps) console.log(`  ep=${e.id} series=${e.seriesId} #${e.number} ${e.statusEncode} ${e.title}`)
console.log(`Removed HLS folders: ${removedHls}, upload files: ${removedUploads}`)

db.close()
