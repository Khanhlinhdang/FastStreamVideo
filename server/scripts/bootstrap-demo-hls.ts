/**
 * Non-destructive: download open-movie samples + encode demo episodes if not ready.
 * Safe for Docker entrypoint after seed-if-empty (does NOT wipe DB).
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { config, REPO_ROOT } from '../src/config.js'
import { getDb, migrate, closeDb } from '../src/db/index.js'
import { encodeEpisodeHls } from '../src/services/encodeQueue.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const serverRoot = path.resolve(__dirname, '..')
const fast = process.env.DEMO_FULL !== '1'

function checkBin(bin: string): boolean {
  const r = spawnSync(bin, ['-version'], { encoding: 'utf8', windowsHide: true })
  return r.status === 0
}

async function ensureDownloads(): Promise<Record<string, string>> {
  const localTest = path.join(REPO_ROOT, 'test-video.mp4')
  const demoDir = path.join(config.uploadsDir, 'demo')
  const manifestPath = path.join(demoDir, 'manifest.json')

  if (!fs.existsSync(manifestPath)) {
    console.log('[bootstrap-demo] downloading demo sources…')
    const compiled = path.join(serverRoot, 'dist', 'scripts', 'download-demo.js')
    const tsxScript = path.join(serverRoot, 'scripts', 'download-demo.ts')
    let ok = false
    if (fs.existsSync(compiled)) {
      const r = spawnSync(process.execPath, [compiled], {
        cwd: serverRoot,
        stdio: 'inherit',
        env: process.env,
      })
      ok = r.status === 0
    } else if (fs.existsSync(tsxScript)) {
      const r = spawnSync('npx', ['tsx', 'scripts/download-demo.ts'], {
        cwd: serverRoot,
        stdio: 'inherit',
        shell: true,
        env: process.env,
      })
      ok = r.status === 0
    }
    if (!ok) {
      if (fs.existsSync(localTest)) {
        console.warn('[bootstrap-demo] download failed; using local test-video.mp4')
        return { 'big-buck-bunny': localTest, sintel: localTest }
      }
      throw new Error('download-demo failed and no local test-video.mp4')
    }
  }

  if (!fs.existsSync(manifestPath)) {
    if (fs.existsSync(localTest)) {
      return { 'big-buck-bunny': localTest, sintel: localTest }
    }
    throw new Error('demo manifest missing')
  }

  const paths = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Record<string, string>
  if (fs.existsSync(localTest)) {
    if (!paths['big-buck-bunny'] || !fs.existsSync(paths['big-buck-bunny'])) {
      paths['big-buck-bunny'] = localTest
    }
  }
  return paths
}

async function main() {
  if (!checkBin(config.ffmpegPath) || !checkBin(config.ffprobePath)) {
    console.error('[bootstrap-demo] ffmpeg/ffprobe not runnable — skip')
    process.exit(0)
  }

  fs.mkdirSync(config.uploadsDir, { recursive: true })
  fs.mkdirSync(config.hlsDir, { recursive: true })

  const db = getDb()
  migrate(db)

  const ready = db
    .prepare(
      `SELECT COUNT(*) AS c FROM episodes WHERE deletedAt IS NULL AND statusEncode = 'ready' AND hlsPath IS NOT NULL`,
    )
    .get() as { c: number }

  const force = process.env.FORCE_DEMO_ENCODE === '1'
  if (ready.c > 0 && !force) {
    console.log(`[bootstrap-demo] skip (${ready.c} ready episode(s) already)`)
    closeDb()
    return
  }

  console.log(
    `[bootstrap-demo] ffmpeg=${config.ffmpegPath} mode=${fast ? 'fast' : 'full'}`,
  )

  const paths = await ensureDownloads()
  const targets: { key: string; seriesSlug: string }[] = [
    { key: 'big-buck-bunny', seriesSlug: 'neon-harbor-chronicles' },
    { key: 'sintel', seriesSlug: 'skyforge-academy' },
  ]

  for (const t of targets) {
    const input = paths[t.key]
    if (!input || !fs.existsSync(input)) {
      console.warn(`[bootstrap-demo] missing source for ${t.key}`)
      continue
    }
    const ep = db
      .prepare(
        `SELECT e.id, e.statusEncode FROM episodes e
         JOIN series s ON s.id = e.seriesId
         WHERE s.slug = ? AND e.number = 1 AND e.deletedAt IS NULL`,
      )
      .get(t.seriesSlug) as { id: number; statusEncode: string } | undefined
    if (!ep) {
      console.warn(`[bootstrap-demo] episode not found for ${t.seriesSlug}`)
      continue
    }
    if (ep.statusEncode === 'ready' && !force) {
      console.log(`[bootstrap-demo] already ready: ${t.seriesSlug} ep#1`)
      continue
    }

    console.log(`[bootstrap-demo] encoding ${t.key} → episode ${ep.id}…`)
    db.prepare(`UPDATE episodes SET sourcePath = ?, statusEncode = 'encoding' WHERE id = ?`).run(
      input,
      ep.id,
    )
    try {
      const hlsPath = await encodeEpisodeHls(
        ep.id,
        input,
        (p) => {
          process.stdout.write(`\r[bootstrap-demo] ${t.key} ${Math.round(p)}%   `)
        },
        { fast, maxDurationSec: fast ? 45 : undefined },
      )
      console.log(`\n[bootstrap-demo] ready: /media/${hlsPath}`)
      db.prepare(
        `UPDATE episodes SET statusEncode = 'ready', hlsPath = ?, updatedAt = datetime('now') WHERE id = ?`,
      ).run(hlsPath, ep.id)
    } catch (err) {
      console.error(`[bootstrap-demo] failed ${t.key}`, err)
      db.prepare(`UPDATE episodes SET statusEncode = 'failed' WHERE id = ?`).run(ep.id)
    }
  }

  closeDb()
  console.log('[bootstrap-demo] done')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
