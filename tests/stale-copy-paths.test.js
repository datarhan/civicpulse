import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import {
  decideRecordatorio,
  rutasAfectadas,
  snapshotDe,
  PROSA_POR_SNAPSHOT,
  MAPA_CARGADO,
} from '../.claude/hooks/stale-copy-paths.mjs'

// El recordatorio existe porque tres frases se quedaron viejas en una sola
// sesión y ningún test las cazó: los datos estaban bien y las guardas
// comprueban datos. Si este control deja de disparar, tampoco lo nota nadie —
// así que se prueba como se prueba un adaptador.

const RUNNER = resolve(__dirname, '../.claude/hooks/remind-stale-copy.mjs')
const stderrDe = (payload) => {
  const r = spawnSync('node', [RUNNER], { input: JSON.stringify(payload), encoding: 'utf8' })
  return { out: r.stderr ?? '', code: r.status }
}

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

describe('hooks/stale-copy — el runner', () => {
  it('avisa por stderr y NUNCA tumba la edición', () => {
    const { out, code } = stderrDe({
      tool_name: 'Write',
      tool_input: { file_path: 'public/data/indicadores.json' },
    })
    expect(out).toMatch(/eficiencia/)
    expect(code).toBe(0)
  })

  it('sale limpio cuando no hay nada que recordar', () => {
    const { out, code } = stderrDe({ tool_name: 'Write', tool_input: { file_path: 'src/App.jsx' } })
    expect(out).toBe('')
    expect(code).toBe(0)
  })

  it('sobrevive a un payload ilegible en vez de romper la herramienta', () => {
    const r = spawnSync('node', [RUNNER], { input: 'esto no es json', encoding: 'utf8' })
    expect(r.status).toBe(0)
  })
})
