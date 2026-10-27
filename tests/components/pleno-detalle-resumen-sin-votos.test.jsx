/**
 * El resumen de /plenos/:id dice lo que SÍ sabemos de una sesión sin votaciones
 * transcritas.
 *
 * El 26-10-2026 el operador abrió /plenos/zrbgic, el ordinario del 5 de octubre, y
 * leyó que la pestaña Resumen «no muestra datos». No estaba en blanco: pintaba la
 * línea de cifras —que repite las cuatro fichas de encima— y la barra de
 * declaraciones, gris de punta a punta (ninguna cotejada, todas sin contraste). De la
 * sesión en sí, nada. El resumen se hacía sólo con las tres capas que hay que curar
 * —votaciones transcritas, veredictos de las declaraciones, hallazgos— y ese día
 * tenían votaciones 7 sesiones de 63; la única capa que tienen todas, el orden del
 * día, se quedaba en un número. Sin votaciones, su bloque desaparecía sin decir por
 * qué: «sin transcribir» sólo estaba en la ficha de arriba y en la pestaña de
 * Votaciones, que no se monta hasta pulsarla.
 *
 * La revisión lectora no podía verlo: de una ruta con parámetro lee UNA ficha, la
 * que más rellena la plantilla (`scripts/lib/fichas-representativas.ts`), y ésa
 * tiene votaciones.
 *
 * Ahora el resumen lista los puntos del orden del día y el bloque de votaciones está
 * siempre: con alguna transcrita, cada una; sin ninguna, la frase que dice qué falta
 * y que faltar no es que no se votara. Las tres formas se leen sobre sesiones
 * publicadas: la del aviso, una sin declaraciones extraídas —la que antes caía en la
 * nota de «nada»— y una con votaciones. Las frases esperadas están escritas a mano,
 * en los dos idiomas.
 *
 * Desde el 27-10-2026 (auditoría de las dos lecturas, §10) los puntos se leen en
 * palabras llanas (`etiquetaDelPunto`): el título sin área, expediente ni fórmula,
 * en la lengua en que se convocó. El literal sigue en su `title` y en la pestaña del
 * orden del día. Los ruegos y preguntas no se listan: la frase del orden del día los
 * nombra. La barra de resultados se fue con el resumen viejo; las votaciones son
 * ahora una lista con su resultado, en su tarjeta.
 */
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { Route, Routes } from 'react-router-dom'

import PlenoDetalle from '../../src/pages/PlenoDetalle'
import { etiquetaDelPunto } from '../../src/scraper/etiqueta-llana'
import { pintaYLee } from '../setup/pinta-y-lee'

const lee = (f) => JSON.parse(readFileSync(`public/data/${f}`, 'utf8'))
const PLENOS = lee('plenos.json')
const AGENDAS = lee('plenos-agendas.json')
const VOTOS = lee('pleno-votes.json')
const HALLAZGOS = lee('pleno-findings.json')
const VIDEOS = lee('pleno-videos.json')
const VIDEOS_REGMEET = lee('pleno-videos-regmeet.json')
const MANIFIESTO = lee('pleno-claims/index.json')

const conVotos = (id) => VOTOS.items.some((v) => v.plenoId === id)
const trozoDe = (id) => MANIFIESTO.plenos.find((p) => p.plenoId === id)
const agendaDe = (id) => AGENDAS.plenos.find((a) => a.id === id)?.agenda ?? []

/**
 * La sesión del aviso mientras siga sin votaciones transcritas; si un día se le
 * transcriben, la primera del manifiesto con orden del día, declaraciones y ninguna
 * votación. Es la forma de zrbgic, no zrbgic, lo que se fija.
 */
const SIN_VOTOS = [
  'zrbgic',
  ...MANIFIESTO.plenos.map((p) => p.plenoId).filter((id) => id !== 'zrbgic'),
].find((id) => !conVotos(id) && trozoDe(id) && agendaDe(id).length >= 2)

/** Sin votaciones ni declaraciones extraídas: antes, la nota de «nada» y poco más. */
const SIN_NADA = AGENDAS.plenos.find(
  (a) =>
    !conVotos(a.id) &&
    !trozoDe(a.id) &&
    !existsSync(`public/data/pleno-claims/${a.id}.json`) &&
    a.agenda.length >= 2,
)?.id

/** Con votaciones transcritas, alguna aprobada: lo de antes sigue en su sitio. */
const CON_VOTOS = AGENDAS.plenos.find(
  (a) =>
    VOTOS.items.some((v) => v.plenoId === a.id && v.outcome === 'aprobado') && a.agenda.length >= 2,
)?.id

/**
 * Sin «del acta»: la frase decía «las votaciones del acta de esta sesión», y ni el
 * resultado sale del acta —sale de la sesión en regmeet, y el desglose de nuestra
 * transcripción del audio (`provenance` en pleno-votes.json)— ni el acta existe
 * todavía para las sesiones más recientes: zrbgic no está en pleno-actas.json.
 */
const PENDIENTE = {
  es: 'Todavía no hemos transcrito las votaciones de esta sesión. No significa que no las hubiera.',
  ca: "Encara no hem transcrit les votacions d'aquesta sessió. No vol dir que no n'hi haguera.",
}
/** Los rótulos de cada resultado, escritos a mano en los dos idiomas. */
const APROBADO = {
  es: { aprobado: 'Aprobado', rechazado: 'Rechazado', retirado: 'Retirado', aplazado: 'Aplazado' },
  ca: { aprobado: 'Aprovat', rechazado: 'Rebutjat', retirado: 'Retirat', aplazado: 'Ajornat' },
}

/** Los ficheros de la página, tal cual se publican, y el trozo de la sesión si lo tiene. */
function escenarioDe(id, nombre) {
  const fetch = {
    '/data/plenos.json': PLENOS,
    '/data/plenos-agendas.json': AGENDAS,
    '/data/pleno-votes.json': VOTOS,
    '/data/pleno-findings.json': HALLAZGOS,
    '/data/pleno-videos.json': VIDEOS,
    '/data/pleno-videos-regmeet.json': VIDEOS_REGMEET,
  }
  const trozo = trozoDe(id)
  const url = `/data/pleno-claims/${id}.json`
  if (trozo) fetch[url] = lee(trozo.chunkPath)
  return {
    nombre: `${nombre} (/plenos/${id})`,
    ruta: `/plenos/${id}`,
    fetch,
    faltanAdrede: trozo ? [] : [url],
    pinta: () => (
      <Routes>
        <Route path="/plenos/:id" element={<PlenoDetalle />} />
      </Routes>
    ),
    // La tarjeta de votaciones ya está: llegaron el orden del día y las votaciones.
    listo: (c) => c.querySelector('[data-en-breve="votaciones"]') !== null,
  }
}

/** Los puntos que el resumen lista: todos menos el turno de ruegos y preguntas. */
const listablesDe = (id) => agendaDe(id).filter((p) => p.section !== 'ruegos')

/**
 * Lo que se lee del resumen, que es la única pestaña montada al cargar: cuántos
 * puntos del orden del día pinta en palabras llanas, si dice que las votaciones
 * están sin transcribir, cuántas votaciones lista con su resultado y si en algún
 * sitio dice «0 votaciones».
 */
const leeResumen = (id, idioma) => (c) => {
  const texto = c.textContent
  const puntos = listablesDe(id)
  const orden = c.querySelector('[data-en-breve="orden-del-dia"]')
  const pintados = puntos.filter((p) =>
    [...orden.querySelectorAll('li [title]')].some(
      (el) =>
        el.getAttribute('title') === p.title && el.textContent === etiquetaDelPunto(p.title).texto,
    ),
  ).length
  const votos = [...c.querySelectorAll('[data-en-breve="votaciones"] li')]
  const conResultado = votos.filter((li) =>
    Object.values(APROBADO[idioma]).some((r) => li.textContent.includes(r)),
  ).length
  return [
    `puntos ${pintados} de ${puntos.length}`,
    `sin transcribir: ${texto.includes(PENDIENTE[idioma])}`,
    `votaciones listadas con su resultado: ${conResultado} de ${votos.length}`,
    `«0 votaciones»: ${/\b0 vota(ciones|cions)\b/.test(texto)}`,
  ]
}

describe('/plenos/:id · las sesiones que la prueba necesita siguen publicadas', () => {
  it('una sin votaciones con declaraciones, una sin nada y una con votaciones', () => {
    expect(SIN_VOTOS, 'sesión con orden del día y declaraciones, sin votaciones').toBeTruthy()
    expect(SIN_NADA, 'sesión con orden del día, sin votaciones ni declaraciones').toBeTruthy()
    expect(CON_VOTOS, 'sesión con alguna votación aprobada transcrita').toBeTruthy()
  })
})

describe('/plenos/:id · el resumen dice lo que sabemos de la sesión, en castellano y en valencià', () => {
  const CASOS = [
    { id: SIN_VOTOS, nombre: 'sin votaciones transcritas, con declaraciones', votos: false },
    { id: SIN_NADA, nombre: 'sin votaciones ni declaraciones extraídas', votos: false },
    { id: CON_VOTOS, nombre: 'con votaciones transcritas', votos: true },
  ]

  it.each(CASOS)(
    '$nombre: lista el orden del día y dice qué pasa con las votaciones',
    async ({ id, nombre, votos }) => {
      const escenario = escenarioDe(id, nombre)
      const n = listablesDe(id).length
      const v = VOTOS.items.filter((x) => x.plenoId === id).length
      expect(n, 'puntos que listar').toBeGreaterThan(0)
      for (const idioma of ['es', 'ca']) {
        const { piezas, pedidasSinServir } = await pintaYLee(escenario, idioma, {
          lee: leeResumen(id, idioma),
        })
        expect.soft(pedidasSinServir, `${idioma}: pide datos sin servir`).toEqual([])
        expect
          .soft(piezas, idioma)
          .toEqual([
            `puntos ${n} de ${n}`,
            `sin transcribir: ${!votos}`,
            `votaciones listadas con su resultado: ${v} de ${v}`,
            '«0 votaciones»: false',
          ])
      }
    },
    60000,
  )
})
