import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { semanticLocalHits } from '../src/scraper/journalist-tools/local'
import type { AgentCorpusRow } from '../src/scraper/agent-corpus'

function mkRow(
  id: string,
  embedding: number[],
  overrides: Partial<AgentCorpusRow> = {},
): AgentCorpusRow {
  return {
    kind: 'transcript',
    sourceId: `transcript:aaa#${id}`,
    text: `texto ${id}`,
    textSha256: 'x'.repeat(64),
    embedding,
    snippet: `snippet ${id}`,
    ref: '/plenos/aaa',
    localPath: 'public/data/pleno-transcripts/aaa.txt',
    meta: { plenoId: 'aaa' },
    ...overrides,
  }
}

function writeCorpus(rows: AgentCorpusRow[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'sem-local-'))
  const file = join(dir, 'agent-corpus.jsonl')
  writeFileSync(file, rows.map((r) => JSON.stringify(r)).join('\n') + '\n')
  return file
}

describe('semanticLocalHits', () => {
  it('returns topK LocalHits in score order with matchedField=semantic', async () => {
    const cachePath = writeCorpus([
      mkRow('far', [0, 1, 0]),
      mkRow('near', [1, 0, 0]),
      mkRow('mid', [0.7, 0.7, 0]),
    ])
    const hits = await semanticLocalHits('depuradora', {
      cachePath,
      topK: 2,
      embedFn: async () => [1, 0, 0],
    })
    expect(hits).toHaveLength(2)
    expect(hits[0].matchedField).toBe('semantic')
    expect(hits[0].preview).toBe('snippet near')
    expect(hits[0].localPath).toBe('public/data/pleno-transcripts/aaa.txt')
    expect((hits[0].row as { sourceId: string }).sourceId).toContain('near')
    expect((hits[1].row as { sourceId: string }).sourceId).toContain('mid')
  })

  it('resolves to [] when the cache file is missing (graceful degrade)', async () => {
    const hits = await semanticLocalHits('depuradora', {
      cachePath: '/definitely/not/here.jsonl',
      embedFn: async () => [1, 0, 0],
    })
    expect(hits).toEqual([])
  })

  it('resolves to [] when the embed backend fails', async () => {
    const cachePath = writeCorpus([mkRow('a', [1, 0, 0])])
    const hits = await semanticLocalHits('depuradora', {
      cachePath,
      embedFn: async () => {
        throw new Error('no backend')
      },
    })
    expect(hits).toEqual([])
  })

  it('resolves to [] for an empty query', async () => {
    const cachePath = writeCorpus([mkRow('a', [1, 0, 0])])
    const hits = await semanticLocalHits('   ', {
      cachePath,
      embedFn: async () => [1, 0, 0],
    })
    expect(hits).toEqual([])
  })
})

describe('semanticLocalHits dimension guard', () => {
  it('resolves to [] when the query dim mismatches the corpus dim', async () => {
    const cachePath = writeCorpus([mkRow('a', [1, 0, 0])])
    const hits = await semanticLocalHits('depuradora', {
      cachePath,
      embedFn: async () => [1, 0, 0, 0, 0], // 5-dim query vs 3-dim corpus
    })
    expect(hits).toEqual([])
  })
})
