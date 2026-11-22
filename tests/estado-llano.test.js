import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { CATALOGUE } from '../src/i18n'
import { ESTADO_LLANO, estadoLlano } from '../src/lib/estado-llano'
import { CLAIM_VERDICTS, PASADAS } from '../src/scraper/claim-verdicts'
import { ALLOWED_ASSIGNMENT_KINDS } from '../src/scraper/journalist'
import { ESTADOS_ESPERADO } from '../src/scraper/coste-esperado'
import { TRINQUETE } from '../src/scraper/trinquete'
import { ALLOWED_STATUSES } from '../src/scraper/promises'

/**
 * EstadoLlano contra los enums EXPORTADOS (docs/DATA_INTEGRITY.md, regla 1:
 * exporta el enum, no lo recites). Cada vocabulario que una página pinta tiene
 * rótulo en los dos idiomas para cada valor, distinto del código, y ninguna
 * clave sobra: la errata de una letra es la que cobró 53,5 M€.
 *
 * Medido el 26-10-2026 sobre las 155 páginas del mapa del sitio, el código salía
 * tal cual en cuatro: «SIN-DATOS», «biography», «muestra-insuficiente» y
 * «sin-declaracion-propia», «verdict-engine» y sus dos hermanas.
 */
const VOCABULARIOS = {
  veredicto: CLAIM_VERDICTS,
  encargo: ALLOWED_ASSIGNMENT_KINDS,
  pasada: PASADAS,
  especificacionEsperada: ESTADOS_ESPERADO,
  promesa: ALLOWED_STATUSES,
}

const IDIOMAS = Object.keys(CATALOGUE)
const tDe = (idioma) => (clave) => CATALOGUE[idioma][clave] ?? clave

describe('EstadoLlano: cada código publicado tiene rótulo', () => {
  it('mide algo: dos idiomas y cinco vocabularios con valores', () => {
    expect(IDIOMAS).toEqual(['es', 'ca'])
    for (const valores of Object.values(VOCABULARIOS)) expect(valores.length).toBeGreaterThan(1)
  })

  it('el registro y esta tabla nombran los mismos vocabularios', () => {
    expect(Object.keys(VOCABULARIOS).sort()).toEqual(Object.keys(ESTADO_LLANO).sort())
  })

  for (const [tipo, valores] of Object.entries(VOCABULARIOS)) {
    it(`${tipo}: rótulo en ${IDIOMAS.join(' y ')} para cada valor, y ninguno es el código`, () => {
      const faltan = []
      for (const idioma of IDIOMAS)
        for (const v of valores) {
          const rotulo = estadoLlano(tDe(idioma), tipo, v)
          if (!rotulo || !rotulo.trim() || rotulo === v) faltan.push(`${idioma}:${v}`)
        }
      expect(faltan, `sin rótulo llano: ${faltan.join(', ')}`).toEqual([])
    })

    it(`${tipo}: ninguna clave del catálogo sobra`, () => {
      const raiz = `${ESTADO_LLANO[tipo]}.`
      for (const idioma of IDIOMAS) {
        const huerfanas = Object.keys(CATALOGUE[idioma])
          .filter((k) => k.startsWith(raiz))
          .map((k) => k.slice(raiz.length))
          .filter((v) => !valores.includes(v))
        expect(huerfanas, `${idioma}: claves sin valor en el enum`).toEqual([])
      }
    })
  }

  it('un valor fuera del vocabulario no se pinta: null, nunca el código', () => {
    expect(estadoLlano(tDe('es'), 'encargo', 'not-a-kind')).toBeNull()
    expect(estadoLlano(tDe('es'), 'veredicto', undefined)).toBeNull()
  })
})

describe('EstadoLlano: las pasadas se llaman como en /metodologia', () => {
  // Dos esquemas de marca conviven (claim-verdicts.ts): éstas son las del
  // verificador, con la etapa del overlay que les corresponde.
  const ETAPA = { 'nli-grounding': 'nli', 'llm-second-pass': 'llm' }

  it('cada pasada lleva el nombre de su etapa en `TRINQUETE`', () => {
    for (const p of PASADAS) {
      const etapa = TRINQUETE[ETAPA[p] ?? p]
      expect(etapa, `sin etapa para ${p}`).toBeDefined()
      expect(CATALOGUE.es[`estado.pasada.${p}`]).toBe(etapa.nombre)
    }
  })
})

describe('EstadoLlano: techo sobre lo PUBLICADO, no sobre el enum', () => {
  const leer = (f) => JSON.parse(readFileSync(resolve('public/data', f), 'utf8'))

  it('cada encargo y cada especificación publicada tiene rótulo', () => {
    const encargos = leer('journalist-assignments.json').items.map((a) => a.kind)
    const estados = leer('coste-esperado.json').especificaciones.map((e) => e.estado)
    expect(encargos.length).toBeGreaterThan(0)
    expect(estados.length).toBeGreaterThan(0)
    for (const k of encargos) expect(estadoLlano(tDe('es'), 'encargo', k), k).toBeTruthy()
    for (const s of estados)
      expect(estadoLlano(tDe('es'), 'especificacionEsperada', s), s).toBeTruthy()
  })
})

// Los estados de una promesa se pintaban con una tabla escrita a mano en
// castellano (`STATUS_LABEL` de usePromises.js) en cinco sitios: /promesas, la
// columna «Responde» de /eficiencia, la ficha de un cargo, la de un
// departamento y las biografías. En valencià salían en castellano, y la
// reserva `|| p.status` imprimía el código de un estado sin rótulo. Pasan al
// catálogo con las MISMAS palabras: lo que dice un estado lo define
// /metodologia#estados, y cambiarlo es otro trabajo (plan revisado, 4b.3).
describe('EstadoLlano: los estados de una promesa', () => {
  const ANTES = {
    documentada: 'Documentada',
    'en-verificacion': 'En verificación',
    'en-progreso': 'En progreso',
    cumplida: 'Cumplida',
    parcial: 'Parcial',
    'no-ejecutada': 'No ejecutada',
    inviable: 'Inviable',
  }

  it('en castellano dicen exactamente lo que decían', () => {
    expect(Object.keys(ANTES).sort()).toEqual([...ALLOWED_STATUSES].sort())
    for (const s of ALLOWED_STATUSES) expect(estadoLlano(tDe('es'), 'promesa', s), s).toBe(ANTES[s])
  })

  it('cada promesa publicada, y cada retirada, tiene rótulo', () => {
    const p = JSON.parse(readFileSync(resolve('public/data/promises.json'), 'utf8'))
    const estados = [...p.items, ...(p.retractions ?? [])].map((x) => x.status).filter(Boolean)
    expect(p.items.length).toBeGreaterThan(0)
    for (const s of estados) expect(estadoLlano(tDe('ca'), 'promesa', s), s).toBeTruthy()
  })

  it('ninguna página ni componente vuelve a la tabla escrita a mano', () => {
    const ficheros = [
      'src/pages/Promesas.jsx',
      'src/pages/CargoDetalle.jsx',
      'src/pages/DepartamentoDetalle.jsx',
      'src/components/journalist/Sections.jsx',
      'src/components/eficiencia/CuestaConsigueResponde.jsx',
      'src/hooks/usePromises.js',
    ]
    for (const f of ficheros) {
      const fuente = readFileSync(resolve(f), 'utf8')
      expect(fuente, f).not.toMatch(/\bSTATUS_LABEL\b/)
    }
  })
})
