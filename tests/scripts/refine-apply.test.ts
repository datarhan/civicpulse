import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { applyRefinement } from '../../scripts/refine-transcript'

function withTmp(fn: (dir: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), 'refine-apply-'))
  try {
    fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('applyRefinement — non-destructive --apply', () => {
  it('backs up the pristine original to .orig and applies the refined text', () => {
    withTmp((dir) => {
      const txt = join(dir, 'p1.txt')
      const refined = `${txt}.refined`
      writeFileSync(txt, 'ORIGINAL whisper output', 'utf8')
      writeFileSync(refined, 'REFINED proper nouns', 'utf8')
      const r = applyRefinement(txt, refined)
      expect(r.backedUp).toBe(true)
      expect(existsSync(r.backupPath)).toBe(true)
      expect(readFileSync(r.backupPath, 'utf8')).toBe('ORIGINAL whisper output')
      expect(readFileSync(txt, 'utf8')).toBe('REFINED proper nouns')
      expect(existsSync(refined)).toBe(false) // renamed away
    })
  })

  it('preserves the FIRST original across a second apply (does not clobber .orig)', () => {
    withTmp((dir) => {
      const txt = join(dir, 'p1.txt')
      writeFileSync(txt, 'ORIGINAL', 'utf8')
      writeFileSync(`${txt}.refined`, 'REFINED-1', 'utf8')
      applyRefinement(txt, `${txt}.refined`)
      // Re-refine from the once-refined transcript and apply again.
      writeFileSync(`${txt}.refined`, 'REFINED-2', 'utf8')
      const r2 = applyRefinement(txt, `${txt}.refined`)
      expect(r2.backedUp).toBe(false) // .orig already exists → not overwritten
      expect(readFileSync(`${txt}.orig`, 'utf8')).toBe('ORIGINAL') // pristine preserved
      expect(readFileSync(txt, 'utf8')).toBe('REFINED-2')
    })
  })

  it('refuses to apply when the refined file is missing', () => {
    withTmp((dir) => {
      const txt = join(dir, 'p1.txt')
      writeFileSync(txt, 'ORIGINAL', 'utf8')
      expect(() => applyRefinement(txt, `${txt}.refined`)).toThrow(/refined/i)
    })
  })
})
