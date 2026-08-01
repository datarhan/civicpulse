#!/usr/bin/env tsx
/**
 * Propose voice references for councillors who have no voiceprint yet.
 *
 *   npm run propose-voice-refs -- <plenoId> [--limit N]
 *
 * The chicken-and-egg problem this solves: speaker identification needs an
 * enrolled reference per councillor, and the only reliable recording of a
 * councillor's voice is the pleno itself — where we don't yet know who is who.
 *
 * The way in is that the chair announces the next speaker by name ("…José
 * Ángel."), and the chair (the mayor) is already enrolled, so the diarizer
 * names his turns for us. Every time an ALREADY-IDENTIFIED speaker utters a
 * councillor's name and a different, still-anonymous cluster speaks next, that
 * cluster is a candidate for that councillor — with the quote as evidence.
 *
 * NOTHING here enrols anything. Output is a curator queue: each row carries
 * the proposed slug, the verbatim announcement, its timestamp and an 8-second
 * clip to listen to. A human confirms before `enroll-voice` is ever run,
 * because binding a voice to a named person is the same libel boundary the
 * rest of the attribution stack is built around.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const OFFICIALS = resolve('public/data/officials.json')
const VIDEOS = resolve('public/data/pleno-videos.json')
const PLENOS = resolve('public/data/plenos.json')
const VOICEPRINTS = resolve('.voiceprints')
const OUT_DIR = resolve('.voiceprints/candidates')

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

interface Official {
  slug: string
  name: string
  party?: string
}

interface DiarSegment {
  start: number
  end: number
  speaker: string
  text: string
}

/**
 * Does `text` announce one of the officials? Matches the longest name form
 * present, so "José Ángel Hernández" beats a bare "José". Requires at least a
 * given name + something else, or a distinctive surname — a lone "José" in a
 * council of several Josés identifies nobody.
 */
export function matchAnnouncedOfficial(text: string, officials: Official[]): Official | null {
  const t = fold(text)
  let best: { o: Official; len: number } | null = null
  for (const o of officials) {
    const parts = fold(o.name).split(/\s+/).filter(Boolean)
    if (parts.length < 2) continue
    // Try progressively shorter prefixes of the full name, plus surname pairs.
    const forms = [
      parts.join(' '),
      parts.slice(0, 3).join(' '),
      parts.slice(0, 2).join(' '),
      parts.slice(-2).join(' '),
    ].filter((f) => f.split(' ').length >= 2)
    for (const f of forms) {
      if (t.includes(f) && (!best || f.length > best.len)) best = { o, len: f.length }
    }
  }
  return best?.o ?? null
}

/**
 * Walk diarized segments and pair "identified speaker announces NAME" with the
 * next segment spoken by a different, still-anonymous cluster.
 */
export function proposeFromSegments(
  segments: DiarSegment[],
  officials: Official[],
  knownSpeakers: Set<string>,
): Array<{ cluster: string; slug: string; name: string; evidence: string; at: number }> {
  const out: Array<{ cluster: string; slug: string; name: string; evidence: string; at: number }> =
    []
  const seen = new Set<string>()
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i]
    // The announcement must come from someone we already trust to be named.
    if (!knownSpeakers.has(seg.speaker)) continue
    const who = matchAnnouncedOfficial(seg.text, officials)
    if (!who) continue
    const next = segments.slice(i + 1).find((s) => s.speaker !== seg.speaker)
    if (!next || knownSpeakers.has(next.speaker)) continue
    const key = `${next.speaker}→${who.slug}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      cluster: next.speaker,
      slug: who.slug,
      name: who.name,
      evidence: seg.text.trim().slice(-160),
      at: next.start,
    })
  }
  return out
}

/** Longest contiguous run of a cluster — the best place to cut a clean clip. */
export function longestRunFor(segments: DiarSegment[], cluster: string): DiarSegment | null {
  let best: DiarSegment | null = null
  for (const s of segments) {
    if (s.speaker !== cluster) continue
    if (!best || s.end - s.start > best.end - best.start) best = s
  }
  return best
}

async function main() {
  const plenoId = process.argv[2]
  if (!plenoId) {
    console.error('usage: npm run propose-voice-refs -- <plenoId>')
    process.exit(1)
  }
  if (!process.env.OPENAI_API_KEY) {
    console.error('[voice-refs] OPENAI_API_KEY not set (set -a; source .env; set +a)')
    process.exit(1)
  }

  const officials: Official[] = JSON.parse(readFileSync(OFFICIALS, 'utf8')).officials
  const plenos = JSON.parse(readFileSync(PLENOS, 'utf8')).items
  const pleno = plenos.find((p: any) => p.id === plenoId)
  if (!pleno) {
    console.error(`[voice-refs] unknown pleno ${plenoId}`)
    process.exit(1)
  }
  const videos = JSON.parse(readFileSync(VIDEOS, 'utf8')).items
  const video = videos.find((v: any) => v.plenoDate === pleno.date)
  if (!video) {
    console.error(`[voice-refs] no video for ${plenoId} (${pleno.date}) — cannot sample audio`)
    process.exit(1)
  }

  const enrolled: Array<{ slug: string; name: string }> = existsSync(`${VOICEPRINTS}/index.json`)
    ? JSON.parse(readFileSync(`${VOICEPRINTS}/index.json`, 'utf8')).entries
    : []
  if (enrolled.length === 0) {
    console.error(
      '[voice-refs] no voiceprints enrolled yet — at least the chair must be enrolled to seed this',
    )
    process.exit(1)
  }

  mkdirSync(OUT_DIR, { recursive: true })
  const work = resolve(OUT_DIR, plenoId)
  mkdirSync(work, { recursive: true })
  const audio = resolve(work, 'audio.ogg')

  if (!existsSync(audio)) {
    console.log(`[voice-refs] downloading audio for ${plenoId} (${video.ytId})…`)
    execFileSync(
      'yt-dlp',
      ['-q', '--no-warnings', '-f', 'bestaudio', '-o', resolve(work, 'raw.%(ext)s'), video.url],
      { stdio: 'inherit' },
    )
    const raw = execFileSync('sh', ['-c', `ls ${work}/raw.* | head -1`])
      .toString()
      .trim()
    execFileSync('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-i',
      raw,
      '-ac',
      '1',
      '-ar',
      '16000',
      '-c:a',
      'libopus',
      '-b:a',
      '64k',
      audio,
    ])
  }

  // Reference clips, prepared once and reused for every chunk. Because the
  // same references go with each request, an enrolled speaker keeps the SAME
  // name across chunks — only the anonymous A/B/C labels are chunk-local,
  // which is fine since a candidate clip is always cut from its own chunk.
  const refArgs: string[] = []
  for (const e of enrolled) {
    const clip = resolve(work, `ref-${e.slug}.wav`)
    const uri = resolve(work, `ref-${e.slug}.uri`)
    execFileSync('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-ss',
      '2',
      '-t',
      '8',
      '-i',
      `${VOICEPRINTS}/audio/${e.slug}.16k.wav`,
      '-ac',
      '1',
      '-ar',
      '16000',
      clip,
    ])
    const b64 = execFileSync('sh', ['-c', `base64 -i ${clip} | tr -d '\\n'`]).toString()
    writeFileSync(uri, `data:audio/wav;base64,${b64}`)
    refArgs.push(
      '-F',
      `known_speaker_names[]=${e.name}`,
      '-F',
      `known_speaker_references[]=<${uri}`,
    )
  }

  // A full session at 64 kbps blows past the 25 MB upload cap (2.7 h ≈ 77 MB),
  // so walk it in 20-minute pieces (~9.6 MB each). Chunking also lets us stop
  // as soon as we have candidates for everyone still missing, which is what
  // keeps this cheap — most councillors speak in the first hour.
  const CHUNK = 900
  const total = Math.ceil(9655 / CHUNK)
  const segments: DiarSegment[] = []
  const wanted = officials.filter((o) => !enrolled.some((e) => e.slug === o.slug)).length
  const found = new Set<string>()

  for (let c = 0; c * CHUNK < 1e9; c++) {
    const offset = c * CHUNK
    const part = resolve(work, `part-${c}.ogg`)
    execFileSync('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-ss',
      String(offset),
      '-t',
      String(CHUNK),
      '-i',
      audio,
      '-ac',
      '1',
      '-ar',
      '16000',
      '-c:a',
      'libopus',
      '-b:a',
      '64k',
      part,
    ])
    const dur = Number(
      execFileSync('ffprobe', [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'default=nw=1:nk=1',
        part,
      ])
        .toString()
        .trim() || '0',
    )
    if (dur < 5) break // ran past the end of the recording

    process.stdout.write(`[voice-refs] chunk ${c + 1}/~${total} (+${offset}s) … `)
    const resp = execFileSync(
      'curl',
      [
        '-s',
        '--max-time',
        '3600',
        'https://api.openai.com/v1/audio/transcriptions',
        '-H',
        `Authorization: Bearer ${process.env.OPENAI_API_KEY}`,
        '-F',
        `file=@${part}`,
        '-F',
        'model=gpt-4o-transcribe-diarize',
        '-F',
        'response_format=diarized_json',
        '-F',
        'chunking_strategy=auto',
        ...refArgs,
      ],
      { maxBuffer: 1024 * 1024 * 256 },
    ).toString()
    const data = JSON.parse(resp)
    if (data.error) {
      console.log(`API error: ${data.error.message}`)
      break
    }
    const part_segs: DiarSegment[] = (data.segments || []).map((s: any) => ({
      start: Number(s.start) + offset,
      end: Number(s.end) + offset,
      // Namespace anonymous clusters per chunk; "A" in chunk 2 is not "A" in
      // chunk 1. Enrolled names are global and must stay untouched.
      speaker: enrolled.some((e) => e.name === s.speaker)
        ? String(s.speaker)
        : `c${c}-${String(s.speaker)}`,
      text: String(s.text || ''),
    }))
    segments.push(...part_segs)
    for (const p of proposeFromSegments(segments, officials, new Set(enrolled.map((e) => e.name))))
      found.add(p.slug)
    console.log(`${part_segs.length} segs · ${found.size}/${wanted} councillors proposed so far`)
    if (found.size >= wanted) break
  }
  const knownSpeakers = new Set(enrolled.map((e) => e.name))
  const already = new Set(enrolled.map((e) => e.slug))
  const proposals = proposeFromSegments(segments, officials, knownSpeakers).filter(
    (p) => !already.has(p.slug),
  )

  // Cut an 8-second clip per proposed cluster so the curator can listen.
  for (const p of proposals) {
    const run = longestRunFor(segments, p.cluster)
    if (!run) continue
    const mid = Math.max(0, (run.start + run.end) / 2 - 4)
    const clip = resolve(work, `candidate-${p.slug}.wav`)
    execFileSync('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-ss',
      String(mid),
      '-t',
      '8',
      '-i',
      audio,
      '-ac',
      '1',
      '-ar',
      '16000',
      clip,
    ])
    ;(p as any).clip = clip
    ;(p as any).clusterSeconds = segments
      .filter((s) => s.speaker === p.cluster)
      .reduce((a, s) => a + (s.end - s.start), 0)
  }

  const outFile = resolve(OUT_DIR, `${plenoId}.json`)
  writeFileSync(
    outFile,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        plenoId,
        plenoDate: pleno.date,
        model: 'gpt-4o-transcribe-diarize',
        knownVoices: enrolled.map((e) => e.slug),
        clustersFound: [...new Set(segments.map((s) => s.speaker))],
        requiresHumanApproval: true,
        proposals,
      },
      null,
      2,
    ) + '\n',
  )

  console.log(`\n[voice-refs] ${proposals.length} candidate(s) → ${outFile}`)
  for (const p of proposals) {
    console.log(`  ${p.slug.padEnd(34)} cluster=${p.cluster}  @${Math.round(p.at)}s`)
    console.log(`      announced as: …${p.evidence}`)
    console.log(`      listen: ${(p as any).clip}`)
  }
  console.log(
    `\nConfirm by ear, then: npm run enroll-voice -- --slug <slug> --audio <clip>\n` +
      `Nothing was enrolled automatically.`,
  )
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('[voice-refs] failed:', err)
    process.exit(1)
  })
}
