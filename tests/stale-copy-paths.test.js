import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import {
  decideRecordatorio,
  rutasAfectadas,
  snapshotDe,
  PROSA_POR_SNAPSHOT,
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
    expect(rutasAfectadas('public/data/indicadores.json')).toContain('/metodologia')
    expect(rutasAfectadas('public/data/budget.json')).toEqual(['/presupuesto'])
  })

  it('calla ante un snapshot sin prosa detrás: la lista no es un ranking de importancia', () => {
    expect(rutasAfectadas('public/data/streets.json')).toEqual([])
    expect(
      decideRecordatorio({
        tool_name: 'Write',
        tool_input: { file_path: 'public/data/streets.json' },
      }),
    ).toBeNull()
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

  it('cada entrada de la tabla apunta a rutas con pinta de ruta', () => {
    for (const fila of PROSA_POR_SNAPSHOT) {
      expect(fila.snapshot).toMatch(/\.json$/)
      expect(fila.rutas.length).toBeGreaterThan(0)
      for (const r of fila.rutas) expect(r).toMatch(/^\//)
    }
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
