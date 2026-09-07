import Database from 'better-sqlite3'
import path from 'node:path'

const db = new Database(path.join(path.resolve('.'), 'data', 'livestream.db'))
db.pragma('foreign_keys = ON')

const tx = db.transaction(() => {
  // Remove soft-deleted episodes and dependents first
  const deadEps = db
    .prepare(`SELECT id FROM episodes WHERE deletedAt IS NOT NULL`)
    .all()
    .map((r) => r.id)
  if (deadEps.length) {
    const ph = deadEps.map(() => '?').join(',')
    db.prepare(`DELETE FROM encode_jobs WHERE episodeId IN (${ph})`).run(...deadEps)
    db.prepare(`DELETE FROM watch_history WHERE episodeId IN (${ph})`).run(...deadEps)
    db.prepare(`DELETE FROM comments WHERE episodeId IN (${ph})`).run(...deadEps)
    db.prepare(`DELETE FROM playback_events WHERE episodeId IN (${ph})`).run(...deadEps)
    db.prepare(`DELETE FROM episode_subtitles WHERE episodeId IN (${ph})`).run(...deadEps)
    db.prepare(`DELETE FROM episode_audio_tracks WHERE episodeId IN (${ph})`).run(...deadEps)
    db.prepare(`DELETE FROM episodes WHERE id IN (${ph})`).run(...deadEps)
  }

  const deadSeries = db
    .prepare(`SELECT id FROM series WHERE deletedAt IS NOT NULL`)
    .all()
    .map((r) => r.id)
  if (deadSeries.length) {
    const ph = deadSeries.map(() => '?').join(',')
    db.prepare(`DELETE FROM schedule WHERE seriesId IN (${ph})`).run(...deadSeries)
    db.prepare(`DELETE FROM favorites WHERE seriesId IN (${ph})`).run(...deadSeries)
    db.prepare(`DELETE FROM ratings WHERE seriesId IN (${ph})`).run(...deadSeries)
    db.prepare(`DELETE FROM series_genres WHERE seriesId IN (${ph})`).run(...deadSeries)
    db.prepare(`DELETE FROM episodes WHERE seriesId IN (${ph})`).run(...deadSeries)
    db.prepare(`DELETE FROM series WHERE id IN (${ph})`).run(...deadSeries)
  }
})

tx()

const series = db.prepare(`SELECT id, slug, title FROM series`).all()
const eps = db.prepare(`SELECT id, seriesId, number, title, statusEncode FROM episodes`).all()
console.log('Hard purge done.')
console.log('series:', series)
console.log('episodes:', eps)
db.close()
