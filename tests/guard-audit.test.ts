import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, it, expect } from 'vitest'
import {
  auditFails,
  classifyInjection,
  classifyWiring,
  importedModules,
  invokesGuard,
  juntarInyecciones,
  juzgarInyeccion,
  scriptTargets,
  sinComentarios,
  summarise,
  testsForScript,
  wiringFor,
  type InjectionVerdict,
} from '../src/scraper/guard-audit'

const OK: InjectionVerdict = { state: 'proven', detail: '' }

describe('guard-audit — un orquestador .ts también es un sitio de llamada', () => {
  // EL DEFECTO: `callSites()` miraba `.sh`, workflows y ganchos. `monitor:health`
  // corre dieciséis guardas desde TypeScript con `runCheck()`, así que
  // `check:stamps` —cuyo único sitio de llamada es ése— salía SIN INVOCAR
  // mientras la nocturna lo corría cada noche. Y eso enseña a no creerse el rojo
  // de la auditoría, que es el paso previo a apagarla.

  it('ve la guarda que sólo corre desde monitor-health', () => {
    const cuerpo = readFileSync(resolve('scripts/monitor-health.ts'), 'utf8')
    expect(invokesGuard(sinComentarios(cuerpo), 'check:stamps')).toBe(true)
  })

  it('LA TRAMPA: un comentario que la nombra NO la enchufa', () => {
    const cuerpo = [
      '// Aquí explicamos por qué NO corremos check:contract-drift, que pide modelo.',
      '/* necesita un modelo y CI no tiene. */',
      "for (const c of ['check:json']) runCheck(c)",
    ].join('\n')
    expect(invokesGuard(cuerpo, 'check:contract-drift')).toBe(true) // en crudo, sí
    expect(invokesGuard(sinComentarios(cuerpo), 'check:contract-drift')).toBe(false)
    expect(invokesGuard(sinComentarios(cuerpo), 'check:json')).toBe(true)
  })

  it('sinComentarios no se come una URL, que lleva // dentro', () => {
    const cuerpo = "const u = 'https://example.org/check:json'"
    expect(sinComentarios(cuerpo)).toContain('https://example.org/check:json')
  })

  it('EL AUDITOR NO SE CUENTA A SÍ MISMO', () => {
    // `check-guards.ts` nombra a las 34 guardas en sus tablas de inyección. Si
    // entrara en su propio barrido, las declararía todas enchufadas en sí mismo
    // —incluida la que es manual a propósito— y no podría volver a encontrar un
    // huérfano jamás. Se comprueba sobre la salida REAL, no sobre una copia de
    // la regla.
    const salida = execFileSync('npx', ['tsx', 'scripts/check-guards.ts', '--json'], {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    })
    const j = JSON.parse(salida) as { guards: Array<{ name: string; wiredIn: string[] }> }
    const seCuenta = j.guards.filter((g) => g.wiredIn.some((p) => p.includes('check-guards.ts')))
    expect(seCuenta.map((g) => g.name)).toEqual([])
    // Y la auditoría sigue distinguiendo lo manual de lo huérfano.
    expect(j.guards.some((g) => g.wiredIn.length === 0)).toBe(true)
  }, 120_000)
})

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

describe('guard-audit — manual-only is not the same as forgotten', () => {
  // This case caught its own author: check:contract-drift is deliberately in no
  // pipeline (it needs a model, CI has none), and the audit flagged it as an
  // orphan and exited 1. Same collapse the injection column had.
  it('a guard with call sites is wired', () => {
    expect(classifyWiring(['scripts/scrape-all.sh'])).toBe('wired')
  })

  it('no call sites and a stated reason is manual, not an orphan', () => {
    expect(classifyWiring([], 'necesita un modelo y CI no lo tiene')).toBe('manual')
  })

  it('no call sites and NO reason is still an orphan, and still fails', () => {
    expect(classifyWiring([])).toBe('orphan')
    expect(auditFails(summarise([{ wiredIn: [], testedBy: ['t'], verdict: OK }]))).toBe(true)
  })

  it('an empty reason string does not buy an exemption', () => {
    // Otherwise `MANUAL_ONLY[name]` returning '' would silently launder an orphan.
    expect(classifyWiring([], '')).toBe('orphan')
  })

  it('a documented manual guard does NOT fail the audit', () => {
    expect(
      auditFails(
        summarise([{ wiredIn: [], testedBy: ['t'], verdict: OK, manualReason: 'a propósito' }]),
      ),
    ).toBe(false)
  })

  it('counts manual separately from orphaned, so neither hides in the other', () => {
    const s = summarise([
      { wiredIn: ['a.sh'], testedBy: ['t'], verdict: OK },
      { wiredIn: [], testedBy: ['t'], verdict: OK, manualReason: 'a propósito' },
      { wiredIn: [], testedBy: ['t'], verdict: OK },
    ])
    expect(s.notInvoked).toBe(1)
    expect(s.manual).toBe(1)
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

describe('guard-audit — una inyección sólo prueba algo contra una guarda en verde', () => {
  // EL DEFECTO (04-10-2026): el arnés juzgaba una inyección sólo por el código
  // de salida de la guarda CON la inyección puesta. Entre #226 —que dejó
  // `check:veredictos` saliendo 1 por una entrada del overlay por encima de su
  // base— y #228, donde una persona la firmó a la baja, cualquier inyección en
  // esa guarda se habría leído FIRES: ya salía roja sin que nadie le inyectara
  // nada. Y hay guardas rojas a propósito (`check:claim-provenance`).
  const verde = { status: 0, salida: '[check-x] 12 evaluado(s) · 0 rotos\n' }
  const roja = {
    status: 1,
    salida: '  ✗ [por-encima] c-1: publica verificado y la base dice sin-datos\n',
  }

  it('LA TRAMPA: ya roja sin inyección, su rojo con ella no la da por probada', () => {
    const j = juzgarInyeccion({ sinInyeccion: roja, conInyeccion: roja })
    expect(j.fired).not.toBe(true)
    expect(j.unproven).toBeTruthy()
  })

  it('ni hace falta inyectarla: su rojo de antes ya dice que no probará nada', () => {
    const j = juzgarInyeccion({ sinInyeccion: roja, conInyeccion: null })
    expect(j.fired).toBeNull()
    expect(j.unproven).toBeTruthy()
  })

  it('una guarda que no llega a terminar sin inyección tampoco es una base verde', () => {
    // `spawnSync` da `status: null` si la mata una señal, desborda el búfer o
    // no arranca; `status !== 0` lo leía como rojo, y con inyección, FIRES.
    const sinTerminar = { status: null, salida: '' }
    expect(juzgarInyeccion({ sinInyeccion: sinTerminar, conInyeccion: roja }).fired).not.toBe(true)
  })

  it('verde sin inyección y roja con ella: probada', () => {
    expect(juzgarInyeccion({ sinInyeccion: verde, conInyeccion: roja })).toEqual({ fired: true })
  })

  it('verde con y sin inyección: muda — el defecto que la auditoría existe para cazar', () => {
    expect(juzgarInyeccion({ sinInyeccion: verde, conInyeccion: verde })).toEqual({ fired: false })
  })

  it('roja con la inyección pero sin lo que espera ver: tampoco prueba nada', () => {
    // Si `validateOverlay` dejara de aceptar lo que inyecta la del overlay, la
    // guarda reventaría al cargarlo y saldría 1: FIRES, pero por otra cosa.
    const reventada = {
      status: 1,
      salida: 'Error: [overlay] k4olcs-006-afi-462d5e: bad source llm\n    at validateOverlay',
    }
    const j = juzgarInyeccion({
      sinInyeccion: verde,
      conInyeccion: reventada,
      espera: /\[por-encima\]/,
    })
    expect(j.fired).toBeNull()
    expect(classifyInjection({ hasInjection: true, ...j }).state).toBe('unproven')
  })

  it('roja con la inyección y con lo que espera ver: probada', () => {
    const j = juzgarInyeccion({ sinInyeccion: verde, conInyeccion: roja, espera: /\[por-encima\]/ })
    expect(j).toEqual({ fired: true })
  })

  it('una inyección sin prueba no es probada ni muda, y el informe dice por qué', () => {
    const v = classifyInjection({
      hasInjection: true,
      fired: null,
      unproven: 'la guarda ya sale roja sin inyección (sale 1): la inyección no prueba nada',
    })
    expect(v.state).toBe('unproven')
    expect(v.detail).toContain('roja sin inyección')
  })
})

describe('guard-audit — una guarda con varias inyecciones', () => {
  it('una muda hace muda a la guarda, aunque otra no se haya podido correr', () => {
    // `some(null)` se miraba primero: una muda junto a otra sin fichero salía
    // «no ejercitada» y la auditoría daba 0 — al revés de lo que promete el
    // propio campo, «Falso si CUALQUIERA de sus inyecciones no disparó».
    const j = juntarInyecciones([
      { describe: 'a', fired: false },
      { describe: 'b', fired: null, note: 'x.json missing — not exercised' },
    ])
    expect(classifyInjection({ hasInjection: true, ...j }).state).toBe('silent')
  })

  it('y aunque la otra no pruebe nada: una muda no se esconde detrás de nada', () => {
    const j = juntarInyecciones([
      { describe: 'a', fired: false },
      { describe: 'b', fired: null, unproven: 'sale roja, pero no por lo inyectado' },
    ])
    expect(classifyInjection({ hasInjection: true, ...j }).state).toBe('silent')
  })

  it('sin prueba pesa más que no ejercitada: que la guarda ya está roja se dice', () => {
    const j = juntarInyecciones([
      { describe: 'a', fired: null, note: 'x.json missing — not exercised' },
      { describe: 'b', fired: null, unproven: 'la guarda ya sale roja sin inyección' },
    ])
    expect(classifyInjection({ hasInjection: true, ...j }).state).toBe('unproven')
  })

  it('probada sólo si disparan todas', () => {
    const una = juntarInyecciones([
      { describe: 'a', fired: true },
      { describe: 'b', fired: null, note: 'x.json missing — not exercised' },
    ])
    expect(classifyInjection({ hasInjection: true, ...una }).state).toBe('not-run')
    const todas = juntarInyecciones([
      { describe: 'a', fired: true },
      { describe: 'b', fired: true },
    ])
    expect(classifyInjection({ hasInjection: true, ...todas }).state).toBe('proven')
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

  it('una guarda sin prueba se informa y no tumba la auditoría', () => {
    // Roja ya sin inyección es un hecho de la guarda, que ella misma informa
    // donde corre; tumbar aquí por eso dejaría la auditoría roja para siempre
    // con una guarda roja a propósito, y una auditoría siempre roja se apaga.
    expect(auditFails(summarise([row(1, 1, 'unproven')]))).toBe(false)
  })

  it('counts each state separately so no number can hide inside another', () => {
    const s = summarise([
      row(1, 1, 'proven'),
      row(1, 0, 'undefined'),
      row(0, 1, 'not-injectable'),
      row(1, 1, 'not-run'),
      row(1, 1, 'silent'),
      row(1, 1, 'unproven'),
    ])
    expect(s).toEqual({
      total: 6,
      notInvoked: 1,
      manual: 0,
      untested: 1,
      proven: 1,
      silent: 1,
      unproven: 1,
      notRun: 1,
      undefinedInjection: 1,
      notInjectable: 1,
    })
  })
})
