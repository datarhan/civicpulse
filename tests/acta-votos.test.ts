/**
 * Votaciones leídas del texto de dos actas reales de pleno.
 *
 * Fixtures descargados el 2026-10-13 de la pestaña «Documentos» de regmeet:
 *   curl -s -A "CivicPulse/1.0 (civic monitor)" -o .cache/acta-2026-02-09.pdf \
 *     "https://regmeet.com/files/uploads/aytoribarroja/09-02-2026.Pleno2026-02-10_20-43-39/documentos/2026-07-30_13-45-56_0.pdf"
 *   pdftotext .cache/acta-2026-02-09.pdf tests/fixtures/regmeet_acta_2026-02-09.txt
 *   curl -s -A "CivicPulse/1.0 (civic monitor)" -o .cache/acta-2026-07-27.pdf \
 *     "https://regmeet.com/files/uploads/aytoribarroja/27-07-2026.Pleno2026-07-29_23-32-33/documentos/2026-07-30_13-49-04_0.pdf"
 *   pdftotext .cache/acta-2026-07-27.pdf tests/fixtures/regmeet_acta_2026-07-27.txt
 * (sin `-layout`). Los PDF se quedan en .cache/: su Author es «indenova».
 * Son las descargas reales con los particulares omitidos (la del 27-07: nombres, domicilio y
 * referencia catastral), marcados «[persona particular — omitido]», «[domicilio — omitido]» y
 * «[referencia catastral — omitida]»; ninguna cláusula de votación se ha tocado.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseVotacionesActa, blocDeActa, SIN_DESGLOSE } from '../src/scraper/acta-votos'
import { SPEAKER_GROUPS } from '../src/scraper/pleno-votes'

const ACTA_0902 = readFileSync('tests/fixtures/regmeet_acta_2026-02-09.txt', 'utf8')
const ACTA_2707 = readFileSync('tests/fixtures/regmeet_acta_2026-07-27.txt', 'utf8')
const dir = (v: { blocs: { bloc: string | null; direction: string }[] }, b: string) =>
  v.blocs.find((x) => x.bloc === b)?.direction
const escanos = (v: { blocs: { seats?: number }[] }) =>
  v.blocs.reduce((s, b) => s + (b.seats ?? 0), 0)

describe('blocDeActa', () => {
  it('nombra cada grupo con el nombre que usa el acta', () => {
    expect(blocDeActa('PSOE')).toBe('PSOE')
    expect(blocDeActa('PP')).toBe('PP')
    expect(blocDeActa('VOX')).toBe('VOX')
    expect(blocDeActa('EUPV – Unides Podem per Riba-roja')).toBe('EU-Podem')
    expect(blocDeActa('Compromís per Riba-roja: Acord per Guanyar')).toBe('Compromís')
  })
  it('lo que no reconoce es null, nunca un grupo por descarte', () => {
    expect(blocDeActa('Grupo Mixto')).toBeNull()
  })
  it('sólo devuelve grupos de SPEAKER_GROUPS (no reescribe la lista)', () => {
    for (const n of ['PSOE', 'PP', 'VOX', 'EUPV', 'Compromís']) {
      expect(SPEAKER_GROUPS).toContain(blocDeActa(n))
    }
  })
})

describe('parseVotacionesActa — acta real del 09-02-2026', () => {
  const v = parseVotacionesActa(ACTA_0902)
  it('punto 10: PP abstención, VOX en contra', () => {
    const p10 = v.filter((x) => x.itemNumber === 10 && x.fase === 'fondo')
    expect(p10).toHaveLength(1)
    expect(dir(p10[0], 'PP')).toBe('abstencion')
    expect(dir(p10[0], 'VOX')).toBe('en_contra')
    expect(dir(p10[0], 'EU-Podem')).toBe('a_favor')
  })
  it('punto 11: separa la urgencia del fondo', () => {
    const urg = v.filter((x) => x.itemNumber === 11 && x.fase === 'urgencia')
    const fondo = v.filter((x) => x.itemNumber === 11 && x.fase === 'fondo')
    expect(urg).toHaveLength(1)
    expect(dir(urg[0], 'PP')).toBe('en_contra')
    expect(dir(urg[0], 'VOX')).toBe('abstencion')
    expect(dir(urg[0], 'EU-Podem')).toBe('abstencion')
    expect(fondo).toHaveLength(1)
    expect(dir(fondo[0], 'PP')).toBe('en_contra')
    expect(dir(fondo[0], 'VOX')).toBe('abstencion')
    expect(dir(fondo[0], 'EU-Podem')).toBe('a_favor')
  })
  it('cada votación nominal suma los 21 escaños o menos, nunca más', () => {
    for (const x of v.filter((x) => !x.unanimidad)) {
      expect(escanos(x)).toBeLessThanOrEqual(21)
    }
  })
  it('no mapea nada a ciegas: ningún grupo sin mapear en esta acta', () => {
    expect(v.flatMap((x) => x.sinMapear)).toEqual([])
  })
  it('lee «por unanimidad» como unanimidad sin bloques', () => {
    const u = v.filter((x) => x.unanimidad)
    expect(u.length).toBeGreaterThan(0)
    expect(u.every((x) => x.blocs.length === 0)).toBe(true)
  })
  it('los números de punto son monótonos (una lista «1. Que…» dentro de un acuerdo no es un punto)', () => {
    const nums = v.map((x) => x.itemNumber).filter((n): n is number => n != null)
    for (let i = 1; i < nums.length; i++) expect(nums[i]).toBeGreaterThanOrEqual(nums[i - 1])
    expect(Math.max(...nums)).toBeLessThanOrEqual(30)
  })
  it('el punto 3 se queda en el 3 aunque su expediente enumere «1.- … 4.- Propuesta de Acuerdo»', () => {
    // Acta, punto 3: «4.- Propuesta de Acuerdo al Pleno.» es el cuarto documento del
    // expediente, no el punto 4; la votación que sigue («por 13 votos a favor … 7 votos
    // en contra (7 PP) y 1 abstención (1 VOX), acordó») es del punto 3.
    const p3 = v.filter((x) => x.itemNumber === 3)
    expect(p3).toHaveLength(1)
    expect(dir(p3[0], 'PP')).toBe('en_contra')
    expect(v.filter((x) => x.itemNumber === 4).every((x) => x.unanimidad)).toBe(true)
  })
  it('el punto 6 se queda en el 6 aunque su moción enumere «1.» … «7.» en líneas sueltas', () => {
    // Acta, punto 6: «por 1 voto a favor (1 VOX), 7 abstenciones (7 PP) y 13 en contra
    // (…) acordó desestimar la moción presentada.»
    const p6 = v.filter((x) => x.itemNumber === 6)
    expect(p6).toHaveLength(1)
    expect(dir(p6[0], 'VOX')).toBe('a_favor')
    expect(dir(p6[0], 'PSOE')).toBe('en_contra')
    expect(v.filter((x) => x.itemNumber === 7)).toHaveLength(1)
  })
  it('el acta anterior aprobada «por unanimidad» (punto 1) cuenta como votación', () => {
    // Acta, punto 1: «sometidas a votación, fue aprobada por unanimidad.»
    expect(v.filter((x) => x.itemNumber === 1 && x.unanimidad)).toHaveLength(1)
  })
})

describe('parseVotacionesActa — acta real del 27-07-2026 (varias urgencias)', () => {
  const v = parseVotacionesActa(ACTA_2707)
  // Forma comprobada en el acta: las urgencias NO llevan número propio. Van todas
  // bajo «7.- Asuntos de Urgencia», cada una encabezada sólo por su expediente
  // («URBANISMO, Expediente 3539/2026, …», «SECRETARIA, Expediente 3810/2026, …»,
  // «INTERVENCIÓN, Expediente 4007/2026, …»). Tras el 7 vienen 8–11, que son daciones
  // de cuenta y ruegos sin votación, así que el último punto con votos es el 7.
  it('encuentra más de una votación de fondo bajo el punto de urgencias', () => {
    const ultimo = Math.max(...v.map((x) => x.itemNumber ?? 0))
    expect(ultimo).toBe(7)
    expect(v.filter((x) => x.itemNumber === ultimo && x.fase === 'fondo').length).toBeGreaterThan(1)
    expect(v.filter((x) => x.itemNumber === 7 && x.fase === 'urgencia')).toHaveLength(3)
  })
  it('lee un paréntesis que el acta no cierra sin repartir los votos a otro sentido', () => {
    // Acta, primera urgencia del punto 7: «por 18 votos a favor (11 PSOE y 7 PP y 3
    // abstenciones (1 VOX, 1 EUPV – Unides Podem per Riba-roja y 1 Compromís per
    // Riba-roja: Acord per Guanyar), acordó pasar a continuación al fondo» — falta el «)»
    // tras «7 PP».
    const u = v.filter((x) => x.itemNumber === 7 && x.fase === 'urgencia')[0]
    expect(dir(u, 'PSOE')).toBe('a_favor')
    expect(dir(u, 'PP')).toBe('a_favor')
    expect(dir(u, 'VOX')).toBe('abstencion')
    expect(dir(u, 'Compromís')).toBe('abstencion')
    expect(escanos(u)).toBe(21)
  })
  it('la ratificación de un asunto sin dictaminar no es la votación de fondo', () => {
    // Acta, punto 6: «Previa ratificación de su inclusión en el orden del día por estar
    // sin dictaminar, por 20 votos a favor (…) y 1 abstención (1 EUPV – Unides Podem per
    // Riba-roja), el Pleno acordó pasar a continuación al fondo del asunto». El fondo no
    // lleva votación transcrita.
    const p6 = v.filter((x) => x.itemNumber === 6)
    expect(p6).toHaveLength(1)
    expect(p6[0].fase).toBe('ratificacion')
    expect(dir(p6[0], 'EU-Podem')).toBe('abstencion')
  })
  it('una votación sin paréntesis citada en los antecedentes no es una votación del pleno', () => {
    // Acta, punto 4, antecedente Octavo (2018): «…por 8 votos a favor, 6 en contra y 7
    // abstenciones y continuar…» — ni grupos ni «acordó» detrás.
    expect(v.some((x) => /8 votos a favor, 6 en contra/.test(x.literal))).toBe(false)
  })
  it('no mapea nada a ciegas: ningún grupo sin mapear en esta acta', () => {
    expect(v.flatMap((x) => x.sinMapear)).toEqual([])
  })
})

describe('parseVotacionesActa — ambas actas', () => {
  it('en estas dos actas cada votación nominal reparte exactamente los 21 escaños', () => {
    // Asistieron los 21 en ambas sesiones: si un tramo pierde o duplica un grupo, la
    // suma lo delata.
    for (const t of [ACTA_0902, ACTA_2707]) {
      const nominales = parseVotacionesActa(t).filter((x) => !x.unanimidad)
      expect(nominales.length).toBeGreaterThan(0)
      for (const x of nominales) expect(escanos(x), x.literal).toBe(21)
    }
  })
  it('un grupo que no reconoce va a sinMapear con bloc null, no a un grupo', () => {
    const [x] = parseVotacionesActa(
      'El Pleno, por 2 votos a favor (1 PSOE y 1 Grupo Mixto), acordó:',
    )
    expect(x.sinMapear).toEqual(['Grupo Mixto'])
    expect(x.blocs).toContainEqual({ bloc: null, direction: 'a_favor', seats: 1 })
  })
  it('una cláusula nominal sin desglose legible lo declara en sinMapear', () => {
    for (const t of [
      'El Pleno, por 13 votos a favor, acordó:',
      'El Pleno, por 13 votos a favor acordó:',
    ]) {
      const [x] = parseVotacionesActa(t)
      expect(x.unanimidad).toBe(false)
      expect(x.blocs).toEqual([])
      expect(x.sinMapear).toContain(SIN_DESGLOSE)
      expect(SIN_DESGLOSE).toBe('(cláusula sin desglose legible)')
    }
  })
})
