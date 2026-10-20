import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  pressLabSummary,
  avisoSinVeredicto,
  estadoDeAfirmacion,
  ESTADO_LABEL,
  resumenHallazgos,
  fraseFactcheck,
  puenteTablaMedios,
  CADENCIA_LABORATORIO,
} from '../src/lib/press-lab'

/**
 * La columna derecha y el aviso de /laboratorio, leídos el 19-10-2026 sobre los
 * snapshots publicados ese día (press.json, press-claims-verified.json,
 * press-findings.json y factcheck.json, copiados tal cual a tests/fixtures).
 */

const leer = (f) => JSON.parse(readFileSync(join(__dirname, 'fixtures', f), 'utf8'))
const PRESS = leer('press_2026-10-19.json').items
const VERIF = leer('press-claims-verified_2026-10-19.json').items
const HALLAZGOS = leer('press-findings_2026-10-19.json').items
const FACTCHECK = leer('factcheck_2026-10-19.json')
const AHORA = Date.parse('2026-10-19T10:20:18.644Z')

describe('«Hallazgos editoriales» — 17 filas automáticas de 5 lotes', () => {
  // Las 17 son `curatorName: auto-curation-v1`: ninguna la firmó una persona, y el KPI
  // decía «17 · curados». El curador automático vuelve a publicar el mismo lote cada
  // vez que corre, con otro id (pf-<fecha>-<huella>): la columna enseñaba el titular
  // de Nerco cuatro veces en cinco filas.
  it('se agrupan por lote: 5, y el más reciente de cada uno', () => {
    const r = resumenHallazgos(HALLAZGOS)
    expect(r.publicaciones).toBe(17)
    expect(r.lotes.length).toBe(5)
    const titulos = r.lotes.map((l) => l.finding.title)
    expect(new Set(titulos).size).toBe(5)
    const nerco = r.lotes.filter((l) => /Nerco/.test(l.finding.title))
    expect(nerco.length).toBe(1)
    expect(nerco[0].finding.id).toBe('pf-2026-09-10-1gwkjpc')
    expect(nerco[0].veces).toBe(6)
    expect(nerco[0].primera).toBe('2026-09-03')
  })

  it('ninguno lo firmó una persona: son automáticos, no «curados»', () => {
    const r = resumenHallazgos(HALLAZGOS)
    expect(r.automaticos).toBe(5)
    expect(r.humanos).toBe(0)
    for (const l of r.lotes) expect(l.automatico).toBe(true)
  })

  it('una fila firmada por una persona cuenta aparte', () => {
    const r = resumenHallazgos([{ ...HALLAZGOS[0], id: 'pf-x', curatorName: 'Sergei' }])
    expect(r.humanos).toBe(1)
    expect(r.automaticos).toBe(0)
  })
})

describe('el carril de verificaciones externas sale de factcheck.json', () => {
  it('el 19-10-2026: tres fuentes consultadas y 61 revisiones, no «configurar la clave»', () => {
    const f = fraseFactcheck(FACTCHECK)
    expect(f).toContain('Google Fact Check Tools API')
    expect(f).toContain('Maldita.es RSS')
    expect(f).toContain('Newtral RSS')
    expect(f).toContain('las 3 fuentes')
    expect(f).toContain('61 revisiones')
    expect(f).not.toMatch(/GOOGLE_FACT_CHECK_API_KEY|configurar/i)
    expect(f).not.toMatch(/EFE|AFP/)
  })

  it('una fuente caída se nombra con su motivo, y lo suyo no se da por mirado', () => {
    const intentos = FACTCHECK.consulta.intentos.map((i) =>
      i.fuente === 'Newtral RSS' ? { ...i, estado: 'error', examinadas: 0, motivo: 'HTTP 503' } : i,
    )
    const f = fraseFactcheck({ ...FACTCHECK, consulta: { intentos } })
    expect(f).toContain('2 de 3 fuentes')
    expect(f).toContain('Newtral RSS')
    expect(f).toContain('HTTP 503')
    expect(f).toContain('51 revisiones')
  })

  it('todas caídas: no se sabe si las hay', () => {
    const intentos = FACTCHECK.consulta.intentos.map((i) => ({
      ...i,
      estado: 'sin-credencial',
      examinadas: 0,
      motivo: 'sin clave',
    }))
    const f = fraseFactcheck({ ...FACTCHECK, consulta: { intentos } })
    expect(f).toMatch(/ninguna de las 3 fuentes/i)
    expect(f).toMatch(/no quiere decir que no las haya/)
  })

  it('sin fichero o sin registro de la consulta, lo dice', () => {
    expect(fraseFactcheck(null)).toMatch(/no consta/i)
    expect(fraseFactcheck({ items: [] })).toMatch(/no consta/i)
  })
})

describe('el aviso dice cuántas se cotejaron, y la pastilla separa «no cotejada»', () => {
  // 58 afirmaciones; 49 con `checkedAgainst: []`. El aviso decía «se han extraído 58
  // … y se han buscado en los datos», y la pastilla «Sin registro» salía igual en las
  // 49 que nadie buscó que en las 9 que sí.
  const resumen = () => pressLabSummary({ press: PRESS, verified: VERIF }, AHORA)

  it('cuenta las cotejadas y, de ellas, las municipales', () => {
    const s = resumen()
    expect(s.totalClaims).toBe(58)
    expect(s.cotejadasClaims).toBe(9)
    expect(s.cotejadasMunicipalesClaims).toBe(6)
  })

  it('el aviso ya no dice que las 58 se buscaron en los datos', () => {
    const aviso = avisoSinVeredicto(resumen())
    expect(aviso.texto).not.toMatch(/58 afirmaciones de 11 artículos y se han buscado/)
    expect(aviso.texto).toContain('se han cotejado 9')
    expect(aviso.texto).toContain('6 con datos municipales')
    expect(aviso.texto).toContain('3 sólo con el catálogo de promesas')
    expect(aviso.texto).toContain('las otras 49 no se han buscado en ningún dato')
  })

  it('«no cotejada» y «cotejada sin registro» son dos pastillas', () => {
    const vacias = VERIF.filter((r) => (r.verification.checkedAgainst ?? []).length === 0)
    const promesas = VERIF.filter(
      (r) => JSON.stringify(r.verification.checkedAgainst) === '["promises"]',
    )
    expect(vacias.length).toBe(49)
    for (const r of vacias) expect(estadoDeAfirmacion(r)).toBe('no-cotejada')
    for (const r of promesas) expect(estadoDeAfirmacion(r)).toBe('sin-datos')
    expect(ESTADO_LABEL['no-cotejada']).toBe('No cotejada')
    expect(ESTADO_LABEL['sin-datos']).toBe('Sin registro')
  })
})

describe('la tabla por medio y el KPI se cuadran', () => {
  const resumen = () => pressLabSummary({ press: PRESS, verified: VERIF }, AHORA)
  const filas = (pares) => pares.map(([outlet, articleCount]) => ({ outlet, articleCount }))

  it('mismo cálculo: suma + fuera del feed = monitorizados, y se dice', () => {
    const s = resumen() // 56 monitorizados, 3 fuera del feed
    const f = puenteTablaMedios(
      filas([
        ['A', 50],
        ['B', 3],
      ]),
      s,
    )
    expect(f).toContain('53 titulares')
    expect(f).toContain('3 que ya no están en el feed')
    expect(f).toContain('56')
  })

  it('si no cuadran (la tabla se calculó otro día), no se finge que sí', () => {
    const f = puenteTablaMedios(
      filas([
        ['A', 50],
        ['B', 5],
      ]),
      resumen(),
    )
    expect(f).toContain('55')
    expect(f).toContain('56')
    expect(f).not.toContain('3 que ya no están en el feed')
  })
})

describe('la cadencia del aviso', () => {
  it('dice que la extracción es semanal y la analítica, nocturna', () => {
    expect(CADENCIA_LABORATORIO).toMatch(/lunes/)
    expect(CADENCIA_LABORATORIO).toMatch(/cada noche/)
  })
})
