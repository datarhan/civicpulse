/**
 * Los títulos enteros de los procesos selectivos (/empleo-publico).
 *
 * La página del Ayuntamiento que lista los procesos corta el texto de cada
 * enlace a 80 caracteres y le pone «…»: el 29-10-2026, diez de dieciocho. La
 * página de cada proceso trae su título entero en `og:title`. Estas pruebas
 * leen páginas reales de las cuatro plantillas del portal (`/pagina/`,
 * `/noticia/`, `/tablon_de_anuncios/…` y su variante con guiones bajos) y la
 * lista del mismo día.
 *
 * El título de la página no siempre es el del enlace con el final que le
 * faltaba: el de la bolsa de ayudante de auditorio está redactado de otra
 * manera. Por eso la comprobación no compara prefijos sino palabras, y sólo
 * puede DEJAR el título cortado, nunca poner otro. No elige entre procesos —
 * los títulos de este portal son de fórmula y dos procesos distintos comparten
 * casi todas sus palabras—: qué proceso es lo dice la URL del enlace. Sólo
 * rechaza una página cuyo título habla de otra cosa.
 *
 * Y la lista vacía no se publica: un cambio de maquetación que deja el parser
 * sin enlaces daría «No hay procesos selectivos publicados ahora mismo», un
 * cero que no se midió.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  parseProcesosList,
  estaCortado,
  tituloDePagina,
  completaTitulo,
  exigeProcesos,
  RESULTADOS_TITULO,
  type ProcesoSelectivo,
} from '../src/scraper/procesos-selectivos'

const fx = (f: string) => readFileSync(join(__dirname, 'fixtures', f), 'utf8')
const lista = parseProcesosList(fx('procesos-selectivos_2026-10-29.html'))

/** La fila de la lista cuyo enlace lleva a la página de la fixture. */
const fila = (trozoDeUrl: string): ProcesoSelectivo => {
  const f = lista.find((p) => p.url.includes(trozoDeUrl))
  if (!f) throw new Error(`la lista del 29-10 no enlaza a ${trozoDeUrl}`)
  return f
}

const PAGINAS = {
  // /es/pagina/…: el título entero empieza por el texto cortado.
  c1: {
    html: fx('procesos-selectivos-pagina_administrativo-c1_2026-10-29.html'),
    url: 'administrativo-de-administraci',
    titulo:
      'Proceso selectivo para provisión en propiedad de 1 plaza de administrativo de administración general, pertenecientes al grupo C1 mediante promoción interna restringida',
  },
  // /es/tablon_de_anuncios/…: redactado de otra manera que el enlace.
  auditorio: {
    html: fx('procesos-selectivos-pagina_ayudante-auditorio_2026-10-29.html'),
    url: 'ayudante_de_auditorio',
    titulo: 'Bolsa de trabajo cobertura temporal ayudante de auditorio, concurso-oposición',
  },
  // /es/noticia/…: el enlace de la lista ya era entero.
  auxiliar: {
    html: fx('procesos-selectivos-pagina_auxiliar-a-administrativo_2026-10-29.html'),
    url: 'restringida-11-plazas',
    titulo:
      'Proceso selectivo promoción interna restringida 11 plazas de auxiliar administrativo a administrativo',
  },
  // Variante del tablón con guiones bajos; la página titula en valenciano.
  epa: {
    html: fx('procesos-selectivos-pagina_profesor-epa_2026-10-29.html'),
    url: 'bolsa_profesor_a_epa',
    titulo: 'Procés selectiu borsa professor/a EPA',
  },
}

describe('procesos selectivos · la lista corta los títulos', () => {
  it('premisa: la lista del 29-10 trae títulos cortados con «…» y otros enteros', () => {
    const cortados = lista.filter((p) => estaCortado(p.titulo))
    expect(cortados.length).toBeGreaterThan(0)
    expect(cortados.length).toBeLessThan(lista.length)
    for (const p of cortados) expect(p.titulo).toMatch(/…$/)
  })

  it('cada fila sale de la lista con su procedencia', () => {
    for (const p of lista) expect(p.tituloDe).toBe('listado')
  })
})

describe('procesos selectivos · el título de la página de cada proceso', () => {
  for (const [nombre, pagina] of Object.entries(PAGINAS)) {
    it(`${nombre}: lee og:title tal cual`, () => {
      expect(tituloDePagina(pagina.html)).toBe(pagina.titulo)
    })
  }

  it('sin og:title, el <title> sin el nombre del sitio', () => {
    const sinOg = PAGINAS.c1.html.replace(/<meta[^>]+property="og:title"[^>]*>/g, '')
    expect(sinOg).not.toContain('og:title')
    expect(tituloDePagina(sinOg)).toBe(PAGINAS.c1.titulo)
  })

  it('el nombre del sitio solo no es un título', () => {
    expect(tituloDePagina('<title>Ayuntamiento de Riba-roja de Túria</title>')).toBeNull()
    expect(tituloDePagina('<html></html>')).toBeNull()
  })
})

describe('procesos selectivos · completar el título', () => {
  it('el enlace cortado toma el título entero de su página', () => {
    const r = completaTitulo(fila(PAGINAS.c1.url), tituloDePagina(PAGINAS.c1.html))
    expect(r.resultado).toBe('completado')
    expect(r.proceso.titulo).toBe(PAGINAS.c1.titulo)
    expect(r.proceso.tituloDe).toBe('pagina')
  })

  it('aunque la página lo redacte de otra manera, si es el mismo proceso', () => {
    const antes = fila(PAGINAS.auditorio.url)
    expect(estaCortado(antes.titulo)).toBe(true)
    expect(antes.titulo.startsWith(PAGINAS.auditorio.titulo.slice(0, 30))).toBe(false)
    const r = completaTitulo(antes, tituloDePagina(PAGINAS.auditorio.html))
    expect(r.resultado).toBe('completado')
    expect(r.proceso.titulo).toBe(PAGINAS.auditorio.titulo)
  })

  it('un enlace entero se queda como está, aunque la página diga otra cosa', () => {
    const entero = fila(PAGINAS.epa.url)
    expect(estaCortado(entero.titulo)).toBe(false)
    const r = completaTitulo(entero, tituloDePagina(PAGINAS.epa.html))
    expect(r.resultado).toBe('entero')
    expect(r.proceso).toEqual(entero)
  })

  it('un título que habla de otra cosa no casa: se queda el cortado', () => {
    const c1 = fila(PAGINAS.c1.url)
    for (const otro of ['Página no encontrada', tituloDePagina(PAGINAS.auditorio.html)]) {
      const r = completaTitulo(c1, otro)
      expect(r.resultado, String(otro)).toBe('no-casa')
      expect(r.proceso).toEqual(c1)
    }
  })

  it('su límite, dicho: no distingue dos procesos de títulos de fórmula', () => {
    // El enlace de los 11 auxiliares contra el título de las 18 técnicas de
    // educación infantil: comparten casi todo y pasaría. Por eso la identidad
    // la da la URL, y esta comprobación no se vende como otra cosa.
    const r = completaTitulo(
      {
        ...fila(PAGINAS.auxiliar.url),
        titulo: 'Proceso selectivo promoción interna restringida 11 plazas de auxiliar administr…',
      },
      'Proceso selectivo promoción interna restringida 18 plazas técnico/a superior educación infantil',
    )
    expect(r.resultado).toBe('completado')
  })

  it('sin título en la página: se queda el cortado', () => {
    const c1 = fila(PAGINAS.c1.url)
    const r = completaTitulo(c1, null)
    expect(r.resultado).toBe('sin-titulo')
    expect(r.proceso).toEqual(c1)
  })

  it('un título de página también cortado no completa nada', () => {
    const c1 = fila(PAGINAS.c1.url)
    const r = completaTitulo(c1, `${PAGINAS.c1.titulo.slice(0, 90)}…`)
    expect(r.resultado).toBe('sin-titulo')
    expect(r.proceso).toEqual(c1)
  })

  it('el tipo se vuelve a clasificar con el título entero', () => {
    const c1 = fila(PAGINAS.c1.url)
    const r = completaTitulo({ ...c1, tipo: 'otro' }, tituloDePagina(PAGINAS.c1.html))
    expect(r.proceso.tipo).toBe('oposicion')
  })

  it('los resultados son los del enum exportado', () => {
    const vistos = new Set([
      completaTitulo(fila(PAGINAS.c1.url), PAGINAS.c1.titulo).resultado,
      completaTitulo(fila(PAGINAS.epa.url), null).resultado,
      completaTitulo(fila(PAGINAS.c1.url), PAGINAS.auditorio.titulo).resultado,
      completaTitulo(fila(PAGINAS.c1.url), null).resultado,
    ])
    for (const v of vistos) expect(RESULTADOS_TITULO).toContain(v)
    expect(vistos.size).toBe(4)
  })
})

describe('procesos selectivos · la lista vacía no se publica', () => {
  it('una lista sin procesos para el raspado', () => {
    expect(() => exigeProcesos([])).toThrow(/ningún proceso/)
  })

  it('el caso real: una maquetación nueva deja el parser sin enlaces', () => {
    const vacia = parseProcesosList('<html><body><main><p>Página en obras</p></main></body></html>')
    expect(vacia).toEqual([])
    expect(() => exigeProcesos(vacia)).toThrow(/ningún proceso/)
  })

  it('con procesos, los devuelve tal cual', () => {
    expect(exigeProcesos(lista)).toBe(lista)
  })
})
