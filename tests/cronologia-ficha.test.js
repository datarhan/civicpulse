/**
 * La tira de la cronología de «coste-efectivo» (src/lib/cronologia.js).
 *
 * La tira marca el mayor hueco entre dos publicaciones de la ficha del
 * expediente, y esas fechas (`ficha`) se añadieron a mano al snapshot congelado.
 * Una fecha a mano es la forma de colar una afirmación que la pieza no hace, así
 * que cada una se ata aquí a la frase de su hito que la dice —el mismo día, «al
 * día siguiente» o «el 11 de febrero»—, y ninguna frase que hable de una
 * publicación de la ficha puede quedarse sin la suya.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { duracion, isoDeFecha, msDeIso, silencioDeLaFicha } from '../src/lib/cronologia'

const pieza = JSON.parse(
  readFileSync(join(__dirname, '../public/data/reportajes/coste-efectivo.json'), 'utf8'),
)
const hitos = pieza.cronologia.hitos
const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]
const UN_DIA = 24 * 3600 * 1000
const HABLA_DE_LA_FICHA = /La ficha (lo |los |la )?publica/

describe('la cronología de coste-efectivo', () => {
  it('mira algo: hay hitos, y al menos dos publicaciones fechadas', () => {
    expect(hitos.length).toBeGreaterThan(5)
    expect(hitos.filter((h) => h.ficha).length).toBeGreaterThanOrEqual(2)
  })

  it('cada hito se sabe fechar: si no, la tira no se dibuja', () => {
    for (const h of hitos) expect(isoDeFecha(h.f), h.f).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('cada fecha de la ficha la dice la frase de su hito', () => {
    for (const h of hitos.filter((x) => x.ficha)) {
      const acto = isoDeFecha(h.f)
      expect(h.ficha, h.f).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      const dias = (msDeIso(h.ficha) - msDeIso(acto)) / UN_DIA
      expect(dias, `${h.f}: la ficha no publica antes del acto`).toBeGreaterThanOrEqual(0)
      if (dias === 0) {
        // El hito ES la publicación: «La ficha publica el acto público…».
        expect(h.t, h.f).toMatch(/^La ficha publica/)
      } else if (dias === 1) {
        expect(h.t, h.f).toMatch(/La ficha lo publica al día siguiente/)
      } else {
        const [, m, d] = h.ficha.split('-').map(Number)
        expect(h.t, h.f).toMatch(
          new RegExp(`La ficha [^.]*publica[^.]* el ${d} de ${MESES[m - 1]}\\b`),
        )
      }
    }
  })

  it('ninguna frase que hable de una publicación de la ficha se queda sin fecha', () => {
    for (const h of hitos) {
      if (HABLA_DE_LA_FICHA.test(h.t)) expect(h.ficha, h.f).toBeDefined()
      else expect(h.ficha, `${h.f}: fecha de ficha sin frase que la diga`).toBeUndefined()
    }
  })

  it('el hueco empieza en «su última entrada en cinco años» y dura al menos eso', () => {
    const silencio = silencioDeLaFicha(hitos)
    expect(silencio).not.toBeNull()
    const ultima = hitos.find((h) => /última entrada en cinco años/.test(h.t))
    expect(ultima, 'la lista ya no dice cuál fue la última entrada').toBeDefined()
    expect(silencio.desde).toBe(ultima.ficha)
    expect(msDeIso(silencio.hasta) - msDeIso(silencio.desde)).toBeGreaterThanOrEqual(
      5 * 365 * UN_DIA,
    )
  })
})

describe('duracion', () => {
  it('cuenta años y meses cumplidos', () => {
    expect(duracion('2021-02-11', '2026-04-28')).toBe('5 años y 2 meses')
    expect(duracion('2021-02-11', '2026-04-10')).toBe('5 años y 1 mes')
    expect(duracion('2019-01-01', '2020-01-01')).toBe('1 año')
    expect(duracion('2020-01-31', '2020-03-01')).toBe('1 mes')
  })
})
