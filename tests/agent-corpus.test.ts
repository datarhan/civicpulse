import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  chunkTranscript,
  buildAgentCorpusTexts,
  loadAgentCorpus,
  rankAgentCorpus,
  type AgentCorpusRow,
} from '../src/scraper/agent-corpus'

function longTranscript(lines = 120): string {
  return Array.from(
    { length: lines },
    (_, i) =>
      `(SPEAKER_0${i % 4}) línea ${i + 1} del pleno con contenido suficiente para sumar caracteres al bloque`,
  ).join('\n')
}

describe('chunkTranscript', () => {
  it('splits a long transcript into overlapping line windows with 1-based offsets', () => {
    const text = longTranscript(120)
    const chunks = chunkTranscript(text)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks[0].startLine).toBe(1)
    expect(chunks[chunks.length - 1].endLine).toBe(120)
    for (const c of chunks) {
      expect(c.text.length).toBeLessThanOrEqual(1600)
      expect(c.endLine).toBeGreaterThanOrEqual(c.startLine)
    }
    // consecutive windows overlap: next starts before previous ended
    for (let i = 1; i < chunks.length; i += 1) {
      expect(chunks[i].startLine).toBeLessThanOrEqual(chunks[i - 1].endLine)
      expect(chunks[i].startLine).toBeGreaterThan(chunks[i - 1].startLine)
    }
  })

  it('returns a single chunk for a short transcript', () => {
    const chunks = chunkTranscript('línea uno\nlínea dos\nlínea tres')
    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toMatchObject({ startLine: 1, endLine: 3 })
  })
})

describe('buildAgentCorpusTexts', () => {
  const press = [
    {
      id: 'p-1',
      title: 'El Ayuntamiento licita la depuradora',
      source: 'Levante-EMV',
      link: 'https://x.test/a',
    },
  ]

  it('emits transcript rows with sourceId/localPath/ref metadata', () => {
    const rows = buildAgentCorpusTexts({
      transcripts: new Map([['k4olcs', longTranscript(80)]]),
      press,
    })
    const t = rows.filter((r) => r.kind === 'transcript')
    expect(t.length).toBeGreaterThan(0)
    expect(t[0].sourceId).toMatch(/^transcript:k4olcs#L1-L\d+$/)
    expect(t[0].localPath).toBe('public/data/pleno-transcripts/k4olcs.txt')
    expect(t[0].ref).toBe('/plenos/k4olcs')
    expect(t[0].meta.plenoId).toBe('k4olcs')
    expect(t[0].textSha256).toMatch(/^[0-9a-f]{64}$/)
  })

  it('emits press rows keyed by press id with the article link as ref', () => {
    const rows = buildAgentCorpusTexts({ transcripts: new Map(), press })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      kind: 'press',
      sourceId: 'press:p-1',
      ref: 'https://x.test/a',
      localPath: 'public/data/press.json',
    })
    expect(rows[0].text).toContain('depuradora')
    expect(rows[0].text).toContain('Levante-EMV')
  })

  it('is deterministic — same input, same shas', () => {
    const input = { transcripts: new Map([['aaa', longTranscript(40)]]), press }
    const a = buildAgentCorpusTexts(input)
    const b = buildAgentCorpusTexts(input)
    expect(a.map((r) => r.textSha256)).toEqual(b.map((r) => r.textSha256))
  })
})

describe('loadAgentCorpus', () => {
  it('keeps valid rows, skips corrupt lines and foreign kinds', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agent-corpus-'))
    const file = join(dir, 'c.jsonl')
    const good: AgentCorpusRow = {
      kind: 'transcript',
      sourceId: 'transcript:aaa#L1-L10',
      text: 'hola',
      textSha256: 'x'.repeat(64),
      embedding: [0.1, 0.2],
      snippet: 'hola',
      ref: '/plenos/aaa',
      localPath: 'public/data/pleno-transcripts/aaa.txt',
      meta: { plenoId: 'aaa', startLine: 1, endLine: 10 },
    }
    writeFileSync(
      file,
      [JSON.stringify(good), '{corrupt', JSON.stringify({ ...good, kind: 'tender' })].join('\n'),
    )
    const corpus = loadAgentCorpus(file)
    expect(corpus.rows).toHaveLength(1)
    expect(corpus.rows[0].sourceId).toBe('transcript:aaa#L1-L10')
  })

  it('throws a clear error when the cache file is absent', () => {
    expect(() => loadAgentCorpus('/nope/missing.jsonl')).toThrow(/not found/)
  })
})

describe('rankAgentCorpus', () => {
  const mkRow = (id: string, embedding: number[]): AgentCorpusRow => ({
    kind: 'press',
    sourceId: id,
    text: id,
    textSha256: 'x'.repeat(64),
    embedding,
    snippet: id,
    ref: 'https://x.test',
    localPath: 'public/data/press.json',
    meta: {},
  })

  it('orders by cosine similarity and honors topK', () => {
    const rows = [mkRow('far', [0, 1, 0]), mkRow('near', [1, 0.01, 0]), mkRow('mid', [0.7, 0.7, 0])]
    const ranked = rankAgentCorpus([1, 0, 0], rows, 2)
    expect(ranked).toHaveLength(2)
    expect(ranked[0].row.sourceId).toBe('near')
    expect(ranked[1].row.sourceId).toBe('mid')
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score)
  })
})
