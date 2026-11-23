import { describe, expect, it } from 'vitest'

import { CATALOGUE } from '../src/i18n'
import { euros } from '../src/lib/formatters'
import { subtituloDe, textoParaCompartir } from '../src/lib/cambios-rotulos'
import { ESTADOS_DE_LA_QUEJA } from '../src/scraper/camino-de-la-queja'
import { PLENO_KINDS } from '../src/scraper/plenos'

/**
 * Las líneas de /cambios que pone la página y no los datos: el subtítulo de una
 * tarjeta y el texto que se comparte por WhatsApp. Las armaba `useCambios` con
 * las tablas en castellano de los hooks, que dan el castellano a propósito para
 * las páginas sin traducir; pero /cambios está traducida, y en valencià la
 * tarjeta decía «Queja RR-… · Limpieza», «Contrato adjudicado · …» o «Sesión
 * ordinario» entre rótulos en valencià.
 *
 * El castellano no cambia, salvo la sesión de un pleno: «Sesión ordinario» no
 * concordaba, y «Sesión otro» no decía nada.
 */
const tDe = (idioma) => (clave) => CATALOGUE[idioma][clave] ?? clave
const es = tDe('es')
const ca = tDe('ca')

const queja = {
  kind: 'queja',
  id: 'RR-2026-0042',
  categoria: 'limpieza',
  barrio: 'Masía de Traver',
  estado: 'en_tramite',
  descripcion: 'Contenedor desbordado\nDesde el lunes',
}
const pleno = { kind: 'pleno', title: 'Pleno ordinario 4 de noviembre de 2026', date: '2026-11-04' }
const contrato = { kind: 'licitacion', title: 'Mantenimiento de alumbrado', importe: 14984.46 }
const subvencion = { kind: 'subvencion', title: 'Ayudas al comercio local', organo: 'Ayuntamiento' }
const participa = { kind: 'participa', tipo: 'survey', title: 'Encuesta de movilidad' }

describe('en castellano, el mismo texto que armaba el hook', () => {
  it('queja', () => {
    expect(textoParaCompartir(es, queja)).toBe(
      'Queja RR-2026-0042 · Limpieza\nContenedor desbordado\nDesde el lunes',
    )
    expect(subtituloDe(es, queja)).toBe(
      `Limpieza · Masía de Traver · ${CATALOGUE.es['quejas.estado.en_tramite']}`,
    )
  })

  it('pleno', () => {
    expect(textoParaCompartir(es, pleno)).toBe(
      'Pleno ordinario 4 de noviembre de 2026 — 2026-11-04',
    )
  })

  it('contrato, con y sin importe', () => {
    expect(textoParaCompartir(es, contrato)).toBe(
      `Contrato adjudicado · Mantenimiento de alumbrado · ${euros(14984.46)} sin IVA`,
    )
    expect(textoParaCompartir(es, { ...contrato, importe: null })).toBe(
      'Contrato adjudicado · Mantenimiento de alumbrado',
    )
  })

  it('subvención', () => {
    expect(textoParaCompartir(es, subvencion)).toBe('Subvención · Ayudas al comercio local')
    expect(subtituloDe(es, subvencion)).toBe('Ayuntamiento')
  })

  it('participación, con clase conocida y sin ella', () => {
    expect(textoParaCompartir(es, participa)).toBe('Encuesta · Encuesta de movilidad')
    expect(subtituloDe(es, participa)).toBe('Encuesta')
    expect(textoParaCompartir(es, { ...participa, tipo: null })).toBe(
      'Participación · Encuesta de movilidad',
    )
  })

  it('la prensa sigue con lo que trae del hook', () => {
    const prensa = {
      kind: 'prensa',
      subtitle: 'Las Provincias',
      shareText: '"T" — Las Provincias (2026-11-20)',
    }
    expect(textoParaCompartir(es, prensa)).toBe(prensa.shareText)
    expect(subtituloDe(es, prensa)).toBe('Las Provincias')
  })
})

describe('la sesión de un pleno concuerda y dice algo', () => {
  it('cada clase exportada tiene su rótulo en los dos idiomas', () => {
    // «otro» no es una clase: es lo que `classify` dice cuando el título no la
    // trae, y se rotula como una sesión sin ella. Las demás, con su clave.
    expect(PLENO_KINDS).toContain('otro')
    for (const idioma of ['es', 'ca']) {
      for (const tipo of PLENO_KINDS) {
        const clave = tipo === 'otro' ? 'cambios.sesion.municipal' : `cambios.sesion.${tipo}`
        expect(CATALOGUE[idioma][clave], `${idioma} ${tipo}`).toBeTruthy()
        expect(subtituloDe(tDe(idioma), { ...pleno, tipoSesion: tipo })).toBe(
          CATALOGUE[idioma][clave],
        )
      }
    }
  })

  it('las palabras', () => {
    expect(subtituloDe(es, { ...pleno, tipoSesion: 'ordinario' })).toBe('Sesión ordinaria')
    expect(subtituloDe(es, { ...pleno, tipoSesion: 'otro' })).toBe('Sesión municipal')
    expect(subtituloDe(es, { ...pleno, tipoSesion: null })).toBe('Sesión municipal')
    expect(subtituloDe(ca, { ...pleno, tipoSesion: 'ordinario' })).toBe('Sessió ordinària')
  })
})

describe('en valencià, nada de la página sale en castellano', () => {
  it('las líneas de la página', () => {
    expect(textoParaCompartir(ca, queja)).toMatch(/^Queixa RR-2026-0042 · Neteja\n/)
    expect(textoParaCompartir(ca, contrato)).toBe(
      `Contracte adjudicat · Mantenimiento de alumbrado · ${euros(14984.46)} sense IVA`,
    )
    expect(textoParaCompartir(ca, subvencion)).toBe('Subvenció · Ayudas al comercio local')
    expect(textoParaCompartir(ca, participa)).toBe('Enquesta · Encuesta de movilidad')
    expect(textoParaCompartir(ca, { ...participa, tipo: null })).toMatch(/^Participació · /)
  })

  it('el estado de una queja, en cada uno de los suyos', () => {
    for (const estado of ESTADOS_DE_LA_QUEJA) {
      const s = subtituloDe(ca, { ...queja, estado })
      expect(s, estado).toContain(CATALOGUE.ca[`quejas.estado.${estado}`])
    }
  })

  it('un código sin rótulo no se imprime', () => {
    expect(subtituloDe(ca, { ...queja, estado: 'inventado', barrio: null })).toBe('Neteja')
  })
})
