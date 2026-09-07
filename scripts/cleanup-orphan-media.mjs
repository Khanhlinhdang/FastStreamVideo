import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'

const root = path.resolve('.')
const hlsDir = path.join(root, 'media', 'hls')
const uploadsDir = path.join(root, 'media', 'uploads')
const db = new Database(path.join(root, 'data', 'livestream.db'))

const keep = new Set(
  db
    .prepare(
      `SELECT id FROM episodes WHERE deletedAt IS NULL AND statusEncode = 'ready'`,
    )
    .all()
    .map((r) => r.id),
)

function rmDir(dir) {
  if (!fs.existsSync(dir)) return false
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 })
    console.log('rm', path.relative(root, dir))
    return true
  } catch (e) {
    console.warn('skip', path.relative(root, dir), e.code || e.message)
    return false
  }
}

console.log('keep episodes', [...keep])

if (fs.existsSync(hlsDir)) {
  for (const name of fs.readdirSync(hlsDir)) {
    const full = path.join(hlsDir, name)
    if (!fs.statSync(full).isDirectory()) continue
    const id = Number(name)
    if (Number.isFinite(id) && keep.has(id)) continue
    rmDir(full)
  }
}

if (fs.existsSync(uploadsDir)) {
  for (const name of fs.readdirSync(uploadsDir)) {
    if (name === 'chunks') continue
    const m = /^ep-(\d+)-/.exec(name)
    if (m && !keep.has(Number(m[1]))) rmDir(path.join(uploadsDir, name))
  }
  const chunks = path.join(uploadsDir, 'chunks')
  if (fs.existsSync(chunks)) {
    for (const name of fs.readdirSync(chunks)) {
      const id = Number(String(name).split('-')[0])
      if (!keep.has(id)) rmDir(path.join(chunks, name))
    }
  }
}

console.log(
  'left hls:',
  fs.existsSync(hlsDir) ? fs.readdirSync(hlsDir).join(', ') : '(none)',
)
db.close()
