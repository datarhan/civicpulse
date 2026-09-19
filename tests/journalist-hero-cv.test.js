import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { heroCvUrl, RETIRED_CV_INDEX_RE } from '../src/lib/journalist-facts.js'

/**
 * El botón «CV oficial ↗» de la cabecera de una biografía salía de
 * `portrait.cvUrl`, que es una foto del padrón del día en que corrió el agente.
 * Las 21 biografías publicadas llevaban la MISMA url: el índice agregado del
 * portal de transparencia. El Ayuntamiento lo retiró en la mudanza de septiembre
 * de 2026 y desde entonces contesta 403 «Acceso denegado», también en un
 * navegador (medido el 19-09-2026). Resultado: 21 páginas con un botón muerto,
 * y ningún test miraba adónde apuntaba.
 *
 * `/cargos/:slug` ya prefería el `cvUrl` vigente del padrón (el PDF de cada
 * concejal); la cabecera de la biografía no. La regla, una sola para las dos:
 * el documento vigente del padrón; si no lo hay, el enlace congelado del
 * informe — salvo que sea el índice retirado, que no es un enlace sino un 403.
 * Sin enlace que funcione no hay botón: un centinela nunca es un valor.
 */
const INDICE_RETIRADO =
  'https://www.ribarroja.es/es/portal_de_transparencia/informacion_sobre_la_corporacion_municipal/datos_biograficos_del_alcalde_sa_y_concejales/contenidos/864708/0835919'
const PDF_VIGENTE =
  'https://www.ribarroja.es/sites/www.ribarroja.es/files/20260723%20Robert%20Raga_0.pdf'

const roster = {
  officials: [
    { slug: 'robert-raga-gadea', cvUrl: PDF_VIGENTE },
    { slug: 'juan-boix-martinez', cvUrl: null },
  ],
  formerOfficials: [{ slug: 'soraya-trejo-delgado', cvUrl: INDICE_RETIRADO }],
}

describe('heroCvUrl — a qué documento lleva «CV oficial» en la cabecera', () => {
  it('prefiere el documento vigente del padrón al enlace congelado del informe', () => {
    expect(
      heroCvUrl({ portraitCvUrl: INDICE_RETIRADO, officialSlug: 'robert-raga-gadea', roster }),
    ).toBe(PDF_VIGENTE)
  })

  it('no ofrece el índice retirado cuando el Ayuntamiento no publica CV de ese escaño', () => {
    expect(
      heroCvUrl({ portraitCvUrl: INDICE_RETIRADO, officialSlug: 'juan-boix-martinez', roster }),
    ).toBeNull()
  })

  it('no toma el enlace de una fila de excargos: es el mismo índice retirado', () => {
    expect(
      heroCvUrl({ portraitCvUrl: INDICE_RETIRADO, officialSlug: 'soraya-trejo-delgado', roster }),
    ).toBeNull()
  })

  it('conserva un enlace congelado que SÍ es un documento cuando la persona ya no está en el padrón', () => {
    const pdfDeEntonces =
      'https://www.ribarroja.es/sites/www.ribarroja.es/files/CV%20de%20entonces.pdf'
    expect(heroCvUrl({ portraitCvUrl: pdfDeEntonces, officialSlug: 'ya-no-esta', roster })).toBe(
      pdfDeEntonces,
    )
  })

  it('sin padrón cargado cae al enlace congelado, salvo que sea el índice retirado', () => {
    const pdf = 'https://www.ribarroja.es/sites/www.ribarroja.es/files/otro.pdf'
    expect(
      heroCvUrl({ portraitCvUrl: pdf, officialSlug: 'robert-raga-gadea', roster: undefined }),
    ).toBe(pdf)
    expect(
      heroCvUrl({
        portraitCvUrl: INDICE_RETIRADO,
        officialSlug: 'robert-raga-gadea',
        roster: undefined,
      }),
    ).toBeNull()
  })

  it('sin nada que enlazar devuelve null, no una cadena vacía', () => {
    expect(heroCvUrl({ portraitCvUrl: undefined, officialSlug: 'x', roster })).toBeNull()
    expect(heroCvUrl({ portraitCvUrl: '', officialSlug: 'x', roster })).toBeNull()
  })
})

describe('heroCvUrl sobre lo PUBLICADO — que la guarda mida algo', () => {
  const dir = resolve(__dirname, '../public/data/journalist-reports')
  const padron = JSON.parse(
    readFileSync(resolve(__dirname, '../public/data/officials.json'), 'utf8'),
  )
  const retratos = readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(resolve(dir, f), 'utf8')))
    .map((r) => ({ id: r.assignmentId, p: r.sections.find((s) => s.kind === 'portrait')?.payload }))
    .filter((x) => x.p?.officialSlug)

  it('ninguna cabecera publicada enlaza el índice retirado', () => {
    // Que la guarda mida algo: tiene que haber retratos que evaluar.
    expect(retratos.length).toBeGreaterThan(0)
    const muertas = retratos
      .map((x) => ({
        id: x.id,
        url: heroCvUrl({
          portraitCvUrl: x.p.cvUrl,
          officialSlug: x.p.officialSlug,
          roster: padron,
        }),
      }))
      .filter((x) => x.url && RETIRED_CV_INDEX_RE.test(x.url))
    expect(muertas).toEqual([])
  })

  it('quien tiene PDF propio en el padrón lo recibe en su cabecera', () => {
    const conPdf = padron.officials.filter((o) => o.cvUrl && !RETIRED_CV_INDEX_RE.test(o.cvUrl))
    expect(conPdf.length).toBeGreaterThan(0)
    let comprobadas = 0
    for (const o of conPdf) {
      const retrato = retratos.find((x) => x.p.officialSlug === o.slug)
      if (!retrato) continue
      comprobadas++
      expect(
        heroCvUrl({ portraitCvUrl: retrato.p.cvUrl, officialSlug: o.slug, roster: padron }),
      ).toBe(o.cvUrl)
    }
    // Sin este recuento el bucle podía no comparar NADA y el test quedarse verde.
    expect(comprobadas).toBeGreaterThan(0)
  })
})
