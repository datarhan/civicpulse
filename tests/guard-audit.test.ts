import { describe, it, expect } from 'vitest'
import {
  auditFails,
  classifyInjection,
  importedModules,
  invokesGuard,
  scriptTargets,
  summarise,
  testsForScript,
  wiringFor,
  type InjectionVerdict,
} from '../src/scraper/guard-audit'

describe('guard-audit — is this guard invoked?', () => {
  it('finds a guard in an npm-run line', () => {
    expect(invokesGuard('npm run check:json\n', 'check:json')).toBe(true)
  })

  it('does NOT match a guard whose name is a prefix of another', () => {
    // The live pair: `check:transcripts` and `check:transcription-health`.
    // Without the boundary, the shorter one reports itself wired everywhere
    // the longer one runs — coverage invented out of a substring.
    expect(invokesGuard('npm run check:transcription-health', 'check:transcripts')).toBe(false)
    expect(invokesGuard('npm run check:finding-entities', 'check:finding')).toBe(false)
  })

  it('still matches when the guard is followed by flags or a pipe', () => {
    expect(invokesGuard('npm run check:citations -- --offline', 'check:citations')).toBe(true)
    expect(invokesGuard('npm run --silent check:drift 2>&1 | tail -3', 'check:drift')).toBe(true)
  })

  it('names every call site, not just the first', () => {
    const sites = new Map([
      ['scripts/scrape-all.sh', 'npm run check:json'],
      ['.husky/pre-commit', 'npm run check:json'],
      ['scripts/other.sh', 'nada que ver'],
    ])
    expect(wiringFor('check:json', sites)).toEqual(['scripts/scrape-all.sh', '.husky/pre-commit'])
  })

  it('reports an unwired guard as an empty list, never as absent', () => {
    expect(wiringFor('check:nadie', new Map([['a.sh', 'npm run check:json']]))).toEqual([])
  })
})

describe('guard-audit — which tests exercise it', () => {
  const source = `
    import { detectDrift } from '../src/scraper/prose-drift'
    import { readFileSync } from 'node:fs'
  `

  it('resolves through the module graph, not the guard name', () => {
    // The 4× error: a grep for "check:drift" finds nothing, because the test
    // imports the MODULE. `scripts/check-relations.ts` is a thin CLI.
    const tests = new Map([['prose-drift.test.ts', "from '../src/scraper/prose-drift'"]])
    expect(testsForScript(source, 'scripts/check-prose-drift', tests)).toEqual([
      'prose-drift.test.ts (via prose-drift)',
    ])
  })

  it('says "direct" when the test imports the script itself', () => {
    const tests = new Map([
      ['check-finding-quotes.test.ts', "from '../scripts/check-finding-quotes'"],
    ])
    expect(testsForScript('', 'scripts/check-finding-quotes', tests)).toEqual([
      'check-finding-quotes.test.ts (direct)',
    ])
  })

  it('names the shared module rather than implying the guard is covered', () => {
    // `quote-match` is imported by three guards. A bare tick would make ANY
    // test of it look like coverage of all three — the same over-claiming this
    // whole audit exists to stop.
    const shared = "import { quoteAppearsIn } from '../src/scraper/quote-match'"
    const tests = new Map([['citation-check.test.ts', "from '../src/scraper/quote-match'"]])
    expect(testsForScript(shared, 'scripts/check-citations', tests)[0]).toContain(
      '(via quote-match)',
    )
  })

  it('finds nothing when nothing imports the guard or its modules', () => {
    expect(
      testsForScript(source, 'scripts/check-prose-drift', new Map([['x.test.ts', 'nada']])),
    ).toEqual([])
  })

  it('ignores node builtins when listing imported modules', () => {
    expect(importedModules(source)).toEqual(['src/scraper/prose-drift'])
  })
})

describe('guard-audit — following a shell orchestrator', () => {
  // `check:corpus` is `bash scripts/verify-transcript-corpus.sh`, and the logic
  // is two layers down. Stopping at the .sh reported it untested while its
  // arithmetic had ten tests — off by a layer, same family as off by a name.
  const shell = 'npx tsx scripts/corpus-delta.ts "$CUR" "$BASELINE"'
  const read = (p: string) => (p === 'scripts/verify-transcript-corpus.sh' ? shell : null)

  it('reaches the tsx script a bash guard runs', () => {
    expect(scriptTargets('bash scripts/verify-transcript-corpus.sh', read)).toEqual([
      'scripts/verify-transcript-corpus.sh',
      'scripts/corpus-delta.ts',
    ])
  })

  it('handles the ordinary single-script case', () => {
    expect(scriptTargets('npx tsx scripts/check-json.ts', () => null)).toEqual([
      'scripts/check-json.ts',
    ])
  })

  it('does not loop forever on a script that runs itself', () => {
    const selfish = (p: string) => (p.endsWith('.sh') ? 'bash scripts/loop.sh' : null)
    expect(() => scriptTargets('bash scripts/loop.sh', selfish)).not.toThrow()
    expect(scriptTargets('bash scripts/loop.sh', selfish)).toEqual(['scripts/loop.sh'])
  })

  it('returns nothing for a command that runs no script', () => {
    expect(scriptTargets('eslint .', () => null)).toEqual([])
  })
})

describe('guard-audit — three injection states, not two', () => {
  it('an injection that fired is proven', () => {
    expect(classifyInjection({ hasInjection: true, fired: true }).state).toBe('proven')
  })

  it('an injection that did NOT fire is a real defect', () => {
    expect(classifyInjection({ hasInjection: true, fired: false }).state).toBe('silent')
  })

  it('an injection that exists but was not run this pass is neither', () => {
    // This is the distinction that was missing: on a plain wiring run NOTHING
    // is injected, and reading that as "no injection defined" made four
    // written injections report as four missing ones.
    expect(classifyInjection({ hasInjection: true, fired: null }).state).toBe('not-run')
  })

  it('separates "nobody wrote one" from "nobody can write one here"', () => {
    expect(classifyInjection({ hasInjection: false, fired: null }).state).toBe('undefined')
    const reasoned = classifyInjection({
      hasInjection: false,
      fired: null,
      notInjectableReason: 'su fallo es el paso del tiempo',
    })
    expect(reasoned.state).toBe('not-injectable')
    expect(reasoned.detail).toContain('tiempo')
  })

  it('a stated reason does not override a real injection result', () => {
    const v = classifyInjection({
      hasInjection: true,
      fired: false,
      notInjectableReason: 'da igual lo que ponga aquí',
    })
    expect(v.state).toBe('silent')
  })
})

describe('guard-audit — what makes the audit itself fail', () => {
  const row = (wired: number, tested: number, state: InjectionVerdict['state']) => ({
    wiredIn: Array(wired).fill('x'),
    testedBy: Array(tested).fill('y'),
    verdict: { state, detail: '' } as InjectionVerdict,
  })

  it('an unwired guard fails the audit', () => {
    expect(auditFails(summarise([row(0, 1, 'proven')]))).toBe(true)
  })

  it('a guard silent on its own fault fails the audit', () => {
    expect(auditFails(summarise([row(1, 1, 'silent')]))).toBe(true)
  })

  it('a missing test does NOT fail it — that is a policy change, reported not enforced', () => {
    expect(auditFails(summarise([row(1, 0, 'proven')]))).toBe(false)
  })

  it('a missing injection does NOT fail it either', () => {
    expect(auditFails(summarise([row(1, 1, 'undefined')]))).toBe(false)
  })

  it('counts each state separately so no number can hide inside another', () => {
    const s = summarise([
      row(1, 1, 'proven'),
      row(1, 0, 'undefined'),
      row(0, 1, 'not-injectable'),
      row(1, 1, 'not-run'),
      row(1, 1, 'silent'),
    ])
    expect(s).toEqual({
      total: 5,
      notInvoked: 1,
      untested: 1,
      proven: 1,
      silent: 1,
      notRun: 1,
      undefinedInjection: 1,
      notInjectable: 1,
    })
  })
})
