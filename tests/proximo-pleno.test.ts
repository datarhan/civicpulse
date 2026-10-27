import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { REGIMEN_DE_SESIONES, proximoPleno } from '../src/scraper/proximo-pleno'

/**
 * «¿Cuándo es el próximo pleno?» (auditoría de las dos lecturas, §9). regmeet
 * sólo lista las sesiones celebradas, así que la fecha no la tenemos hasta
 * después. Lo que sí está publicado es la regla: el Pleno la aprobó el 7 de
 * julio de 2023, y la cita es literal del acta. Y lo que las fechas dicen de
 * esa regla se cuenta, nunca se escribe: de los ordinarios recogidos, cuántos
 * fueron en lunes y cuántos el primero del mes. Una fecha no se deduce de la
 * regla: muchos ordinarios no caen el primer lunes.
 */
const datos = join(__dirname, '..', 'public', 'data')
const sesiones: { id: string; date: string; kind: string }[] = JSON.parse(
  readFileSync(join(datos, 'plenos.json'), 'utf8'),
).items

/** El acta como texto corrido: sin las marcas de tiempo y con las líneas unidas. */
const acta = readFileSync(
  join(datos, 'pleno-transcripts', `${REGIMEN_DE_SESIONES.plenoId}.txt`),
  'utf8',
)
  .split('\n')
  .map((l) => l.replace(/^\[[^\]]*\]\s?/, ''))
  .join(' ')
  .replace(/\s+/g, ' ')

describe('REGIMEN_DE_SESIONES — la regla, citada del acta', () => {
  it('la sesión del acuerdo está publicada, con su fecha', () => {
    const s = sesiones.find((x) => x.id === REGIMEN_DE_SESIONES.plenoId)
    expect(s?.date.slice(0, 10)).toBe(REGIMEN_DE_SESIONES.fecha)
  })

  it('cada literal está tal cual en el acta publicada', () => {
    expect(REGIMEN_DE_SESIONES.literales.length).toBeGreaterThan(1)
    for (const l of REGIMEN_DE_SESIONES.literales) expect(acta, l).toContain(l)
  })

  it('y bajo el punto que dice', () => {
    expect(acta).toContain(
      `${REGIMEN_DE_SESIONES.punto}.- SECRETARÍA Expediente: ${REGIMEN_DE_SESIONES.expediente}`,
    )
  })
})

const dia = (f: string) => {
  const [y, m, d] = f.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

describe('proximoPleno', () => {
  const ultima = sesiones
    .map((s) => s.date.slice(0, 10))
    .sort()
    .at(-1)!
  const manana = dia(ultima)
  manana.setUTCDate(manana.getUTCDate() + 1)
  const hoy = manana.toISOString().slice(0, 10)

  it('sin ninguna sesión desde hoy, la regla y lo que cuentan los ordinarios recogidos', () => {
    const r = proximoPleno({ sesiones, hoy })
    const ordinarios = sesiones.filter((s) => s.kind === 'ordinario')
    const lunes = ordinarios.filter((s) => dia(s.date).getUTCDay() === 1)
    const primerLunes = lunes.filter((s) => dia(s.date).getUTCDate() <= 7)
    expect(r).toEqual({
      convocado: null,
      ordinarios: ordinarios.length,
      enLunes: lunes.length,
      primerLunes: primerLunes.length,
    })
    expect(ordinarios.length, 'mide algo').toBeGreaterThan(10)
  })

  it('con una sesión desde hoy, ésa: la más próxima, aunque sea hoy', () => {
    const futura = { id: 'futura', date: '2099-11-02', kind: 'ordinario' }
    const deHoy = { id: 'de-hoy', date: hoy, kind: 'extraordinario' }
    expect(proximoPleno({ sesiones: [...sesiones, futura], hoy }).convocado).toEqual({
      id: 'futura',
      fecha: '2099-11-02',
      tipo: 'ordinario',
    })
    expect(proximoPleno({ sesiones: [...sesiones, futura, deHoy], hoy }).convocado?.id).toBe(
      'de-hoy',
    )
  })

  it('sin sesiones, nada que contar y no un cero', () => {
    expect(proximoPleno({ sesiones: [], hoy })).toEqual({
      convocado: null,
      ordinarios: 0,
      enLunes: 0,
      primerLunes: 0,
    })
  })
})
