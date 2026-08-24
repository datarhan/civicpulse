import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { TENDER_NOT_DONE_STATUSES, ESTADOS_QUE_NO_CONTRADICEN } from '../src/scraper/claim-verifier'

/**
 * La puerta que no podía abrirse, y por qué se quedó sin material la cadencia.
 *
 * `claim-verifier.ts` tiene dos caminos que emiten `contradicho`. Uno de ellos
 * —el que compara «esta obra está terminada» con el estado del contrato— pedía
 * que el estado estuviera en `TENDER_NOT_DONE_STATUSES`:
 *
 *   open · pending · planning · in_planning · published · abierta ·
 *   licitación · pendiente · en tramitación · en curso
 *
 * Y los estados que la fuente emite de verdad, medidos el 2026-08-24 sobre las
 * 806 filas de `contracts` y las 428 de `tenders`:
 *
 *   awarded · formalized · void · unknown · abandoned · revoked ·
 *   provisionally_awarded
 *
 * La intersección era VACÍA. Ni uno. La rama no había disparado nunca y no
 * podía disparar: 23 afirmaciones del corpus dicen que algo está terminado y
 * ninguna podía ser contradicha, por falsa que fuera.
 *
 * Es la regla 1 de DATA_INTEGRITY otra vez, y con el mismo mecanismo: la
 * prueba que cubría esta rama se fabricaba su propio contrato con
 * `status: 'open'` —un valor del allow-set que la fuente no usa— así que estaba
 * verde mientras producción no casaba con nada. «El allow-set decía
 * `finalized`, la fuente emite `formalized`.»
 *
 * De ahí el hueco de cadencia IFCN: cero contradicciones en el corpus → cero
 * filas con contradicción en la cola de apoyo → ningún hallazgo defendible que
 * publicar. La escasez de material no era editorial, era esta línea.
 */

const RUTA = 'public/data/tenders.json'

function estadosPublicados(): Set<string> {
  const path = resolve(RUTA)
  if (!existsSync(path)) return new Set()
  const d = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
  const filas = [
    ...((d.contracts as { status?: string }[] | undefined) ?? []),
    ...((d.tenders as { status?: string }[] | undefined) ?? []),
  ]
  return new Set(filas.map((r) => String(r.status ?? '').toLowerCase()).filter(Boolean))
}

describe('el allow-set de estados habla el idioma de la fuente', () => {
  const vivos = estadosPublicados()

  it('mide algo: el snapshot trae contratos con estado', () => {
    // Sin esto, un tenders.json vacío haría pasar todo lo de abajo por
    // vacuidad — que es exactamente el fallo que esta prueba persigue.
    expect(vivos.size, 'no hay estados publicados que comparar').toBeGreaterThan(2)
  })

  it('la puerta PUEDE abrirse: algún estado del set existe en los datos', () => {
    const interseccion = [...TENDER_NOT_DONE_STATUSES].filter((s) => vivos.has(s))
    expect(
      interseccion,
      `NINGUNO de los estados de TENDER_NOT_DONE_STATUSES aparece en ${RUTA}.\n` +
        `  set   : ${[...TENDER_NOT_DONE_STATUSES].sort().join(' · ')}\n` +
        `  fuente: ${[...vivos].sort().join(' · ')}\n` +
        `  Una puerta que no puede abrirse no protege nada: la rama contradicho\n` +
        `  de «obra terminada» nunca dispara, por falsa que sea la afirmación.`,
    ).not.toEqual([])
  })

  it('no contradice una obra por el mero hecho de estar adjudicada o formalizada', () => {
    // El `status` de Gobierto es la fase de CONTRATACIÓN, no la de ejecución.
    // Un contrato adjudicado o firmado no dice nada sobre si la obra terminó,
    // así que tomarlo por desmentido sería inventarse la contradicción.
    for (const s of ['awarded', 'formalized']) {
      expect(TENDER_NOT_DONE_STATUSES.has(s), `«${s}» no desmiente que una obra esté acabada`).toBe(
        false,
      )
      expect(ESTADOS_QUE_NO_CONTRADICEN.has(s)).toBe(true)
    }
  })

  it('«unknown» NUNCA contradice — un centinela no es un valor', () => {
    // Regla 3. `unknown` significa «no lo sé», y 42 contratos lo llevan.
    // Tratarlo como «no terminado» publicaría una contradicción construida
    // sobre nuestra propia ignorancia.
    expect(TENDER_NOT_DONE_STATUSES.has('unknown')).toBe(false)
    expect(ESTADOS_QUE_NO_CONTRADICEN.has('unknown')).toBe(true)
  })

  it('los dos conjuntos son disjuntos y cubren lo que la fuente emite', () => {
    const solapan = [...TENDER_NOT_DONE_STATUSES].filter((s) => ESTADOS_QUE_NO_CONTRADICEN.has(s))
    expect(solapan, 'un estado no puede contradecir y no contradecir a la vez').toEqual([])
    const huerfanos = [...vivos].filter(
      (s) => !TENDER_NOT_DONE_STATUSES.has(s) && !ESTADOS_QUE_NO_CONTRADICEN.has(s),
    )
    expect(
      huerfanos,
      `la fuente emite estados que ningún conjunto clasifica: ${huerfanos.join(' · ')}.\n` +
        `  Decide en cuál va cada uno; el silencio los trata como «no contradice»\n` +
        `  sin que nadie lo haya decidido.`,
    ).toEqual([])
  })
})
