// @ts-check
/**
 * Lo que el catálogo de /datos dice de cada fichero además de su recuento: qué
 * es una fila, con qué licencia o en qué condiciones se reutiliza, y qué código
 * lo escribe (auditoría de las dos lecturas, §22).
 *
 * La licencia, fichero a fichero:
 *
 *   · `propia` — lo que produce CivicPulse (curación, modelos, derivados, el
 *     canal de quejas) se publica con CC BY 4.0. Lo decidió el operador el
 *     22-11-2026, y lo dice /aviso-legal («Licencia de los datos»).
 *   · lo que viene de fuera conserva las condiciones de su fuente, las que ya
 *     enumera /aviso-legal: CC BY 4.0 (ICV/GVA), ODbL (OpenStreetMap), CC0
 *     (Wikidata) y, para el sector público español sin licencia propia
 *     declarada, la reutilización de la Ley 37/2007. No se le pone a una fuente
 *     una licencia Creative Commons que no ha publicado.
 *   · `prensa` — titulares y enlaces de cada medio: no son datos abiertos, y la
 *     fila no los ofrece como tales.
 *   · El texto de cada queja es de quien la escribe: el canal nunca pidió
 *     licenciarlo, y la fila de las quejas lo dice (`nota`).
 *
 * Que la licencia no contradiga a la fuente que pinta la misma fila lo comprueba
 * tests/catalogo-datos.test.js, leyendo la fuente del propio catálogo.
 *
 * `fila` y las etiquetas de licencia son claves del catálogo de textos (i18n):
 * son de la interfaz y se traducen. `codigo` es una ruta del repositorio; la
 * página la enlaza en GitHub.
 */

/**
 * @typedef {{ clave?: string, nombre?: string, url: string | null }} Licencia
 * @typedef {{ fila: string, licencia: keyof typeof LICENCIAS, codigo: string, nota?: string }} Ficha
 */

export const REPOSITORIO = 'https://github.com/datarhan/civicpulse/blob/main/'

/** @type {Record<string, Licencia>} */
export const LICENCIAS = {
  propia: {
    clave: 'datos.licencia.propia',
    url: 'https://creativecommons.org/licenses/by/4.0/deed.es',
  },
  'cc-by-4.0': { nombre: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/deed.es' },
  odbl: { nombre: 'ODbL 1.0', url: 'https://opendatacommons.org/licenses/odbl/1-0/' },
  cc0: { nombre: 'CC0 1.0', url: 'https://creativecommons.org/publicdomain/zero/1.0/deed.es' },
  'ley-37-2007': {
    clave: 'datos.licencia.ley37',
    url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2007-20555',
  },
  'ue-2011-833': {
    clave: 'datos.licencia.ue',
    url: 'https://eur-lex.europa.eu/eli/dec/2011/833/oj',
  },
  prensa: { clave: 'datos.licencia.prensa', url: null },
}

/** @type {Record<string, Ficha>} */
export const FICHAS = {
  '/data/officials.json': {
    fila: 'datos.fila.officials',
    licencia: 'ley-37-2007',
    codigo: 'scripts/scrape-officials.ts',
  },
  '/data/budget.json': {
    fila: 'datos.fila.budget',
    licencia: 'ley-37-2007',
    codigo: 'scripts/scrape-budget.ts',
  },
  '/data/tenders.json': {
    fila: 'datos.fila.tenders',
    licencia: 'ley-37-2007',
    codigo: 'scripts/scrape-tenders.ts',
  },
  '/data/bdns.json': {
    fila: 'datos.fila.bdns',
    licencia: 'ley-37-2007',
    codigo: 'scripts/scrape-bdns.ts',
  },
  '/data/plenos.json': {
    fila: 'datos.fila.plenos',
    licencia: 'ley-37-2007',
    codigo: 'scripts/scrape-plenos.ts',
  },
  '/data/plenos-agendas.json': {
    fila: 'datos.fila.plenos-agendas',
    licencia: 'ley-37-2007',
    codigo: 'scripts/scrape-pleno-agendas.ts',
  },
  '/data/empleo.json': {
    fila: 'datos.fila.empleo',
    licencia: 'ley-37-2007',
    codigo: 'scripts/scrape-empleo.ts',
  },
  '/data/press.json': {
    fila: 'datos.fila.press',
    licencia: 'prensa',
    codigo: 'scripts/scrape-press.ts',
  },
  '/data/participa.json': {
    fila: 'datos.fila.participa',
    licencia: 'ley-37-2007',
    codigo: 'scripts/scrape-participa.ts',
  },
  '/data/padron.json': {
    fila: 'datos.fila.padron',
    licencia: 'ley-37-2007',
    codigo: 'scripts/scrape-padron.ts',
  },
  '/data/paro.json': {
    fila: 'datos.fila.paro',
    licencia: 'ley-37-2007',
    codigo: 'scripts/scrape-paro.ts',
  },
  '/data/geo.json': { fila: 'datos.fila.geo', licencia: 'odbl', codigo: 'scripts/scrape-geo.ts' },
  '/data/wikidata.json': {
    fila: 'datos.fila.wikidata',
    licencia: 'cc0',
    codigo: 'scripts/scrape-wikidata.ts',
  },
  '/data/promises.json': {
    fila: 'datos.fila.promises',
    licencia: 'propia',
    codigo: 'src/scraper/promises.ts',
  },
  '/data/pleno-findings.json': {
    fila: 'datos.fila.pleno-findings',
    licencia: 'propia',
    codigo: 'src/scraper/pleno-finding.ts',
  },
  '/data/pleno-votes.json': {
    fila: 'datos.fila.pleno-votes',
    licencia: 'propia',
    codigo: 'src/scraper/pleno-votes.ts',
  },
  '/data/quejas.json': {
    fila: 'datos.fila.quejas',
    licencia: 'propia',
    codigo: 'bot/src/services/snapshot.ts',
    nota: 'datos.licencia.nota.quejas',
  },
  '/data/indicadores.json': {
    fila: 'datos.fila.indicadores',
    licencia: 'propia',
    codigo: 'scripts/compute-indicadores.ts',
  },
  '/data/coste-efectivo.json': {
    fila: 'datos.fila.coste-efectivo',
    licencia: 'ley-37-2007',
    codigo: 'scripts/scrape-coste-efectivo.ts',
  },
  '/data/pmp.json': {
    fila: 'datos.fila.pmp',
    licencia: 'ley-37-2007',
    codigo: 'scripts/scrape-pmp.ts',
  },
  '/data/deuda-viva.json': {
    fila: 'datos.fila.deuda-viva',
    licencia: 'ley-37-2007',
    codigo: 'scripts/scrape-deuda-viva.ts',
  },
  '/data/ipc.json': {
    fila: 'datos.fila.ipc',
    licencia: 'ley-37-2007',
    codigo: 'scripts/scrape-ipc.ts',
  },
  '/data/eficiencia-findings.json': {
    fila: 'datos.fila.eficiencia-findings',
    licencia: 'propia',
    codigo: 'src/scraper/eficiencia-finding.ts',
  },
  '/data/incendios.json': {
    fila: 'datos.fila.incendios',
    licencia: 'cc-by-4.0',
    codigo: 'scripts/scrape-incendios.ts',
  },
  '/data/reciclaje.json': {
    fila: 'datos.fila.reciclaje',
    licencia: 'cc-by-4.0',
    codigo: 'scripts/scrape-reciclaje.ts',
  },
  '/data/criminalidad.json': {
    fila: 'datos.fila.criminalidad',
    licencia: 'ley-37-2007',
    codigo: 'scripts/scrape-criminalidad.ts',
  },
  '/data/agua.json': {
    fila: 'datos.fila.agua',
    licencia: 'ley-37-2007',
    codigo: 'scripts/scrape-agua.ts',
  },
  '/data/agua-pares.json': {
    fila: 'datos.fila.agua-pares',
    licencia: 'ley-37-2007',
    codigo: 'scripts/scrape-agua-pares.ts',
  },
  '/data/agua-informe-anual.json': {
    fila: 'datos.fila.agua-informe-anual',
    licencia: 'ley-37-2007',
    codigo: 'scripts/scrape-agua-informe.ts',
  },
  '/data/bibliotecas.json': {
    fila: 'datos.fila.bibliotecas',
    licencia: 'ley-37-2007',
    codigo: 'scripts/scrape-bibliotecas.ts',
  },
  '/data/dea.json': {
    fila: 'datos.fila.dea',
    licencia: 'propia',
    codigo: 'scripts/compute-dea.ts',
  },
  '/data/coste-esperado.json': {
    fila: 'datos.fila.coste-esperado',
    licencia: 'propia',
    codigo: 'scripts/compute-coste-esperado.ts',
  },
  '/data/procesos-selectivos.json': {
    fila: 'datos.fila.procesos-selectivos',
    licencia: 'ley-37-2007',
    codigo: 'scripts/scrape-procesos-selectivos.ts',
  },
  '/data/asociaciones.json': {
    fila: 'datos.fila.asociaciones',
    licencia: 'ley-37-2007',
    codigo: 'scripts/scrape-asociaciones.ts',
  },
  '/data/obras.json': {
    fila: 'datos.fila.obras',
    licencia: 'ley-37-2007',
    codigo: 'scripts/scrape-obras.ts',
  },
  '/data/boe.json': {
    fila: 'datos.fila.boe',
    licencia: 'ley-37-2007',
    codigo: 'scripts/scrape-boe.ts',
  },
  '/data/bop.json': {
    fila: 'datos.fila.bop',
    licencia: 'ley-37-2007',
    codigo: 'scripts/scrape-bop.ts',
  },
  '/data/budget-execution.json': {
    fila: 'datos.fila.budget-execution',
    licencia: 'ley-37-2007',
    codigo: 'scripts/scrape-budget-execution.ts',
  },
  '/data/tenders-ted.json': {
    fila: 'datos.fila.tenders-ted',
    licencia: 'ue-2011-833',
    codigo: 'scripts/scrape-tenders-ted.ts',
  },
  '/data/elections.json': {
    fila: 'datos.fila.elections',
    licencia: 'ley-37-2007',
    codigo: 'scripts/scrape-elections.ts',
  },
  '/data/sindicatura.json': {
    fila: 'datos.fila.sindicatura',
    licencia: 'ley-37-2007',
    codigo: 'scripts/scrape-sindicatura.ts',
  },
  '/data/rendicion-cuentas.json': {
    fila: 'datos.fila.rendicion-cuentas',
    licencia: 'ley-37-2007',
    codigo: 'scripts/scrape-rendicion-cuentas.ts',
  },
  '/data/sindic-expedientes.json': {
    fila: 'datos.fila.sindic-expedientes',
    licencia: 'ley-37-2007',
    codigo: 'scripts/scrape-sindic-expedientes.ts',
  },
  '/data/ctbg.json': {
    fila: 'datos.fila.ctbg',
    licencia: 'ley-37-2007',
    codigo: 'scripts/scrape-ctbg.ts',
  },
  '/data/consell-cv.json': {
    fila: 'datos.fila.consell-cv',
    licencia: 'ley-37-2007',
    codigo: 'scripts/scrape-consell-cv.ts',
  },
  '/data/incendios-perimetros.json': {
    fila: 'datos.fila.incendios-perimetros',
    licencia: 'cc-by-4.0',
    codigo: 'scripts/scrape-incendios.ts',
  },
  '/data/civic-poi.json': {
    fila: 'datos.fila.civic-poi',
    licencia: 'odbl',
    codigo: 'scripts/scrape-civic-poi.ts',
  },
  '/data/streets.json': {
    fila: 'datos.fila.streets',
    licencia: 'odbl',
    codigo: 'scripts/scrape-streets.ts',
  },
}
