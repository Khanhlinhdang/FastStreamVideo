import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { config, REPO_ROOT } from '../config.js';
import { getDb } from '../db/index.js';

type LadderRung = {
  name: string;
  width: number;
  height: number;
  /** Nominal bitrate for BANDWIDTH tag / CBR fallback */
  videoBitrate: string;
  maxrate: string;
  bufsize: string;
  audioBitrate: string;
  /** CRF target when using VBR+cap mode */
  crf: number;
};

type TitleProbe = {
  width: number;
  height: number;
  /** Source video bitrate in bps when available */
  bitRate: number | null;
};

const LADDER: LadderRung[] = [
  {
    name: 'r0',
    width: 854,
    height: 480,
    videoBitrate: '800k',
    maxrate: '1000k',
    bufsize: '2000k',
    audioBitrate: '96k',
    crf: 24,
  },
  {
    name: 'r1',
    width: 1280,
    height: 720,
    videoBitrate: '2000k',
    maxrate: '2500k',
    bufsize: '5000k',
    audioBitrate: '128k',
    crf: 23,
  },
  {
    name: 'r2',
    width: 1920,
    height: 1080,
    videoBitrate: '4000k',
    maxrate: '4500k',
    bufsize: '9000k',
    audioBitrate: '160k',
    crf: 22,
  },
];

function parseFfmpegTimeToSec(raw: string): number | null {
  const t = raw.trim();
  if (!t || t === 'N/A') return null;
  // out_time_ms=1234567 or out_time_us=
  if (/^\d+$/.test(t)) {
    const n = Number(t);
    return Number.isFinite(n) ? n / 1e6 : null; // treat as microseconds when from out_time
  }
  // HH:MM:SS.mm
  const m = t.match(/^(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/);
  if (m) {
    const h = Number(m[1]);
    const min = Number(m[2]);
    const s = Number(m[3]);
    if ([h, min, s].every(Number.isFinite)) return h * 3600 + min * 60 + s;
  }
  const asNum = Number(t);
  return Number.isFinite(asNum) ? asNum : null;
}

type RunCmdOptions = {
  cwd?: string;
  /** Called with encoded seconds when ffmpeg emits progress */
  onTimeSec?: (sec: number) => void;
  /** When true, append `-progress pipe:1` and parse stdout progress lines */
  progressPipe?: boolean;
};

function runCmd(
  bin: string,
  args: string[],
  options?: RunCmdOptions,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    // -progress must appear before outputs; append would be parsed as another output URL.
    const finalArgs = options?.progressPipe
      ? ['-progress', 'pipe:1', '-nostats', ...args]
      : args;
    const child = spawn(bin, finalArgs, { windowsHide: true, cwd: options?.cwd });
    let stdout = '';
    let stderr = '';
    let stdoutBuf = '';
    let stderrBuf = '';
    let lastEmit = 0;

    const emitTime = (sec: number) => {
      if (!options?.onTimeSec || !Number.isFinite(sec) || sec < 0) return;
      const now = Date.now();
      if (now - lastEmit < 500 && sec > 0) return;
      lastEmit = now;
      options.onTimeSec(sec);
    };

    const consumeProgressLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      if (trimmed.startsWith('out_time_ms=')) {
        const ms = Number(trimmed.slice('out_time_ms='.length));
        if (Number.isFinite(ms)) emitTime(ms / 1000);
        return;
      }
      if (trimmed.startsWith('out_time=')) {
        const sec = parseFfmpegTimeToSec(trimmed.slice('out_time='.length));
        if (sec != null) emitTime(sec);
        return;
      }
    };

    child.stdout.on('data', (d) => {
      const chunk = d.toString();
      stdout += chunk;
      if (!options?.progressPipe && !options?.onTimeSec) return;
      stdoutBuf += chunk;
      let nl: number;
      while ((nl = stdoutBuf.indexOf('\n')) >= 0) {
        const line = stdoutBuf.slice(0, nl);
        stdoutBuf = stdoutBuf.slice(nl + 1);
        consumeProgressLine(line);
      }
    });
    child.stderr.on('data', (d) => {
      const chunk = d.toString();
      stderr += chunk;
      if (!options?.onTimeSec) return;
      stderrBuf += chunk;
      // ffmpeg status uses \r; also split on \n
      const parts = stderrBuf.split(/[\r\n]+/);
      stderrBuf = parts.pop() ?? '';
      for (const line of parts) {
        const m = line.match(/time=(\d+:\d{2}:\d{2}(?:\.\d+)?)/);
        if (m?.[1]) {
          const sec = parseFfmpegTimeToSec(m[1]);
          if (sec != null) emitTime(sec);
        }
      }
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

async function probeDurationSec(inputPath: string): Promise<number | null> {
  const { code, stdout } = await runCmd(config.ffprobePath, [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    inputPath,
  ]);
  if (code !== 0) return null;
  const n = Number(stdout.trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

export type AudioStreamProbe = {
  /** Index among audio streams for `-map 0:a:N` */
  index: number;
  language: string;
  title: string;
};

export type AudioTrackMeta = {
  index: number;
  label: string;
  lang: string;
  /** Relative URI under episode HLS dir; empty when muxed-only single track */
  uri: string;
};

const AUDIO_LANG_LABELS: Record<string, string> = {
  vie: 'Tiếng Việt',
  vi: 'Tiếng Việt',
  eng: 'English',
  en: 'English',
  jpn: '日本語',
  ja: '日本語',
  kor: '한국어',
  ko: '한국어',
  chi: '中文',
  zh: '中文',
  und: 'Audio',
};

export function labelForAudioStream(s: { language?: string; title?: string }, i: number): string {
  if (s.title?.trim()) return s.title.trim();
  const lang = (s.language || '').toLowerCase();
  if (lang && AUDIO_LANG_LABELS[lang]) return AUDIO_LANG_LABELS[lang]!;
  if (lang && lang !== 'und') return lang;
  return i === 0 ? 'Audio chính' : `Audio ${i + 1}`;
}

/** Probe all audio streams (order = 0:a:N). */
export async function probeAudioStreams(inputPath: string): Promise<AudioStreamProbe[]> {
  const { code, stdout } = await runCmd(config.ffprobePath, [
    '-v',
    'error',
    '-select_streams',
    'a',
    '-show_entries',
    'stream=index:stream_tags=language,title',
    '-of',
    'json',
    inputPath,
  ]);
  if (code !== 0) return [];
  try {
    const parsed = JSON.parse(stdout) as {
      streams?: Array<{ tags?: { language?: string; title?: string } }>;
    };
    return (parsed.streams ?? []).map((s, i) => ({
      index: i,
      language: (s.tags?.language || 'und').trim() || 'und',
      title: (s.tags?.title || '').trim(),
    }));
  } catch {
    return [];
  }
}

export async function probeTitleMeta(inputPath: string): Promise<TitleProbe> {
  const { code, stdout, stderr } = await runCmd(config.ffprobePath, [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=width,height,bit_rate',
    '-of',
    'csv=p=0',
    inputPath,
  ]);
  if (code !== 0) {
    throw new Error(`ffprobe failed: ${stderr || stdout}`);
  }
  const line = stdout.trim().split('\n')[0] ?? '';
  const parts = line.split(',').map((s) => s.trim());
  const width = Number(parts[0]);
  const height = Number(parts[1]);
  const bitRateRaw = parts[2];
  const bitRate =
    bitRateRaw && bitRateRaw !== 'N/A' && Number.isFinite(Number(bitRateRaw))
      ? Number(bitRateRaw)
      : null;
  return {
    width: Number.isFinite(width) && width > 0 ? width : 1280,
    height: Number.isFinite(height) && height > 0 ? height : 720,
    bitRate,
  };
}

/** @deprecated Prefer probeTitleMeta; kept for callers that only need height. */
export async function probeHeight(inputPath: string): Promise<number> {
  const meta = await probeTitleMeta(inputPath);
  return meta.height;
}

/**
 * Older ffmpeg writes fMP4 init segments beside cwd (often `init.mp4` or
 * `init_N.mp4` for multi-variant), while each `index.m3u8` references the init
 * with a relative URI. Copy each referenced init into its variant directory.
 */
function placeFmp4InitFiles(outDir: string): void {
  const variantDirs = fs
    .readdirSync(outDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(outDir, d.name));

  for (const dir of variantDirs) {
    const indexPath = path.join(dir, 'index.m3u8');
    if (!fs.existsSync(indexPath)) continue;
    const text = fs.readFileSync(indexPath, 'utf8');
    const mapMatch = text.match(/#EXT-X-MAP:URI="([^"]+)"/);
    const initName = mapMatch?.[1] ?? 'init.mp4';
    const dest = path.join(dir, initName);
    if (fs.existsSync(dest)) continue;

    const candidates = [
      path.join(outDir, initName),
      path.join(outDir, path.basename(initName)),
      path.join(process.cwd(), initName),
      path.join(REPO_ROOT, initName),
      path.join(outDir, 'init.mp4'),
      path.join(process.cwd(), 'init.mp4'),
      path.join(REPO_ROOT, 'init.mp4'),
    ];
    const initSrc = candidates.find((p) => fs.existsSync(p));
    if (!initSrc) {
      throw new Error(`init segment missing for ${dir} (expected ${initName})`);
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(initSrc, dest);
  }

  // Drop stray inits left in outDir / cwd so the next job cannot pick up a stale file
  for (const name of fs.readdirSync(outDir)) {
    if (!/^init(_\d+)?\.mp4$/i.test(name)) continue;
    const p = path.join(outDir, name);
    if (fs.statSync(p).isFile()) {
      try {
        fs.unlinkSync(p);
      } catch {
        /* ignore */
      }
    }
  }
}

function bandwidthForRung(r: LadderRung): number {
  // Prefer maxrate cap as ABR estimate (CRF can undershoot)
  const video =
    Number.parseInt(r.maxrate, 10) * 1000 || Number.parseInt(r.videoBitrate, 10) * 1000;
  const audio = Number.parseInt(r.audioBitrate, 10) * 1000;
  return video + audio;
}

function ensureMasterPlaylist(outDir: string, rungs: LadderRung[]): void {
  const masterPath = path.join(outDir, 'master.m3u8');
  const nested = path.join(outDir, '0', 'master.m3u8');
  if (fs.existsSync(nested) && (!fs.existsSync(masterPath) || fs.statSync(masterPath).size === 0)) {
    fs.renameSync(nested, masterPath);
  }
  if (fs.existsSync(masterPath) && fs.statSync(masterPath).size > 0) return;

  // Bundled Windows ffmpeg sometimes crashes after writing variants but before
  // flushing master.m3u8 — synthesize a usable master from the ladder.
  const lines = ['#EXTM3U', '#EXT-X-VERSION:7'];
  rungs.forEach((r, i) => {
    const indexRel = `${i}/index.m3u8`;
    if (!fs.existsSync(path.join(outDir, indexRel))) return;
    const bw = bandwidthForRung(r);
    lines.push(
      `#EXT-X-STREAM-INF:BANDWIDTH=${bw},RESOLUTION=${r.width}x${r.height},CODECS="avc1.4d401f,mp4a.40.2"`,
      indexRel,
    );
  });
  if (lines.length < 4) throw new Error('master.m3u8 missing after encode');
  fs.writeFileSync(masterPath, `${lines.join('\n')}\n`, 'utf8');
}

function writeAudioTracksJson(outDir: string, tracks: AudioTrackMeta[]): void {
  fs.writeFileSync(path.join(outDir, 'audio-tracks.json'), `${JSON.stringify(tracks, null, 2)}\n`, 'utf8');
}

/** Rewrite master.m3u8 with EXT-X-MEDIA audio group (AUD-028). */
export function rewriteMasterWithAudioGroup(outDir: string, tracks: AudioTrackMeta[]): void {
  const masterPath = path.join(outDir, 'master.m3u8');
  if (!fs.existsSync(masterPath) || tracks.length < 2) return;
  let text = fs.readFileSync(masterPath, 'utf8').replace(/\\/g, '/');
  // Drop prior audio MEDIA tags from a previous package pass
  text = text
    .split(/\r?\n/)
    .filter((line) => !(line.startsWith('#EXT-X-MEDIA:') && line.includes('TYPE=AUDIO')))
    .join('\n');

  const mediaLines = tracks
    .filter((t) => t.uri)
    .map((t, i) => {
      const name = t.label.replace(/"/g, "'");
      const lang = t.lang && t.lang !== 'und' ? `,LANGUAGE="${t.lang}"` : '';
      const def = i === 0 ? 'YES' : 'NO';
      return `#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="${name}",DEFAULT=${def},AUTOSELECT=YES${lang},URI="${t.uri}"`;
    });
  if (mediaLines.length < 2) return;

  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  let mediaInserted = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!mediaInserted && (line.startsWith('#EXT-X-STREAM-INF:') || line.startsWith('#EXT-X-I-FRAME'))) {
      out.push(...mediaLines);
      mediaInserted = true;
    }
    if (line.startsWith('#EXT-X-STREAM-INF:')) {
      if (/,AUDIO=/.test(line)) {
        out.push(line.replace(/,AUDIO="[^"]*"/, ',AUDIO="audio"'));
      } else {
        out.push(`${line},AUDIO="audio"`);
      }
      continue;
    }
    out.push(line);
  }
  if (!mediaInserted) {
    // No STREAM-INF yet — prepend media after header
    const hdr = out.findIndex((l) => l.startsWith('#EXT-X-VERSION'));
    out.splice(hdr >= 0 ? hdr + 1 : 1, 0, ...mediaLines);
  }
  fs.writeFileSync(masterPath, `${out.filter((l, idx, arr) => !(l === '' && arr[idx - 1] === '')).join('\n').trim()}\n`, 'utf8');
  writeAudioTracksJson(outDir, tracks);
}

async function encodeAudioOnlyHls(
  outDir: string,
  trackKey: string,
  inputPath: string,
  audioMap: string,
  maxDurationSec?: number,
): Promise<boolean> {
  const trackDir = path.join(outDir, 'audio', trackKey);
  fs.mkdirSync(trackDir, { recursive: true });
  const args = ['-y'];
  if (maxDurationSec && maxDurationSec > 0) args.push('-t', String(maxDurationSec));
  args.push(
    '-i',
    inputPath,
    '-map',
    audioMap,
    '-vn',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-ac',
    '2',
    '-f',
    'hls',
    '-hls_time',
    '5',
    '-hls_playlist_type',
    'vod',
    '-hls_segment_type',
    'fmp4',
    '-hls_fmp4_init_filename',
    'init.mp4',
    '-hls_segment_filename',
    'seg_%03d.m4s',
    'index.m3u8',
  );
  const { code } = await runCmd(config.ffmpegPath, args, { cwd: trackDir });
  const indexPath = path.join(trackDir, 'index.m3u8');
  if (code !== 0 && !fs.existsSync(indexPath)) return false;
  // Ensure init sits beside index (same recovery as video variants)
  if (!fs.existsSync(path.join(trackDir, 'init.mp4'))) {
    const candidates = [
      path.join(trackDir, 'init.mp4'),
      path.join(outDir, 'init.mp4'),
      path.join(process.cwd(), 'init.mp4'),
    ];
    const src = candidates.find((p) => fs.existsSync(p) && p !== path.join(trackDir, 'init.mp4'));
    if (src) fs.copyFileSync(src, path.join(trackDir, 'init.mp4'));
  }
  return fs.existsSync(indexPath);
}

type AlternateAudioRow = {
  id: number;
  label: string;
  lang: string;
  sourcePath: string;
};

function listAlternateAudioRows(episodeId: number): AlternateAudioRow[] {
  try {
    return getDb()
      .prepare(
        `SELECT id, label, lang, sourcePath FROM episode_audio_tracks WHERE episodeId = ? ORDER BY id`,
      )
      .all(episodeId) as AlternateAudioRow[];
  } catch {
    return [];
  }
}

/**
 * Package alternate audio renditions into HLS + rewrite master when ≥2 tracks.
 * Source multi-audio OR admin-attached files (episode_audio_tracks).
 */
export async function packageMultiAudioForEpisode(
  outDir: string,
  primaryInput: string,
  episodeId: number,
  maxDurationSec?: number,
): Promise<AudioTrackMeta[]> {
  const streams = await probeAudioStreams(primaryInput);
  const alts = listAlternateAudioRows(episodeId);
  const tracks: AudioTrackMeta[] = [];

  const needRenditions = streams.length > 1 || alts.length > 0;
  if (!needRenditions) {
    const only = streams[0];
    const meta: AudioTrackMeta[] = [
      {
        index: 0,
        label: labelForAudioStream(only ?? {}, 0),
        lang: only?.language || 'und',
        uri: '',
      },
    ];
    writeAudioTracksJson(outDir, meta);
    return meta;
  }

  for (let i = 0; i < streams.length; i++) {
    const s = streams[i]!;
    const ok = await encodeAudioOnlyHls(outDir, String(i), primaryInput, `0:a:${i}`, maxDurationSec);
    if (!ok) continue;
    tracks.push({
      index: i,
      label: labelForAudioStream(s, i),
      lang: s.language || 'und',
      uri: `audio/${i}/index.m3u8`,
    });
  }

  let nextKey = tracks.length > 0 ? Math.max(...tracks.map((t) => t.index)) + 1 : streams.length;
  for (const alt of alts) {
    if (!alt.sourcePath || !fs.existsSync(alt.sourcePath)) continue;
    const key = String(nextKey);
    const ok = await encodeAudioOnlyHls(outDir, key, alt.sourcePath, '0:a:0', maxDurationSec);
    if (!ok) continue;
    tracks.push({
      index: nextKey,
      label: alt.label || `Audio phụ ${nextKey}`,
      lang: alt.lang || 'und',
      uri: `audio/${key}/index.m3u8`,
    });
    nextKey += 1;
  }

  // Ensure fMP4 init for audio renditions only (do not re-scan video ladder dirs)
  const audioRoot = path.join(outDir, 'audio');
  if (fs.existsSync(audioRoot)) {
    for (const name of fs.readdirSync(audioRoot)) {
      const dir = path.join(audioRoot, name);
      if (!fs.statSync(dir).isDirectory()) continue;
      const indexPath = path.join(dir, 'index.m3u8');
      if (!fs.existsSync(indexPath)) continue;
      const text = fs.readFileSync(indexPath, 'utf8');
      const mapMatch = text.match(/#EXT-X-MAP:URI="([^"]+)"/);
      const initName = mapMatch?.[1] ?? 'init.mp4';
      const dest = path.join(dir, initName);
      if (fs.existsSync(dest)) continue;
      const candidates = [
        path.join(dir, 'init.mp4'),
        path.join(outDir, initName),
        path.join(outDir, 'init.mp4'),
        path.join(process.cwd(), initName),
      ];
      const src = candidates.find((p) => fs.existsSync(p) && p !== dest);
      if (src) fs.copyFileSync(src, dest);
    }
  }
  if (tracks.filter((t) => t.uri).length >= 2) {
    rewriteMasterWithAudioGroup(outDir, tracks);
  } else {
    writeAudioTracksJson(outDir, tracks);
  }
  return tracks;
}

/** Attach one alternate audio file onto an already-ready HLS episode (no full re-encode). */
export async function attachAudioTrackToReadyHls(
  episodeId: number,
  sourcePath: string,
  label: string,
  lang: string,
): Promise<AudioTrackMeta[]> {
  const outDir = path.join(config.hlsDir, String(episodeId));
  const masterPath = path.join(outDir, 'master.m3u8');
  if (!fs.existsSync(masterPath)) {
    throw new Error('Episode HLS not ready');
  }
  let existing: AudioTrackMeta[] = [];
  const metaPath = path.join(outDir, 'audio-tracks.json');
  if (fs.existsSync(metaPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as AudioTrackMeta[];
    } catch {
      existing = [];
    }
  }
  // Ensure default muxed track is represented so we always end with ≥2 selectable
  if (existing.length === 0) {
    existing = [{ index: 0, label: 'Audio chính', lang: 'und', uri: '' }];
  }
  // If primary has no separate URI yet, package 0:a:0 from episode source when available
  const ep = getDb()
    .prepare(`SELECT sourcePath FROM episodes WHERE id = ?`)
    .get(episodeId) as { sourcePath: string | null } | undefined;
  if (!existing.some((t) => t.uri) && ep?.sourcePath && fs.existsSync(ep.sourcePath)) {
    const ok = await encodeAudioOnlyHls(outDir, '0', ep.sourcePath, '0:a:0');
    if (ok) {
      existing = [
        {
          index: 0,
          label: existing[0]?.label || 'Audio chính',
          lang: existing[0]?.lang || 'und',
          uri: 'audio/0/index.m3u8',
        },
      ];
    }
  }

  const nextIndex =
    existing.reduce((m, t) => Math.max(m, t.index), -1) + 1;
  const key = String(nextIndex);
  const ok = await encodeAudioOnlyHls(outDir, key, sourcePath, '0:a:0');
  if (!ok) throw new Error('Failed to package alternate audio');
  const tracks = [
    ...existing.filter((t) => t.index !== nextIndex),
    {
      index: nextIndex,
      label: label || `Audio ${nextIndex + 1}`,
      lang: lang || 'und',
      uri: `audio/${key}/index.m3u8`,
    },
  ];
  placeFmp4InitFiles(outDir);
  rewriteMasterWithAudioGroup(outDir, tracks.filter((t) => t.uri));
  writeAudioTracksJson(outDir, tracks);
  return tracks;
}

function hlsOutputLooksComplete(outDir: string): boolean {
  const hasVariant = fs
    .readdirSync(outDir, { withFileTypes: true })
    .some((d) => d.isDirectory() && fs.existsSync(path.join(outDir, d.name, 'index.m3u8')));
  return hasVariant;
}

/**
 * Heuristic complexity bucket from source resolution + bitrate.
 * Soft (easy / low bpp) → higher CRF; hard → lower CRF.
 */
function crfBiasForTitle(meta: TitleProbe): number {
  if (meta.bitRate == null || meta.width <= 0 || meta.height <= 0) return 0;
  const pixels = meta.width * meta.height;
  const bpp = meta.bitRate / Math.max(pixels, 1); // bits per pixel per second-ish
  // Typical H.264 1080p ~2–8 Mbps → bpp roughly 1–4 at 30fps scale; use coarse buckets
  if (bpp < 0.5) return 2; // soft / already compressed
  if (bpp > 2.5) return -1; // hard / high detail
  return 0;
}

/**
 * Build ABR ladder capped at source height, with per-title CRF tweaks.
 * - Admin / production encodes: full ladder (480 → up to source, incl. 1080+ when allowed).
 * - Fast mode: 480p only (demo bootstrap / DEMO_FULL unset).
 */
export function selectLadderForTitle(meta: TitleProbe, fast = false): LadderRung[] {
  const sourceHeight = meta.height;
  const bias = crfBiasForTitle(meta);

  const cloneWithBias = (r: LadderRung): LadderRung => ({
    ...r,
    crf: Math.min(28, Math.max(16, r.crf + bias)),
  });

  if (fast) {
    return [cloneWithBias(LADDER[0]!)];
  }

  const rungs: LadderRung[] = LADDER.map(cloneWithBias);
  if (sourceHeight >= 1440) {
    rungs.push(
      cloneWithBias({
        name: 'r3',
        width: 2560,
        height: 1440,
        videoBitrate: '8000k',
        maxrate: '9000k',
        bufsize: '16000k',
        audioBitrate: '192k',
        crf: 20,
      }),
    );
  }
  if (sourceHeight >= 2160) {
    rungs.push(
      cloneWithBias({
        name: 'r4',
        width: 3840,
        height: 2160,
        videoBitrate: '14000k',
        maxrate: '16000k',
        bufsize: '28000k',
        audioBitrate: '192k',
        crf: 19,
      }),
    );
  }

  // Soft 1080p+ with very low source bitrate: trim top rung maxrate slightly
  if (bias >= 2 && sourceHeight >= 1080) {
    const top = rungs[rungs.length - 1];
    if (top && top.height >= 1080) {
      const mr = Number.parseInt(top.maxrate, 10);
      if (Number.isFinite(mr) && mr > 2000) {
        top.maxrate = `${Math.round(mr * 0.85)}k`;
        top.bufsize = `${Math.round(mr * 0.85 * 2)}k`;
        top.videoBitrate = `${Math.round(mr * 0.7)}k`;
      }
    }
  }

  const maxH = Math.min(Math.max(sourceHeight, 480), config.maxEncodeHeight);
  const filtered = rungs.filter((r) => r.height <= maxH);
  if (filtered.length === 0) return [cloneWithBias(LADDER[0]!)];
  return filtered;
}

export async function encodeEpisodeHls(
  episodeId: number,
  inputPath: string,
  onProgress?: (pct: number) => void,
  options?: { fast?: boolean; maxDurationSec?: number },
): Promise<string> {
  const outDir = path.join(config.hlsDir, String(episodeId));
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const meta = await probeTitleMeta(inputPath);
  const rungs = selectLadderForTitle(meta, options?.fast === true);
  if (rungs.length === 0) throw new Error('No ladder rungs for source');

  // Build filter_complex split + scale
  const splitLabels = rungs.map((_, i) => `[v${i}]`).join('');
  const filterParts = [`[0:v]split=${rungs.length}${splitLabels}`];
  const mapArgs: string[] = [];
  const varStreamMap: string[] = [];

  rungs.forEach((r, i) => {
    filterParts.push(
      `[v${i}]scale=w=${r.width}:h=${r.height}:force_original_aspect_ratio=decrease,` +
        `pad=${r.width}:${r.height}:(ow-iw)/2:(oh-ih)/2,setsar=1[vout${i}]`,
    );
    mapArgs.push('-map', `[vout${i}]`, '-map', '0:a:0?');
    // Older ffmpeg (bundled installer) does not accept name: in var_stream_map
    varStreamMap.push(`v:${i},a:${i}`);
  });

  const args = ['-y'];
  if (options?.maxDurationSec && options.maxDurationSec > 0) {
    args.push('-t', String(options.maxDurationSec));
  }
  args.push('-i', inputPath, '-filter_complex', filterParts.join(';'), ...mapArgs);

  // CRF + maxrate cap (VBR capped). Fallback to CBR -b:v if CRF flags fail at runtime
  // is handled by verifying encode exit / completeness (bundled Windows ffmpeg supports -crf:v:i).
  rungs.forEach((r, i) => {
    args.push(
      `-c:v:${i}`,
      'libx264',
      `-crf:v:${i}`,
      String(r.crf),
      `-maxrate:v:${i}`,
      r.maxrate,
      `-bufsize:v:${i}`,
      r.bufsize,
      `-profile:v:${i}`,
      'main',
      `-c:a:${i}`,
      'aac',
      `-b:a:${i}`,
      r.audioBitrate,
      `-ac:a:${i}`,
      '2',
    );
  });

  // Ensure variant output dirs exist (some ffmpeg builds need them)
  for (let i = 0; i < rungs.length; i++) {
    fs.mkdirSync(path.join(outDir, String(i)), { recursive: true });
  }

  // Relative HLS paths + cwd=outDir: absolute Windows paths make old ffmpeg treat
  // the destination as a non-file protocol and often crash after the last segment.
  args.push(
    '-g',
    '120',
    '-keyint_min',
    '120',
    '-sc_threshold',
    '0',
    '-f',
    'hls',
    '-hls_time',
    '5',
    '-hls_playlist_type',
    'vod',
    '-hls_segment_type',
    'fmp4',
    '-hls_fmp4_init_filename',
    'init.mp4',
    '-master_pl_name',
    'master.m3u8',
    '-var_stream_map',
    varStreamMap.join(' '),
    '-hls_segment_filename',
    '%v/seg_%03d.m4s',
    '%v/index.m3u8',
  );

  onProgress?.(5);

  const probedDuration = await probeDurationSec(inputPath);
  const durationSec =
    options?.maxDurationSec && options.maxDurationSec > 0
      ? Math.min(probedDuration ?? options.maxDurationSec, options.maxDurationSec)
      : probedDuration;

  let lastPct = 5;
  const reportPct = (pct: number) => {
    const clamped = Math.max(5, Math.min(99, Math.floor(pct)));
    if (clamped <= lastPct) return;
    lastPct = clamped;
    onProgress?.(clamped);
  };

  const { code, stderr } = await runCmd(config.ffmpegPath, args, {
    cwd: outDir,
    // Prefer stderr time= (unbuffered-ish on Windows). pipe:1 often flushes only at exit.
    progressPipe: false,
    onTimeSec: (sec) => {
      if (durationSec && durationSec > 0) {
        // Reserve headroom for post-steps / optional VP9 (5–90% main encode)
        const span = config.enableAv1Ladder ? 85 : 94;
        reportPct(5 + (sec / durationSec) * span);
      } else {
        // Unknown duration: creep slowly so UI is not stuck at 5%
        reportPct(Math.min(90, lastPct + 1));
      }
    },
  });
  if (code !== 0 && !hlsOutputLooksComplete(outDir)) {
    throw new Error(`ffmpeg encode failed (code ${code}): ${stderr.slice(-2000)}`);
  }
  if (code !== 0) {
    console.warn(
      `[encode] ffmpeg exited ${code} but HLS variants look complete; recovering master/init`,
    );
  }

  placeFmp4InitFiles(outDir);
  ensureMasterPlaylist(outDir, rungs);

  try {
    await packageMultiAudioForEpisode(outDir, inputPath, episodeId, options?.maxDurationSec);
  } catch (err) {
    console.warn('[encode] multi-audio package skipped:', err instanceof Error ? err.message : err);
  }

  if (config.enableAv1Ladder) {
    reportPct(86);
    await encodeOptionalEfficientVariant(
      outDir,
      inputPath,
      rungs.length,
      options?.maxDurationSec,
      (sec) => {
        if (durationSec && durationSec > 0) {
          reportPct(86 + (sec / durationSec) * 12);
        } else {
          reportPct(Math.min(98, lastPct + 1));
        }
      },
    );
  }

  try {
    await generateThumbnailSprite(outDir, inputPath, options?.maxDurationSec);
  } catch (err) {
    console.warn('[encode] thumbnail sprite skipped:', err instanceof Error ? err.message : err);
  }

  // Normalize Windows backslashes in playlists for browser HLS clients
  for (const file of fs.readdirSync(outDir, { recursive: true })) {
    const full = path.join(outDir, String(file));
    if (!full.endsWith('.m3u8') || !fs.statSync(full).isFile()) continue;
    const text = fs.readFileSync(full, 'utf8');
    const fixed = text.replace(/\\/g, '/');
    if (fixed !== text) fs.writeFileSync(full, fixed, 'utf8');
  }

  onProgress?.(100);
  // Relative path under /media static root (media/)
  return `hls/${episodeId}/master.m3u8`;
}

/**
 * Generate a simple storyboard JPEG + thumbs.vtt for seek preview.
 */
async function generateThumbnailSprite(
  outDir: string,
  inputPath: string,
  maxDurationSec?: number,
): Promise<void> {
  const duration = (await probeDurationSec(inputPath)) ?? maxDurationSec ?? 60;
  const clip = maxDurationSec && maxDurationSec > 0 ? Math.min(duration, maxDurationSec) : duration;
  const interval = Math.max(2, Math.ceil(clip / 20));
  const spritePath = path.join(outDir, 'thumbs.jpg');
  const vttPath = path.join(outDir, 'thumbs.vtt');
  const args = ['-y'];
  if (maxDurationSec && maxDurationSec > 0) args.push('-t', String(maxDurationSec));
  args.push(
    '-i',
    inputPath,
    '-vf',
    `fps=1/${interval},scale=160:-1,tile=5x4`,
    '-frames:v',
    '1',
    spritePath,
  );
  const { code } = await runCmd(config.ffmpegPath, args);
  if (code !== 0 || !fs.existsSync(spritePath)) return;

  let vtt = 'WEBVTT\n\n';
  const cols = 5;
  const w = 160;
  const h = 90;
  let idx = 0;
  for (let t = 0; t < clip && idx < 20; t += interval, idx++) {
    const start = formatVttTime(t);
    const end = formatVttTime(Math.min(clip, t + interval));
    const x = (idx % cols) * w;
    const y = Math.floor(idx / cols) * h;
    vtt += `${start} --> ${end}\n`;
    vtt += `thumbs.jpg#xywh=${x},${y},${w},${h}\n\n`;
  }
  fs.writeFileSync(vttPath, vtt, 'utf8');
}

function formatVttTime(sec: number): string {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const whole = Math.floor(r);
  const ms = Math.round((r - whole) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(whole).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

type EfficientCodec = {
  encoder: 'libaom-av1' | 'libvpx-vp9';
  codecsTag: string;
  /** Directory name under outDir */
  folder: string;
};

/**
 * Optional bandwidth-efficient 720p rung.
 * Prefer VP9 on Windows (libaom-av1 is experimental + extremely slow);
 * fall back to AV1 when VP9 is unavailable.
 * Appended to master.m3u8 after H.264 so unsupported clients stay on avc1.
 */
async function encodeOptionalEfficientVariant(
  outDir: string,
  inputPath: string,
  variantIndex: number,
  maxDurationSec?: number,
  onTimeSec?: (sec: number) => void,
): Promise<void> {
  const probe = await runCmd(config.ffmpegPath, ['-hide_banner', '-encoders']);
  const hasVp9 = probe.stdout.includes('libvpx-vp9');
  const hasAv1 = probe.stdout.includes('libaom-av1');

  const codec: EfficientCodec = hasVp9
    ? {
        encoder: 'libvpx-vp9',
        codecsTag: 'vp09.00.51.08.01.01.01.01.00,mp4a.40.2',
        folder: String(variantIndex),
      }
    : hasAv1
      ? {
          encoder: 'libaom-av1',
          codecsTag: 'av01.0.05M.08,mp4a.40.2',
          folder: String(variantIndex),
        }
      : {
          encoder: 'libvpx-vp9',
          codecsTag: 'vp09.00.51.08.01.01.01.01.00,mp4a.40.2',
          folder: String(variantIndex),
        };

  if (!hasVp9 && !hasAv1) {
    console.warn('[encode] ENABLE_AV1_LADDER set but neither libvpx-vp9 nor libaom-av1 available; skip');
    return;
  }

  const variantDir = path.join(outDir, codec.folder);
  fs.mkdirSync(variantDir, { recursive: true });

  const args = ['-y'];
  if (maxDurationSec && maxDurationSec > 0) {
    args.push('-t', String(maxDurationSec));
  }
  args.push(
    '-i',
    inputPath,
    '-vf',
    'scale=w=1280:h=720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1',
    '-c:v',
    codec.encoder,
  );

  if (codec.encoder === 'libaom-av1') {
    // Bundled ffmpeg marks libaom-av1 experimental → need -strict -2
    args.push('-strict', '-2', '-crf', '34', '-b:v', '0', '-cpu-used', '8', '-row-mt', '1');
  } else {
    args.push('-crf', '32', '-b:v', '0', '-cpu-used', '4', '-row-mt', '1');
  }

  args.push(
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-ac',
    '2',
    '-g',
    '120',
    '-keyint_min',
    '120',
    '-f',
    'hls',
    '-hls_time',
    '5',
    '-hls_playlist_type',
    'vod',
    '-hls_segment_type',
    'fmp4',
    '-hls_fmp4_init_filename',
    'init.mp4',
    '-hls_segment_filename',
    'seg_%03d.m4s',
    'index.m3u8',
  );

  console.log(`[encode] optional ${codec.encoder} variant → ${codec.folder}/`);
  const { code, stderr } = await runCmd(config.ffmpegPath, args, {
    cwd: variantDir,
    progressPipe: false,
    onTimeSec,
  });
  if (code !== 0 && !fs.existsSync(path.join(variantDir, 'index.m3u8'))) {
    console.warn(`[encode] optional ${codec.encoder} failed (code ${code}): ${stderr.slice(-800)}`);
    try {
      fs.rmSync(variantDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    return;
  }

  // Place init into variant dir if ffmpeg left it elsewhere
  placeFmp4InitFiles(outDir);

  const masterPath = path.join(outDir, 'master.m3u8');
  let master = fs.existsSync(masterPath) ? fs.readFileSync(masterPath, 'utf8') : '#EXTM3U\n#EXT-X-VERSION:7\n';
  if (!master.includes(`${codec.folder}/index.m3u8`)) {
    const line =
      `#EXT-X-STREAM-INF:BANDWIDTH=1800000,RESOLUTION=1280x720,CODECS="${codec.codecsTag}"\n` +
      `${codec.folder}/index.m3u8\n`;
    master = `${master.trimEnd()}\n${line}`;
    fs.writeFileSync(masterPath, master, 'utf8');
  }
}

class EncodeQueue {
  private queue: number[] = [];
  private running = false;
  private queuedSet = new Set<number>();

  enqueueJob(jobId: number): void {
    if (this.queuedSet.has(jobId)) return;
    this.queuedSet.add(jobId);
    this.queue.push(jobId);
    void this.pump();
  }

  /** Re-queue unfinished jobs on server boot */
  resumePending(): void {
    const rows = getDb()
      .prepare(
        `SELECT id FROM encode_jobs WHERE status IN ('queued', 'encoding') ORDER BY id ASC`,
      )
      .all() as { id: number }[];
    for (const r of rows) {
      getDb()
        .prepare(`UPDATE encode_jobs SET status = 'queued', progress = 0 WHERE id = ?`)
        .run(r.id);
      this.enqueueJob(r.id);
    }
  }

  private async pump(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length > 0) {
        const jobId = this.queue.shift()!;
        this.queuedSet.delete(jobId);
        await this.processJob(jobId);
      }
    } finally {
      this.running = false;
    }
  }

  private async processJob(jobId: number): Promise<void> {
    const db = getDb();
    const job = db
      .prepare(`SELECT * FROM encode_jobs WHERE id = ?`)
      .get(jobId) as
      | { id: number; episodeId: number; status: string }
      | undefined;
    if (!job) return;

    const episode = db
      .prepare(`SELECT * FROM episodes WHERE id = ?`)
      .get(job.episodeId) as
      | { id: number; sourcePath: string | null }
      | undefined;

    if (!episode?.sourcePath || !fs.existsSync(episode.sourcePath)) {
      db.prepare(
        `UPDATE encode_jobs SET status = 'failed', error = ?, finishedAt = datetime('now') WHERE id = ?`,
      ).run('Source file missing', jobId);
      db.prepare(
        `UPDATE episodes SET statusEncode = 'failed', updatedAt = datetime('now') WHERE id = ?`,
      ).run(job.episodeId);
      return;
    }

    db.prepare(`UPDATE encode_jobs SET status = 'encoding', progress = 1 WHERE id = ?`).run(
      jobId,
    );
    db.prepare(
      `UPDATE episodes SET statusEncode = 'encoding', updatedAt = datetime('now') WHERE id = ?`,
    ).run(job.episodeId);

    try {
      const hlsPath = await encodeEpisodeHls(job.episodeId, episode.sourcePath, (pct) => {
        db.prepare(`UPDATE encode_jobs SET progress = ? WHERE id = ?`).run(pct, jobId);
      });
      db.prepare(
        `UPDATE encode_jobs SET status = 'ready', progress = 100, finishedAt = datetime('now'), error = NULL WHERE id = ?`,
      ).run(jobId);
      db.prepare(
        `UPDATE episodes SET statusEncode = 'ready', hlsPath = ?, hlsStorage = 'local', updatedAt = datetime('now') WHERE id = ?`,
      ).run(hlsPath, job.episodeId);
      db.prepare(
        `UPDATE series SET updatedAt = datetime('now') WHERE id = (SELECT seriesId FROM episodes WHERE id = ?)`,
      ).run(job.episodeId);
      // SCL-008: optional R2 publish (hot/all). Failures keep local playback.
      try {
        const { publishEpisodeHlsToR2 } = await import('./r2HlsPublish.js');
        await publishEpisodeHlsToR2(job.episodeId);
      } catch (pubErr) {
        console.warn(
          `[encode] R2 publish skipped/failed for ep ${job.episodeId}:`,
          pubErr instanceof Error ? pubErr.message : pubErr,
        );
      }
      void notifyEncodeWebhook({ jobId, episodeId: job.episodeId, status: 'ready' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      db.prepare(
        `UPDATE encode_jobs SET status = 'failed', error = ?, finishedAt = datetime('now') WHERE id = ?`,
      ).run(msg, jobId);
      db.prepare(
        `UPDATE episodes SET statusEncode = 'failed', updatedAt = datetime('now') WHERE id = ?`,
      ).run(job.episodeId);
      console.error(`[encode] job ${jobId} failed:`, msg);
      void notifyEncodeWebhook({ jobId, episodeId: job.episodeId, status: 'failed', error: msg });
    }
  }
}

export const encodeQueue = new EncodeQueue();

async function notifyEncodeWebhook(payload: {
  jobId: number;
  episodeId: number;
  status: string;
  error?: string;
}): Promise<void> {
  const url = process.env.ENCODE_WEBHOOK_URL?.trim();
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, at: new Date().toISOString() }),
    });
  } catch (err) {
    console.warn('[encode] webhook failed (ignored):', err instanceof Error ? err.message : err);
  }
}

export function createEncodeJob(episodeId: number): number {
  const db = getDb();
  const r = db
    .prepare(`INSERT INTO encode_jobs (episodeId, status, progress) VALUES (?, 'queued', 0)`)
    .run(episodeId);
  db.prepare(
    `UPDATE episodes SET statusEncode = 'queued', updatedAt = datetime('now') WHERE id = ?`,
  ).run(episodeId);
  const jobId = Number(r.lastInsertRowid);
  // When ENCODE_IN_PROCESS=0, a separate worker process pumps the queue
  if (process.env.ENCODE_IN_PROCESS !== '0') {
    encodeQueue.enqueueJob(jobId);
  }
  return jobId;
}

/** Pick up queued jobs not yet in the in-memory queue (worker mode). */
export function pollQueuedJobs(): void {
  const rows = getDb()
    .prepare(`SELECT id FROM encode_jobs WHERE status = 'queued' ORDER BY id ASC`)
    .all() as { id: number }[];
  for (const r of rows) {
    encodeQueue.enqueueJob(r.id);
  }
}
