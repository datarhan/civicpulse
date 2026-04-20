/**
 * Fetch the Ajuntament de Riba-roja YouTube channel via yt-dlp, extract pleno
 * videos, and write public/data/pleno-videos.json.
 *
 * yt-dlp is expected to be on PATH (brew install yt-dlp). Network error → exit 1.
 *
 *   npm run scrape:pleno-videos
 */
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseChannelFeed } from '../src/scraper/pleno-videos'

const CHANNEL_URL = 'https://www.youtube.com/@ajuntam_riba_roja_de_turia'
const OUT_PATH = resolve('public/data/pleno-videos.json')
const PLAYLIST_LIMIT = 60  // enough to cover ~2 years of monthly sessions

function run(): string {
  try {
    const raw = execFileSync(
      'yt-dlp',
      ['--flat-playlist', '--dump-json', '--playlist-end', String(PLAYLIST_LIMIT), CHANNEL_URL],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024 },
    )
    return raw
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    process.stderr.write(`[pleno-videos] yt-dlp failed: ${msg}\n`)
    process.stderr.write('Install via: brew install yt-dlp\n')
    process.exit(1)
  }
}

function main() {
  process.stdout.write(`[pleno-videos] fetching channel feed (limit=${PLAYLIST_LIMIT})…\n`)
  const jsonl = run()
  const snap = parseChannelFeed(jsonl, { channelUrl: CHANNEL_URL })
  writeFileSync(OUT_PATH, JSON.stringify(snap, null, 2) + '\n', 'utf8')
  process.stdout.write(
    `[pleno-videos] scanned ${snap.stats.totalVideosScanned} · matched ${snap.stats.plenoVideosMatched} pleno(s) ` +
      `(ordinario ${snap.stats.byKind.ordinario}, extraordinario ${snap.stats.byKind.extraordinario}, ` +
      `urgente ${snap.stats.byKind.urgente}, otro ${snap.stats.byKind.otro}) → ${OUT_PATH}\n`,
  )
}

main()
