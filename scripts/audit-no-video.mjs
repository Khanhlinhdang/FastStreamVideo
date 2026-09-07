import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'

const root = path.resolve('.')
const dbPath = path.join(root, 'data', 'livestream.db')
const hlsDir = path.join(root, 'media', 'hls')

const db = new Database(dbPath)

const eps = db
  .prepare(
    `SELECT e.id, e.seriesId, e.number, e.title, e.statusEncode, e.hlsPath, e.sourcePath, e.deletedAt,
            s.title as seriesTitle, s.slug, s.kind
     FROM episodes e
     JOIN series s ON s.id = e.seriesId
     WHERE e.deletedAt IS NULL AND s.deletedAt IS NULL
     ORDER BY e.seriesId, e.number`,
  )
  .all()

function hasPlayableVideo(ep) {
  if (ep.statusEncode === 'ready' && ep.hlsPath) {
    const masterA = path.join(hlsDir, String(ep.id), 'master.m3u8')
    if (fs.existsSync(masterA)) return true
    // legacy relative path under media/
    if (typeof ep.hlsPath === 'string') {
      const cleaned = ep.hlsPath.replace(/^\/?media\//, '')
      const abs = path.join(root, 'media', cleaned)
      if (fs.existsSync(abs)) return true
      const alt = path.join(hlsDir, cleaned)
      if (fs.existsSync(alt)) return true
    }
  }
  return false
}

console.log('--- episodes ---')
for (const e of eps) {
  const ok = hasPlayableVideo(e)
  console.log(
    `${ok ? 'HAS' : 'NO '} video | ep=${e.id} series=${e.seriesId} #${e.number} ${e.statusEncode} | ${e.seriesTitle} / ${e.title} | hls=${e.hlsPath}`,
  )
}

const series = db
  .prepare(`SELECT id, slug, title, kind FROM series WHERE deletedAt IS NULL ORDER BY id`)
  .all()

console.log('\n--- series summary ---')
for (const s of series) {
  const children = eps.filter((e) => e.seriesId === s.id)
  const withVideo = children.filter(hasPlayableVideo)
  console.log(
    `series=${s.id} ${s.slug} | eps=${children.length} withVideo=${withVideo.length} | ${s.title}`,
  )
}

const hlsFolders = fs.existsSync(hlsDir)
  ? fs.readdirSync(hlsDir).filter((n) => fs.statSync(path.join(hlsDir, n)).isDirectory())
  : []
console.log('\nHLS folders:', hlsFolders.join(', '))
