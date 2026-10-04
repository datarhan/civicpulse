/**
 * La línea del resumen de /plenos/:id dice qué cuenta, y lo dice en los dos idiomas.
 *
 * La revisión lectora del 04-10-2026 leyó en /plenos/10yl550 «15 puntos en el orden
 * del día · 1 votaciones (1 aprobadas) · …» y concluyó que en una sesión de quince
 * puntos sólo se votó una cosa. Las votaciones de esa línea son las que hemos
 * transcrito y firmado en `pleno-votes.json` —ese día, de siete sesiones de sesenta y
 * dos—, y que falte una votación transcrita no es que no se votara: es la regla del
 * índice de /plenos desde la #75, «ausencia ≠ cero». El índice lo dice con
 * «votaciones transcritas» y con su aviso; la línea dice ahora lo mismo con las
 * mismas palabras. La ficha de votaciones de encima pintaba el mismo número con
 * «1 aprob.» y caía en lo mismo: dice «transcrita».
 *
 * Ningún dato registra que las votaciones de una sesión estén todas
 * (`src/lib/pleno-summary.js`), así que el aviso va siempre y no «cuando falten».
 * Medido ese día, las siete sesiones con alguna tenían más puntos en el orden del día
 * que votaciones transcritas.
 *
 * Y la línea estaba escrita en castellano dentro del JSX: en valencià salía igual, y
 * «1 votaciones» no tenía singular. De paso, una sesión sin declaraciones extraídas
 * decía «0 declaraciones contrastadas», un cero que nadie midió; su ficha ya decía
 * «sin extraer», y ahora la línea también.
 *
 * La sesión es la de la revisión, real, con su orden del día publicado. Lo que se le
 * sirve son registros publicados —votaciones, hallazgos, declaraciones— en el número
 * que cada escenario necesita para pintar cada forma, singular y plural; y además la
 * sesión tal cual se publica. Las palabras esperadas están escritas a mano, en los dos
 * idiomas: son lo que esta prueba fija.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { Route, Routes } from 'react-router-dom'

import PlenoDetalle from '../../src/pages/PlenoDetalle'
import { CATALOGUE } from '../../src/i18n'
import { detectorDeCastellano } from '../setup/castellano'
import { pintaYLee } from '../setup/pinta-y-lee'

const lee = (f) => JSON.parse(readFileSync(`public/data/${f}`, 'utf8'))
const PLENOS = lee('plenos.json')
const AGENDAS = lee('plenos-agendas.json')
const VOTOS = lee('pleno-votes.json')
const HALLAZGOS = lee('pleno-findings.json')
const VIDEOS = lee('pleno-videos.json')
const MANIFIESTO = lee('pleno-claims/index.json')

/** La sesión de la revisión lectora. */
const ID = '10yl550'
const AGENDA = AGENDAS.plenos.find((a) => a.id === ID)
const PUNTOS = AGENDA?.agenda.length
const CHUNK_URL = `/data/pleno-claims/${ID}.json`

/** El fragmento de declaraciones de la sesión o, si no lo tuviera, el primero publicado. */
const ENTRADA = MANIFIESTO.plenos.find((p) => p.plenoId === ID) ?? MANIFIESTO.plenos[0]
const FRAGMENTO = lee(ENTRADA.chunkPath)
const SIN_DATOS = FRAGMENTO.items.filter((it) => it.verification?.verdict === 'sin-datos')

/**
 * Una declaración verificada de verdad, de la primera sesión que tenga alguna. Si un
 * día no hubiera ninguna, se fabrica la mínima: una «sin datos» marcada verificada.
 */
const CON_VERIFICADA = MANIFIESTO.plenos.find((p) => (p.byVerdict?.verificado ?? 0) > 0)
const VERIFICADA = CON_VERIFICADA
  ? lee(CON_VERIFICADA.chunkPath).items.find((it) => it.verification?.verdict === 'verificado')
  : { ...SIN_DATOS[0], verification: { ...SIN_DATOS[0].verification, verdict: 'verificado' } }

const APROBADAS = VOTOS.items.filter((v) => v.outcome === 'aprobado')
/** La rechazada publicada; si no hubiera ninguna, una aprobada que no lo fue. */
const RECHAZADA = VOTOS.items.find((v) => v.outcome === 'rechazado') ?? {
  ...APROBADAS[0],
  id: `${APROBADAS[0].id}-rechazada`,
  outcome: 'rechazado',
}

/** Los cinco ficheros de la página, con lo que el escenario le pone a la sesión. */
function sirve({ puntos = AGENDA.agenda, votos = [], hallazgos = [], declaraciones = null }) {
  const mapa = {
    '/data/plenos.json': PLENOS,
    '/data/plenos-agendas.json': {
      ...AGENDAS,
      plenos: [{ ...AGENDA, agenda: puntos, agendaCount: puntos.length }],
    },
    '/data/pleno-votes.json': { ...VOTOS, items: votos.map((v) => ({ ...v, plenoId: ID })) },
    '/data/pleno-findings.json': {
      ...HALLAZGOS,
      items: hallazgos.map((f) => ({ ...f, plenoId: ID })),
    },
    '/data/pleno-videos.json': VIDEOS,
  }
  if (declaraciones) mapa[CHUNK_URL] = { ...FRAGMENTO, plenoId: ID, items: declaraciones }
  return mapa
}

// ─── Qué se lee ────────────────────────────────────────────────────────────────

/**
 * La línea del resumen: el elemento más interior que nombra el orden del día y
 * separa sus piezas con « · ». Se busca por lo que dice y no por su etiqueta, para
 * que la prueba falle por la redacción y no por un selector.
 */
function lineaDe(c) {
  const candidatas = [...c.querySelectorAll('*')].filter(
    (el) => /orden del día|ordre del dia/.test(el.textContent) && el.textContent.includes(' · '),
  )
  if (candidatas.length === 0) return null
  return candidatas.reduce((a, b) => (b.textContent.length < a.textContent.length ? b : a))
}

/** La ficha de votaciones de la tira: su valor y su nota. */
function fichaDeVotos(c, idioma) {
  const rotulo = CATALOGUE[idioma]['plenoDetail.votes']
  const ficha = [...c.querySelectorAll('.cp-pleno-fichas > div')].find(
    (f) => f.firstElementChild?.textContent === rotulo,
  )
  return ficha ? [...ficha.children].slice(1).map((d) => d.textContent) : ['(sin ficha)']
}

const leeResumen = (idioma) => (c) => [
  lineaDe(c)?.textContent ?? '(sin línea)',
  ...fichaDeVotos(c, idioma),
]

const laFicha = () => (
  <Routes>
    <Route path="/plenos/:id" element={<PlenoDetalle />} />
  </Routes>
)

// ─── Lo que tiene que decir ────────────────────────────────────────────────────

const AVISO_ES =
  'Lo que esta página no cuenta no es que no ocurriera: es que aún no lo hemos leído.'
const AVISO_CA =
  'El que esta pàgina no compta no vol dir que no passara: vol dir que encara no ho hem llegit.'

const ESCENARIOS = [
  {
    nombre:
      'una de cada: un punto, una votación aprobada, una declaración contrastada, un hallazgo',
    fetch: sirve({
      puntos: AGENDA.agenda.slice(0, 1),
      votos: APROBADAS.slice(0, 1),
      declaraciones: [VERIFICADA],
      hallazgos: HALLAZGOS.items.slice(0, 1),
    }),
    es: [
      `1 punto en el orden del día · 1 votación transcrita (1 aprobada) · 1 declaración contrastada · 1 hallazgo editorial. ${AVISO_ES}`,
      '1',
      'transcrita',
    ],
    ca: [
      `1 punt en l’ordre del dia · 1 votació transcrita (1 aprovada) · 1 declaració contrastada · 1 troballa editorial. ${AVISO_CA}`,
      '1',
      'transcrita',
    ],
  },
  {
    nombre:
      'varias de cada: el orden del día entero, tres votaciones con una rechazada, ninguna declaración contrastada, dos hallazgos',
    fetch: sirve({
      votos: [...APROBADAS.slice(0, 2), RECHAZADA],
      declaraciones: SIN_DATOS.slice(0, 3),
      hallazgos: HALLAZGOS.items.slice(0, 2),
    }),
    es: [
      `${PUNTOS} puntos en el orden del día · 3 votaciones transcritas (2 aprobadas) · 0 declaraciones contrastadas · 2 hallazgos editoriales. ${AVISO_ES}`,
      '3',
      'transcritas',
    ],
    ca: [
      `${PUNTOS} punts en l’ordre del dia · 3 votacions transcrites (2 aprovades) · 0 declaracions contrastades · 2 troballes editorials. ${AVISO_CA}`,
      '3',
      'transcrites',
    ],
  },
  {
    nombre: 'nada transcrito ni extraído: ni votaciones, ni declaraciones, ni hallazgos',
    fetch: sirve({}),
    faltanAdrede: [CHUNK_URL],
    es: [
      `${PUNTOS} puntos en el orden del día · declaraciones sin extraer. ${AVISO_ES}`,
      '—',
      'sin transcribir',
    ],
    ca: [
      `${PUNTOS} punts en l’ordre del dia · declaracions sense extraure. ${AVISO_CA}`,
      '—',
      'sense transcriure',
    ],
  },
].map((e) => ({ ...e, ruta: `/plenos/${ID}`, pinta: laFicha, listo: (c) => lineaDe(c) !== null }))

describe('/plenos/:id · lo que la línea del resumen necesita del dato publicado', () => {
  it('la sesión de la revisión sigue publicada con su orden del día, de más de un punto', () => {
    expect(PLENOS.items.some((p) => p.id === ID)).toBe(true)
    expect(PUNTOS, `orden del día de ${ID}`).toBeGreaterThanOrEqual(2)
  })

  it('hay registros publicados para pintar el plural de cada pieza', () => {
    expect(APROBADAS.length).toBeGreaterThanOrEqual(2)
    expect(HALLAZGOS.items.length).toBeGreaterThanOrEqual(2)
    expect(SIN_DATOS.length).toBeGreaterThanOrEqual(3)
    expect(VERIFICADA?.verification?.verdict).toBe('verificado')
  })
})

describe('/plenos/:id · la línea del resumen dice qué cuenta, en castellano y en valencià', () => {
  it.each(ESCENARIOS)(
    '$nombre',
    async (escenario) => {
      const es = await pintaYLee(escenario, 'es', { lee: leeResumen('es') })
      const ca = await pintaYLee(escenario, 'ca', { lee: leeResumen('ca') })
      expect.soft(es.pedidasSinServir, 'la página pide datos que la prueba no sirve').toEqual([])
      expect.soft(es.piezas, 'castellano').toEqual(escenario.es)
      expect.soft(ca.piezas, 'valencià').toEqual(escenario.ca)
    },
    60000,
  )
})

/**
 * La sesión tal cual se publica: la de la revisión mientras tenga alguna votación
 * transcrita; si un día se le retirara, la primera que tenga. Las cifras salen del
 * dato y cambian con él; lo que se fija es cómo se dicen.
 */
const ID_PUBLICADA = VOTOS.items.some((v) => v.plenoId === ID) ? ID : VOTOS.items[0]?.plenoId

describe('/plenos/:id · la sesión de la revisión, tal cual se publica', () => {
  it('dice cuántas votaciones hemos TRANSCRITO, y que lo que no cuenta no es que no ocurriera', async () => {
    expect(ID_PUBLICADA, 'ninguna sesión tiene votaciones transcritas').toBeTruthy()
    const votos = VOTOS.items.filter((v) => v.plenoId === ID_PUBLICADA)
    const n = votos.length
    const m = votos.filter((v) => v.outcome === 'aprobado').length
    const puntos = AGENDAS.plenos.find((a) => a.id === ID_PUBLICADA)?.agenda.length
    expect(puntos, `orden del día de ${ID_PUBLICADA}`).toBeGreaterThanOrEqual(2)

    const fetch = {
      '/data/plenos.json': PLENOS,
      '/data/plenos-agendas.json': AGENDAS,
      '/data/pleno-votes.json': VOTOS,
      '/data/pleno-findings.json': HALLAZGOS,
      '/data/pleno-videos.json': VIDEOS,
    }
    const entrada = MANIFIESTO.plenos.find((p) => p.plenoId === ID_PUBLICADA)
    if (entrada) fetch[`/data/pleno-claims/${ID_PUBLICADA}.json`] = lee(entrada.chunkPath)
    const escenario = {
      nombre: `/plenos/${ID_PUBLICADA} publicada`,
      ruta: `/plenos/${ID_PUBLICADA}`,
      pinta: laFicha,
      fetch,
      faltanAdrede: entrada ? [] : [`/data/pleno-claims/${ID_PUBLICADA}.json`],
      listo: (c) => lineaDe(c) !== null,
    }

    const [lineaEs] = (await pintaYLee(escenario, 'es', { lee: leeResumen('es') })).piezas
    const [lineaCa] = (await pintaYLee(escenario, 'ca', { lee: leeResumen('ca') })).piezas

    const votosEs = `${n} ${n === 1 ? 'votación transcrita' : 'votaciones transcritas'} (${m} ${m === 1 ? 'aprobada' : 'aprobadas'})`
    const votosCa = `${n} ${n === 1 ? 'votació transcrita' : 'votacions transcrites'} (${m} ${m === 1 ? 'aprovada' : 'aprovades'})`
    expect.soft(lineaEs).toMatch(new RegExp(`^${puntos} puntos en el orden del día · `))
    expect.soft(lineaEs).toContain(` · ${votosEs} · `)
    expect.soft(lineaEs.endsWith(`. ${AVISO_ES}`), lineaEs).toBe(true)
    expect.soft(lineaCa).toMatch(new RegExp(`^${puntos} punts en l’ordre del dia · `))
    expect.soft(lineaCa).toContain(` · ${votosCa} · `)
    expect.soft(lineaCa.endsWith(`. ${AVISO_CA}`), lineaCa).toBe(true)
    expect
      .soft(detectorDeCastellano([]).castellanoEn(lineaCa), 'castellano en la línea')
      .toEqual([])
  }, 60000)
})
