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
 *
 * Extractos (Task 6b, 2026-10-13): rangos CONTIGUOS de líneas del texto que deja
 * `scrape:pleno-actas` — `pdftotext .cache/pleno-actas/<plenoId>-0.pdf
 * .cache/pleno-actas/<plenoId>-0.txt` (sin `-layout`; el PDF casa con el `sha256Short`
 * de public/data/pleno-actas.json) y luego `sed -n A,Bp`. Cada uno empieza en un
 * encabezado de punto y se lee con `{ desde }` = ese número:
 *   regmeet_acta_2026-05-11_extracto.txt — 10yl550, líneas 302–450 (puntos 5–7), desde 5.
 *     https://regmeet.com/files/uploads/aytoribarroja/11-05-2026.Pleno2026-05-11_23-30-05/documentos/2026-07-30_13-47-39_0.pdf
 *   regmeet_acta_2026-04-20_extracto.txt — k4olcs, líneas 84–3921 (puntos 2–8), desde 2.
 *     https://regmeet.com/files/uploads/aytoribarroja/20-04-2026.Pleno2026-04-21_04-44-21/documentos/2026-07-30_13-47-18_0.pdf
 *   regmeet_acta_2025-12-01_extracto.txt — qz6weg, líneas 3538–4655 (puntos 10–13), desde 10.
 *     https://regmeet.com/files/uploads/aytoribarroja/01-12-2025.Pleno2025-12-04_01-07-20/documentos/2026-07-30_15-35-18_0.pdf
 *   regmeet_acta_2025-11-03_extracto.txt — 1du4rf5, líneas 977–2150 (puntos 6–10), desde 6.
 *     https://regmeet.com/files/uploads/aytoribarroja/03-11-2025.Pleno2025-11-04_16-50-08/documentos/2026-07-30_15-34-56_0.pdf
 * Omitidos con las mismas marcas, línea a línea: en el del 20-04, la vivienda del punto 5
 * (polígono/parcela, referencia catastral) y las tres personas particulares del expediente;
 * en el del 03-11, el nombre y el NIF de un proveedor persona física (punto 6).
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

/**
 * Encabezados sin línea en blanco delante. En estas cuatro actas pdftotext pega el
 * encabezado de un punto a la línea anterior («…acordó desestimar / la moción
 * presentada. / 6.- 11/2026/PGRU, Moción…»), o lo escribe sin separador
 * («10.FIESTAS, Expediente…»). Bastaba perder uno para que todos los puntos
 * siguientes se quedaran con el número del anterior, y `check:votos-acta` daba
 * «no encontrada» a sus desgloses publicados.
 *
 * Los números de punto son los de las filas publicadas de cada sesión en
 * public/data/pleno-votes.json el 2026-10-13 (sólo lectura).
 */
const extracto = (fecha: string) =>
  readFileSync(`tests/fixtures/regmeet_acta_${fecha}_extracto.txt`, 'utf8')
const fondoDe = (v: ReturnType<typeof parseVotacionesActa>, n: number) =>
  v.filter((x) => x.itemNumber === n && x.fase === 'fondo')

describe('parseVotacionesActa — encabezados sin línea en blanco delante', () => {
  it('10yl550 (11-05-2026): el punto 6 tiene su votación de fondo', () => {
    const v = parseVotacionesActa(extracto('2026-05-11'), { desde: 5 })
    const p6 = fondoDe(v, 6)
    expect(p6).toHaveLength(1)
    // Extracto l.114–115: «por 14 votos a favor (11 PSOE, 1 EUPV …, 1 Compromís … y 1
    // VOX), y 7 votos en contra (7 PP), acordó:»
    expect(dir(p6[0], 'VOX')).toBe('a_favor')
    expect(dir(p6[0], 'PP')).toBe('en_contra')
    expect(escanos(p6[0])).toBe(21)
    // La del punto 5 se queda en el 5: «6.-» va justo después de su «acordó».
    expect(fondoDe(v, 5)).toHaveLength(1)
    expect(dir(fondoDe(v, 5)[0], 'PP')).toBe('a_favor')
  })

  it('k4olcs (20-04-2026): los puntos 6 y 7 tienen una votación de fondo cada uno', () => {
    const v = parseVotacionesActa(extracto('2026-04-20'), { desde: 2 })
    for (const n of [6, 7]) expect(fondoDe(v, n), `punto ${n}`).toHaveLength(1)
    expect(dir(fondoDe(v, 6)[0], 'VOX')).toBe('en_contra')
    // Punto 7, «Asuntos de Urgencia»: urgencia y fondo, las dos «por unanimidad».
    expect(fondoDe(v, 7)[0].unanimidad).toBe(true)
    expect(v.filter((x) => x.itemNumber === 7 && x.fase === 'urgencia')).toHaveLength(1)
  })

  it('k4olcs: la carta de servicios del punto 2 («3. SERVICIOS PÚBLICOS (SP)» … «27.») no son puntos', () => {
    // Extracto l.291 «3. SERVICIOS PÚBLICOS (SP)», tras una línea en blanco, enumera los
    // departamentos hasta el 27; el punto 3 de verdad es l.1465 «3.- INTEGRIDAD,
    // Expediente: 4305/2024/GEN, …».
    const v = parseVotacionesActa(extracto('2026-04-20'), { desde: 2 })
    const nums = v.map((x) => x.itemNumber).filter((n): n is number => n != null)
    expect(Math.max(...nums)).toBeLessThanOrEqual(8)
    expect(new Set(nums)).toEqual(new Set([2, 3, 4, 5, 6, 7]))
  })

  it('qz6weg, punto 10: «…, 1 EUPV- Unides Podem, y 1 VOX)» no pierde a VOX', () => {
    // Extracto: «por 14 votos a favor (11 PSOE, 1 Compromís per Riba-roja: Acord per
    // Guanyar, 1 EUPV- Unides Podem, y 1 VOX) y 7 abstenciones (7 PP), acordó». La coma
    // antes de la «y» dejaba el trozo «y 1 VOX», sin número delante, en sinMapear.
    const [p10] = fondoDe(parseVotacionesActa(extracto('2025-12-01'), { desde: 10 }), 10)
    expect(dir(p10, 'VOX')).toBe('a_favor')
    expect(dir(p10, 'PP')).toBe('abstencion')
    expect(escanos(p10)).toBe(21)
    expect(p10.sinMapear).toEqual([])
  })

  it('qz6weg (01-12-2025): los puntos 10 y 12 tienen una votación de fondo cada uno', () => {
    const v = parseVotacionesActa(extracto('2025-12-01'), { desde: 10 })
    for (const n of [10, 12]) expect(fondoDe(v, n), `punto ${n}`).toHaveLength(1)
    expect(dir(fondoDe(v, 12)[0], 'VOX')).toBe('en_contra')
  })

  it('1du4rf5 (03-11-2025): los puntos 6, 8 y 9 tienen una votación de fondo cada uno', () => {
    const v = parseVotacionesActa(extracto('2025-11-03'), { desde: 6 })
    for (const n of [6, 8, 9]) expect(fondoDe(v, n), `punto ${n}`).toHaveLength(1)
    // Extracto: «por 2 votos a favor (1 EUPV … y 1 Compromís …) y 19 votos en contra
    // (11 PSOE, 7 PP y 1 VOX) acordó» es el punto 9, no el 8.
    expect(dir(fondoDe(v, 9)[0], 'PSOE')).toBe('en_contra')
    expect(dir(fondoDe(v, 8)[0], 'PSOE')).toBe('a_favor')
  })

  it('sin `desde`, un texto que no empieza en el punto 1 no numera nada', () => {
    // Un extracto que abre en «5.-» no puede saltarse el 1: sus votaciones quedan sin
    // punto, nunca con uno inventado.
    const v = parseVotacionesActa(extracto('2026-05-11'))
    expect(v.length).toBeGreaterThan(0)
    expect(v.every((x) => x.itemNumber == null)).toBe(true)
  })
})
