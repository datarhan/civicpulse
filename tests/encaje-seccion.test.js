/**
 * `respaldoDeSeccion`: the backing every citing card of a /cargos section agrees
 * on, so «Quién dirige qué» can say it once (auditoría de las dos lecturas, §3,
 * punto 2). Read against the published area-fit.json and the government the
 * page derives; the variants that force a case are copies of those rows with
 * one field changed, never a shape written by hand.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

import {
  citesNothing,
  fitRowsForSlug,
  respaldoDeSeccion,
  sharedRespaldo,
} from '../src/hooks/useAreaFit'
import { conAreasDelegadas } from '../src/scraper/en-breve-cargos'

const lee = (f) => JSON.parse(readFileSync(`public/data/${f}`, 'utf8'))
const FIT = lee('area-fit.json')
const GOBIERNO = conAreasDelegadas(lee('officials.json').officials).map((o) => o.slug)
const citan = GOBIERNO.filter((s) => !citesNothing(fitRowsForSlug(FIT, s)))
const noCitan = GOBIERNO.filter((s) => citesNothing(fitRowsForSlug(FIT, s)))

/** The published data with one official's rows rewritten by `cambia`. */
function conFilas(slug, cambia) {
  return { ...FIT, rows: FIT.rows.map((r) => (r.officialSlug === slug ? cambia(r) : r)) }
}
const conRespaldo = (r, formacion, experiencia = formacion) => ({
  ...r,
  formacion: r.formacion?.respaldo ? { ...r.formacion, respaldo: formacion } : r.formacion,
  experiencia: r.experiencia?.respaldo
    ? { ...r.experiencia, respaldo: experiencia }
    : r.experiencia,
})

describe('respaldoDeSeccion', () => {
  it('mide algo: hay tarjetas que citan y tarjetas que no, en el gobierno publicado', () => {
    expect(citan.length).toBeGreaterThan(0)
    expect(noCitan.length).toBeGreaterThan(0)
  })

  it('con los datos publicados, es el respaldo que comparte cada tarjeta que cita', () => {
    const v = respaldoDeSeccion(FIT, GOBIERNO)
    expect(v).not.toBeNull()
    for (const s of citan) expect(sharedRespaldo(fitRowsForSlug(FIT, s)), s).toBe(v)
  })

  it('una tarjeta que no cita nada no vota: sola, no hay respaldo de sección', () => {
    expect(respaldoDeSeccion(FIT, noCitan)).toBeNull()
    // Y no rompe el acuerdo de las demás.
    expect(respaldoDeSeccion(FIT, GOBIERNO)).toBe(respaldoDeSeccion(FIT, citan))
  })

  it('basta una tarjeta con otro respaldo para que cada una diga el suyo', () => {
    const datos = conFilas(citan[0], (r) => conRespaldo(r, 'corroborada'))
    expect(respaldoDeSeccion(datos, GOBIERNO)).toBeNull()
  })

  it('una tarjeta con marcas por elemento (respaldos que discrepan) también lo rompe', () => {
    // Una tarjeta con al menos dos valoraciones citadas, y sólo la primera cambia:
    // así la tarjeta discrepa consigo misma, sea cual sea el eje que cita.
    const citadas = (s) =>
      fitRowsForSlug(FIT, s).flatMap((r) =>
        ['formacion', 'experiencia'].filter((f) => r[f]?.respaldo).map((f) => [r, f]),
      )
    const slug = citan.find((s) => citadas(s).length >= 2)
    expect(slug, 'alguna tarjeta publicada cita dos valoraciones').toBeDefined()
    const [fila, eje] = citadas(slug)[0]
    const datos = {
      ...FIT,
      rows: FIT.rows.map((r) =>
        r === fila ? { ...r, [eje]: { ...r[eje], respaldo: 'corroborada' } } : r,
      ),
    }
    expect(sharedRespaldo(fitRowsForSlug(datos, slug))).toBeNull()
    expect(respaldoDeSeccion(datos, GOBIERNO)).toBeNull()
  })

  it('quien no tiene filas firmadas no cuenta, y sin datos no hay respaldo', () => {
    const sinFilas = { ...FIT, rows: FIT.rows.filter((r) => r.officialSlug !== citan[0]) }
    expect(respaldoDeSeccion(sinFilas, GOBIERNO)).toBe(respaldoDeSeccion(FIT, GOBIERNO))
    expect(respaldoDeSeccion({ rows: [] }, GOBIERNO)).toBeNull()
    expect(respaldoDeSeccion(null, GOBIERNO)).toBeNull()
  })
})
