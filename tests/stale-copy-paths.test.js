import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { spawnSync, execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import {
  avisoPara,
  decideRecordatorio,
  GIT_STATUS_SNAPSHOTS,
  novedades,
  rutasAfectadas,
  snapshotDe,
  snapshotsDeEstado,
  PROSA_POR_SNAPSHOT,
  MAPA_CARGADO,
} from '../.claude/hooks/stale-copy-paths.mjs'

// El recordatorio existe porque tres frases se quedaron viejas en una sola
// sesión y ningún test las cazó: los datos estaban bien y las guardas
// comprueban datos. Si este control deja de disparar, tampoco lo nota nadie —
// así que se prueba como se prueba un adaptador.
//
// Y ya pasó: este fichero estuvo en verde mientras el aviso no llegaba a nadie.
// La prueba leía stderr, y con código 0 Claude Code manda stderr sólo al log de
// depuración. Aquí se lee lo que lee el modelo.

const RUNNER = resolve(__dirname, '../.claude/hooks/remind-stale-copy.mjs')

// Lo que el runner recuerda haber contado va a un directorio de la prueba, no
// al de las sesiones de verdad.
let memoriaComun
beforeAll(() => {
  memoriaComun = mkdtempSync(join(tmpdir(), 'prosa-memoria-'))
})
afterAll(() => rmSync(memoriaComun, { recursive: true, force: true }))

/** Corre el runner como lo corre Claude Code: la llamada por stdin. */
const correr = (payload, memoria = memoriaComun) => {
  const r = spawnSync('node', [RUNNER], {
    input: typeof payload === 'string' ? payload : JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, CIVICPULSE_PROSA_ESTADO: memoria },
  })
  return { stdout: r.stdout ?? '', stderr: r.stderr ?? '', code: r.status }
}

/** El aviso tal y como le llega al modelo: JSON por stdout, junto al resultado. */
const contextoDe = (stdout) => {
  const salida = JSON.parse(stdout)
  expect(salida.hookSpecificOutput.hookEventName).toBe('PostToolUse')
  expect(typeof salida.hookSpecificOutput.additionalContext).toBe('string')
  return salida.hookSpecificOutput.additionalContext
}

const SILENCIO = { stdout: '', stderr: '', code: 0 }

describe('hooks/stale-copy — a qué snapshot le sigue prosa', () => {
  it('reconoce un snapshot publicado y lo separa de cualquier otro json', () => {
    expect(snapshotDe('public/data/indicadores.json')).toBe('indicadores.json')
    expect(snapshotDe('/abs/repo/public/data/pmp.json')).toBe('pmp.json')
    expect(snapshotDe('src/scraper/indicadores.ts')).toBeNull()
    expect(snapshotDe('package.json')).toBeNull()
    expect(snapshotDe('public/data/pleno-claims/x.json')).toBeNull() // troceados, sin prosa propia
    expect(snapshotDe(undefined)).toBeNull()
  })

  it('nombra las páginas que describen ese dato con palabras', () => {
    expect(rutasAfectadas('public/data/indicadores.json')).toContain('/eficiencia')
    expect(rutasAfectadas('public/data/budget.json')).toContain('/presupuesto')
    expect(rutasAfectadas('public/data/quejas.json')).toContain('/quejas')
  })

  it('el mapa está DERIVADO del código y sigue al día', () => {
    // La primera versión traía nueve entradas escritas a mano; el código tenía
    // sesenta y cuatro. Una tabla a mano dentro de un control contra el desfase
    // se desfasa sola, así que aquí se regenera y se compara.
    const r = spawnSync('npx', ['tsx', 'scripts/build-prose-map.ts', '--check'], {
      cwd: resolve(__dirname, '..'),
      encoding: 'utf8',
    })
    expect(r.stderr + r.stdout).not.toMatch(/no coincide/)
    expect(r.status).toBe(0)
  })

  it('el mapa se carga de verdad, y no calla por no encontrarlo', () => {
    // Un mapa que no carga y un mapa sin nada que avisar dan el mismo silencio.
    expect(MAPA_CARGADO).toBe(true)
  })

  it('cubre bastante más que la tabla a mano que sustituyó', () => {
    expect(Object.keys(PROSA_POR_SNAPSHOT).length).toBeGreaterThan(40)
  })

  it('calla ante un snapshot que ninguna página lee', () => {
    // place-overrides.json lo consumen los CLIs, no el navegador: no hay prosa
    // que se pueda quedar vieja, y avisar sería ruido. El mapa dice «esto lleva
    // prosa detrás», no «esto importa».
    expect(rutasAfectadas('public/data/place-overrides.json')).toEqual([])
    expect(
      decideRecordatorio({
        tool_name: 'Write',
        tool_input: { file_path: 'public/data/place-overrides.json' },
      }),
    ).toBeNull()
    // …y sí avisa de uno que sí se lee, para que el silencio signifique algo.
    expect(rutasAfectadas('public/data/streets.json')).toContain('/datos')
  })

  it('sólo se activa al escribir, no al leer', () => {
    const input = { file_path: 'public/data/indicadores.json' }
    expect(decideRecordatorio({ tool_name: 'Write', tool_input: input })).toBeTruthy()
    expect(decideRecordatorio({ tool_name: 'Edit', tool_input: input })).toBeTruthy()
    expect(decideRecordatorio({ tool_name: 'Read', tool_input: input })).toBeNull()
    // Un Bash no se decide por la llamada, que no dice qué escribió, sino por el
    // árbol: ver «lo que reescribe un script por Bash» más abajo.
    expect(decideRecordatorio({ tool_name: 'Bash', tool_input: { command: 'ls' } })).toBeNull()
  })

  it('el aviso nombra la ruta y el comando que hay que correr', () => {
    const aviso = decideRecordatorio({
      tool_name: 'Write',
      tool_input: { file_path: 'public/data/indicadores.json' },
    })
    expect(aviso).toContain('/eficiencia')
    expect(aviso).toContain('review:surfaces')
  })

  it('cada entrada apunta a rutas con pinta de ruta', () => {
    for (const [snap, rutas] of Object.entries(PROSA_POR_SNAPSHOT)) {
      expect(snap).toMatch(/\.json$/)
      expect(rutas.length).toBeGreaterThan(0)
      for (const r of rutas) expect(r).toMatch(/^\//)
    }
  })

  it('recorta el aviso cuando un snapshot toca demasiadas rutas', () => {
    // tenders.json lo leen once páginas: nombrarlas todas deja de señalar nada.
    const aviso = decideRecordatorio({
      tool_name: 'Write',
      tool_input: { file_path: 'public/data/tenders.json' },
    })
    expect(aviso).toMatch(/ruta\(s\) más/)
    expect(aviso.split('review:surfaces')[1].trim().split(/\s+/).length).toBeLessThanOrEqual(5)
  })
})

describe('hooks/stale-copy — varios snapshots, y lo ya contado', () => {
  it('con un solo snapshot el aviso es el mismo, venga de un Edit o de un Bash', () => {
    expect(avisoPara(['budget.json'])).toBe(
      decideRecordatorio({
        tool_name: 'Edit',
        tool_input: { file_path: 'public/data/budget.json' },
      }),
    )
  })

  it('varios snapshots van en un aviso que los nombra y recorta las rutas', () => {
    const aviso = avisoPara(['tenders.json', 'budget.json'])
    expect(aviso).toContain('budget.json')
    expect(aviso).toContain('tenders.json')
    expect(aviso).toMatch(/ruta\(s\) más/)
    expect(aviso.split('review:surfaces')[1].trim().split(/\s+/).length).toBeLessThanOrEqual(5)
  })

  it('sin un snapshot con prosa detrás no hay aviso', () => {
    expect(avisoPara([])).toBeNull()
    expect(avisoPara(['place-overrides.json'])).toBeNull()
  })

  it('cuenta cada versión del dato una vez y olvida lo que ya no está cambiado', () => {
    const b = '/r/public/data/budget.json'
    const primera = novedades({ [b]: 'h1' }, {}, '/r')
    expect(primera.nuevos).toEqual([b])
    // Otro comando, el mismo dato: nada nuevo que contar.
    expect(novedades({ [b]: 'h1' }, primera.memoria, '/r').nuevos).toEqual([])
    // El dato vuelve a moverse.
    expect(novedades({ [b]: 'h2' }, primera.memoria, '/r').nuevos).toEqual([b])
    // Tras el commit ya no está cambiado y se olvida; lo de otro árbol se queda,
    // aunque su ruta empiece igual.
    const otros = { '/r2/public/data/pmp.json': 'h9', '/otro/public/data/pmp.json': 'h8' }
    expect(novedades({}, { ...primera.memoria, ...otros }, '/r').memoria).toEqual(otros)
  })
})

describe('hooks/stale-copy — el runner', () => {
  it('entrega el aviso al modelo por stdout, no por stderr, y NUNCA tumba la edición', () => {
    const { stdout, stderr, code } = correr({
      tool_name: 'Write',
      tool_input: { file_path: 'public/data/indicadores.json' },
    })
    expect(code).toBe(0)
    const aviso = contextoDe(stdout)
    expect(aviso).toMatch(/eficiencia/)
    expect(aviso).toContain('review:surfaces')
    // El canal de antes, vacío: con código 0 stderr no lo lee el modelo.
    expect(stderr).toBe('')
  })

  it('un Edit de budget.json nombra /presupuesto', () => {
    const { stdout, code } = correr({
      tool_name: 'Edit',
      tool_input: { file_path: 'public/data/budget.json' },
    })
    expect(code).toBe(0)
    expect(contextoDe(stdout)).toContain('/presupuesto')
  })

  it('no dice nada cuando no hay nada que recordar', () => {
    expect(correr({ tool_name: 'Write', tool_input: { file_path: 'src/App.jsx' } })).toEqual(
      SILENCIO,
    )
    expect(
      correr({ tool_name: 'Read', tool_input: { file_path: 'public/data/budget.json' } }),
    ).toEqual(SILENCIO)
  })

  it('sobrevive a un payload ilegible en vez de romper la herramienta', () => {
    expect(correr('esto no es json')).toEqual(SILENCIO)
  })
})

describe('hooks/stale-copy — lo que llega a ejecutarlo', () => {
  // Un aviso perfecto no avisa de nada si la herramienta no pasa por él.
  const cfg = JSON.parse(readFileSync(resolve(__dirname, '../.claude/settings.json'), 'utf8'))
  const grupos = (cfg.hooks?.PostToolUse ?? []).filter((g) =>
    (g.hooks ?? []).some((h) => /remind-stale-copy\.mjs/.test(h.command ?? '')),
  )

  it('se registra tras las escrituras Y tras Bash, que es por donde se regenera un snapshot', () => {
    expect(grupos.length).toBeGreaterThan(0)
    for (const tool of ['Write', 'Edit', 'MultiEdit', 'Bash']) {
      expect(
        grupos.some((g) => new RegExp(`^(${g.matcher})$`).test(tool)),
        tool,
      ).toBe(true)
    }
  })

  it('corre en primer plano: un gancho async entrega su contexto en el turno siguiente', () => {
    for (const g of grupos) for (const h of g.hooks) expect(h.async ?? false).toBe(false)
  })
})

describe('hooks/stale-copy — lo que reescribe un script por Bash', () => {
  // El camino habitual: un snapshot se regenera con un script, y un PostToolUse
  // sobre Edit|Write no se entera de lo que escribe un Bash. Se prueba contra un
  // repositorio de verdad porque la salida de git no se recita.
  let repo
  let memoria
  const git = (...args) =>
    execFileSync(
      'git',
      [
        '-c',
        'user.name=prueba',
        '-c',
        'user.email=prueba@example.invalid',
        '-c',
        'commit.gpgsign=false',
        ...args,
      ],
      { cwd: repo, encoding: 'utf8' },
    )
  const escribir = (rel, contenido) => {
    mkdirSync(dirname(join(repo, rel)), { recursive: true })
    writeFileSync(join(repo, rel), contenido)
  }
  const bash = (extra = {}) =>
    correr(
      {
        session_id: 'sesion-1',
        tool_name: 'Bash',
        tool_input: { command: 'npm run scrape:budget' },
        cwd: repo,
        ...extra,
      },
      memoria,
    )

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'prosa-repo-'))
    memoria = mkdtempSync(join(tmpdir(), 'prosa-memoria-'))
    git('init', '-q')
    escribir('public/data/budget.json', '{"v":1}\n')
    escribir('public/data/pmp.json', '{"v":1}\n')
    escribir('public/data/place-overrides.json', '{"v":1}\n')
    escribir('src/App.jsx', 'x\n')
    git('add', '-A')
    git('commit', '-q', '-m', 'base')
  })
  afterEach(() => {
    rmSync(repo, { recursive: true, force: true })
    rmSync(memoria, { recursive: true, force: true })
  })

  it('avisa cuando un comando deja reescrito un snapshot con prosa', () => {
    escribir('public/data/budget.json', '{"v":2}\n')
    const { stdout, code } = bash()
    expect(code).toBe(0)
    const aviso = contextoDe(stdout)
    expect(aviso).toContain('budget.json')
    expect(aviso).toContain('/presupuesto')
  })

  it('avisa una vez por versión del dato, no en cada comando que venga detrás', () => {
    escribir('public/data/budget.json', '{"v":2}\n')
    expect(contextoDe(bash().stdout)).toContain('budget.json')
    // `npm test`, `git diff`…: el dato no se ha vuelto a mover.
    expect(bash()).toEqual(SILENCIO)
    escribir('public/data/budget.json', '{"v":3}\n')
    expect(contextoDe(bash().stdout)).toContain('budget.json')
  })

  it('cada contexto que puede escribir prosa recibe el suyo: otra sesión, un subagente', () => {
    escribir('public/data/budget.json', '{"v":2}\n')
    expect(bash().stdout).not.toBe('')
    expect(contextoDe(bash({ session_id: 'sesion-2' }).stdout)).toContain('budget.json')
    expect(contextoDe(bash({ agent_id: 'subagente-1' }).stdout)).toContain('budget.json')
  })

  it('calla si lo cambiado no es un snapshot o no lleva prosa detrás', () => {
    escribir('src/App.jsx', 'y\n')
    escribir('public/data/place-overrides.json', '{"v":2}\n')
    escribir('public/data/pleno-claims/x.json', '{}\n')
    expect(bash()).toEqual(SILENCIO)
  })

  it('calla ante una reescritura idéntica: un adaptador idempotente no mueve el dato', () => {
    escribir('public/data/budget.json', '{"v":1}\n')
    expect(bash()).toEqual(SILENCIO)
  })

  it('un snapshot nuevo, aún sin seguimiento, también cuenta', () => {
    escribir('public/data/streets.json', '[]\n')
    expect(contextoDe(bash().stdout)).toContain('streets.json')
  })

  it('varios a la vez van en un solo aviso', () => {
    escribir('public/data/budget.json', '{"v":2}\n')
    escribir('public/data/pmp.json', '{"v":2}\n')
    const aviso = contextoDe(bash().stdout)
    expect(aviso).toContain('budget.json')
    expect(aviso).toContain('pmp.json')
  })

  it('tras avisar por un Edit, el Bash siguiente no repite el mismo aviso', () => {
    // La ruta del Edit llega sin resolver (/var/… en macOS) y git contesta con
    // la real (/private/var/…): la memoria tiene que casar las dos.
    escribir('public/data/budget.json', '{"v":2}\n')
    const edit = correr(
      {
        session_id: 'sesion-1',
        tool_name: 'Edit',
        tool_input: { file_path: join(repo, 'public/data/budget.json') },
      },
      memoria,
    )
    expect(contextoDe(edit.stdout)).toContain('/presupuesto')
    expect(bash()).toEqual(SILENCIO)
  })

  it('lee la salida real de git: cambiados, nuevos y renombrados sí; borrados y troceados no', () => {
    escribir('public/data/budget.json', '{"v":2}\n') // cambiado
    escribir('public/data/streets.json', '[]\n') // nuevo, sin seguimiento
    escribir('public/data/pleno-claims/x.json', '{}\n') // troceado: sin prosa propia
    git('rm', '-q', 'public/data/place-overrides.json') // borrado: no queda dato
    git('mv', 'public/data/pmp.json', 'public/data/indicadores.json') // renombrado
    expect(snapshotsDeEstado(git(...GIT_STATUS_SNAPSHOTS)).sort()).toEqual([
      'public/data/budget.json',
      'public/data/indicadores.json',
      'public/data/streets.json',
    ])
  })

  it('fuera de un repositorio calla y sale 0', () => {
    expect(
      correr({ tool_name: 'Bash', tool_input: { command: 'ls' }, cwd: memoria }, memoria),
    ).toEqual(SILENCIO)
  })
})
