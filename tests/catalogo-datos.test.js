/**
 * El catálogo de /datos como tabla (auditoría de las dos lecturas, §22): por
 * cada fichero, qué es una fila, con qué licencia o en qué condiciones se
 * reutiliza, y qué código lo escribe. Hasta el 22-11-2026 era una rejilla de
 * fichas con el recuento, la fuente y la fecha; la licencia sólo salía dentro de
 * tres cadenas de fuente, y lo que produce CivicPulse no tenía ninguna declarada.
 *
 * Desde el 22-11-2026, lo que produce CivicPulse se publica con CC BY 4.0; lo que
 * viene de fuera conserva las condiciones de su fuente, como ya dice /aviso-legal;
 * y el texto de cada queja es de quien la escribe. La licencia de cada fichero
 * vive en `src/lib/catalogo-datos.js`, al lado de su fila y de su código.
 */
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { FICHAS, LICENCIAS } from '../src/lib/catalogo-datos'
import { CATALOGUE } from '../src/i18n'

const PAGINA = readFileSync(resolve('src/pages/Datos.jsx'), 'utf8')

/** Ruta → texto de su fuente, tal como lo pinta el catálogo. */
function fuentesDelCatalogo() {
  const out = new Map()
  const items = PAGINA.slice(
    PAGINA.indexOf('const items = ['),
    PAGINA.indexOf('...EXTRA_DATASETS.map'),
  )
  for (const m of items.matchAll(/source:\s*(?:'([^']*)'|`([^`]*)`)[\s\S]*?path:\s*'([^']+)'/g))
    out.set(m[3], m[1] ?? m[2])
  const extra = PAGINA.slice(PAGINA.indexOf('const EXTRA_DATASETS = ['))
  for (const m of extra.matchAll(/\[\s*'[^']+',\s*'(\/data\/[^']+)',\s*'([^']+)'/g))
    if (!out.has(m[1])) out.set(m[1], m[2])
  return out
}
const FUENTES = fuentesDelCatalogo()

describe('cada fichero del catálogo, con su ficha', () => {
  it('mide algo: el catálogo tiene decenas de ficheros', () => {
    expect(FUENTES.size).toBeGreaterThan(40)
  })

  it('cada fichero del catálogo tiene su ficha, y ninguna ficha sobra', () => {
    expect(Object.keys(FICHAS).sort()).toEqual([...FUENTES.keys()].sort())
  })

  it('cada ficha dice qué es una fila, en los dos idiomas y distinto en cada uno', () => {
    for (const [ruta, f] of Object.entries(FICHAS)) {
      expect(CATALOGUE.es[f.fila], `${ruta}: ${f.fila}`).toBeTruthy()
      expect(CATALOGUE.ca[f.fila], `${ruta}: ${f.fila}`).toBeTruthy()
      expect(CATALOGUE.ca[f.fila], ruta).not.toBe(CATALOGUE.es[f.fila])
    }
  })

  it('cada licencia es una de las conocidas, con su enlace salvo la de la prensa', () => {
    for (const [ruta, f] of Object.entries(FICHAS)) {
      const l = LICENCIAS[f.licencia]
      expect(l, `${ruta}: ${f.licencia}`).toBeTruthy()
      if (f.licencia !== 'prensa') expect(l.url, ruta).toMatch(/^https:\/\//)
      if (l.clave) {
        expect(CATALOGUE.es[l.clave], l.clave).toBeTruthy()
        expect(CATALOGUE.ca[l.clave], l.clave).toBeTruthy()
      } else expect(l.nombre, ruta).toBeTruthy()
    }
  })

  it('el código que se enlaza existe en el repositorio', () => {
    for (const [ruta, f] of Object.entries(FICHAS))
      expect(existsSync(resolve(f.codigo)), `${ruta}: ${f.codigo}`).toBe(true)
  })
})

describe('qué licencia lleva cada uno', () => {
  // Lo que produce CivicPulse se reconoce en la fuente que el propio catálogo
  // pinta: «curación», «modelo propio», «derivado» o el bot de quejas. Así la
  // licencia no puede contradecir a la fuente que se lee en la misma fila.
  const esPropia = (fuente) => /curaci[oó]n|modelo propio|derivado|Telegram bot/i.test(fuente)

  it('lo que produce CivicPulse lleva su CC BY 4.0, y sólo eso', () => {
    const propias = [...FUENTES].filter(([, fuente]) => esPropia(fuente)).map(([r]) => r)
    expect(propias.length).toBeGreaterThan(5)
    for (const [ruta, fuente] of FUENTES)
      expect(FICHAS[ruta]?.licencia === 'propia', `${ruta} · ${fuente}`).toBe(esPropia(fuente))
  })

  it('las fuentes con licencia propia la conservan', () => {
    for (const [ruta, fuente] of FUENTES) {
      if (/OpenStreetMap/.test(fuente)) expect(FICHAS[ruta].licencia, ruta).toBe('odbl')
      if (/wikidata/i.test(fuente)) expect(FICHAS[ruta].licencia, ruta).toBe('cc0')
      if (/CC BY 4\.0/.test(fuente)) expect(FICHAS[ruta].licencia, ruta).toBe('cc-by-4.0')
    }
  })

  it('la prensa no se ofrece como dato abierto', () => {
    expect(FICHAS['/data/press.json'].licencia).toBe('prensa')
  })

  // La lectura independiente del 22-11-2026: una queja publicada lleva también
  // la foto de quien la envía, y el canal nunca pidió licenciar ninguna de las dos.
  it('el texto y la foto de cada queja son de quien la envía, y la fila lo dice', () => {
    const q = FICHAS['/data/quejas.json']
    expect(q.licencia).toBe('propia')
    expect(CATALOGUE.es[q.nota]).toMatch(/texto y la foto de cada queja son de quien la envía/)
    expect(CATALOGUE.ca[q.nota]).toMatch(/text i la foto de cada queixa són de qui l’envia/)
  })
})

/*
 * Lo que vio la lectura independiente del 22-11-2026, comprobado contra los
 * ficheros y las fuentes antes de tocar nada.
 */
describe('lo que vio la lectura independiente', () => {
  /** La licencia que el propio fichero declara, si declara alguna. */
  const declarada = (ruta) => {
    const j = JSON.parse(readFileSync(resolve(`public${ruta}`), 'utf8'))
    return [
      j.license,
      j.licencia,
      j.source?.license,
      j.source?.licencia,
      j.fuente?.license,
      j.fuente?.licencia,
    ]
      .filter((x) => typeof x === 'string')
      .join(' ')
  }

  it('un fichero que declara CC BY 4.0 lleva CC BY 4.0, y mide algo', () => {
    const conCcBy = Object.keys(FICHAS).filter((r) => /CC[- ]?BY[- ]?4/.test(declarada(r)))
    // elections, incendios, incendios-perimetros y reciclaje lo declaraban el 22-11.
    expect(conCcBy.length).toBeGreaterThan(3)
    for (const r of conCcBy) expect(FICHAS[r].licencia, `${r} · ${declarada(r)}`).toBe('cc-by-4.0')
  })

  it('lo que sale del INE lleva CC BY 4.0, la licencia general de su aviso legal', () => {
    // ine.es/dyngs/AYU/index.htm?cid=125: «La licencia de uso general a aplicar a
    // la información estadística de este sitio web … es la Creative Commons
    // Reconocimiento 4.0 (CC BY 4.0)».
    const delIne = [...FUENTES].filter(([, f]) => /\bINE\b/.test(f)).map(([r]) => r)
    expect(delIne.length).toBeGreaterThan(1)
    for (const r of delIne) expect(FICHAS[r].licencia, r).toBe('cc-by-4.0')
  })

  it('la cita de cada promesa es de su fuente, y la fila lo dice', () => {
    const p = FICHAS['/data/promises.json']
    expect(CATALOGUE.es[p.nota]).toMatch(/cita de cada promesa es de su fuente/)
    expect(CATALOGUE.ca[p.nota]).toMatch(/cita de cada promesa és de la seua font/)
  })

  it('donde un fichero guarda una segunda lista de la misma cosa, la fila dice que va aparte', () => {
    // contratos y licitaciones; convocatorias y concesiones; los dos registros del
    // Síndic; y lo retirado, que se guarda al lado de lo publicado.
    for (const r of [
      '/data/tenders.json',
      '/data/bdns.json',
      '/data/sindic-expedientes.json',
      '/data/officials.json',
      '/data/pleno-findings.json',
      '/data/pleno-votes.json',
      '/data/promises.json',
    ]) {
      expect(CATALOGUE.es[FICHAS[r].fila], r).toMatch(/aparte/)
      expect(CATALOGUE.ca[FICHAS[r].fila], r).toMatch(/a banda/)
    }
  })

  it('la prensa: titulares de medios y de webs institucionales, y los derechos de quien los publica', () => {
    const prensa = JSON.parse(readFileSync(resolve('public/data/press.json'), 'utf8')).items
    // La premisa, medida: buena parte de los titulares no son de un medio.
    const institucionales = prensa.filter((x) =>
      /Ayuntamiento|GVA|Generalitat|Turisme/i.test(x.source ?? ''),
    )
    expect(institucionales.length).toBeGreaterThan(10)
    expect(CATALOGUE.es['datos.fila.press']).toMatch(/web institucional/)
    expect(CATALOGUE.es['datos.leyenda.prensa']).toMatch(/de quien los publica/)
    expect(CATALOGUE.es['datos.leyenda.prensa']).not.toMatch(/sólo se enlazan/)
  })

  it('el CTBG: resoluciones de ámbito estatal, no reclamaciones contra el Ayuntamiento', () => {
    expect(CATALOGUE.es['datos.fila.ctbg']).toMatch(/estatal/)
    expect(CATALOGUE.es['datos.fila.ctbg']).toMatch(/Consell de Transparència/)
  })

  it('la participación: publicaciones del portal, no sólo procesos', () => {
    const kinds = JSON.parse(readFileSync(resolve('public/data/participa.json'), 'utf8')).items.map(
      (x) => x.kind,
    )
    expect(new Set(kinds).size).toBeGreaterThan(1)
    expect(CATALOGUE.es['datos.fila.participa']).toMatch(/publicación/)
  })

  it('la ley de reutilización: la leyenda dice que la web del Ayuntamiento es más estricta', () => {
    // ribarroja.es/es/pagina/aviso-legal: «para su uso privado y sin ningún fin
    // comercial … salvo autorización específica y expresa».
    expect(CATALOGUE.es['datos.leyenda.ley37']).toMatch(/uso privado y sin fin comercial/)
    expect(CATALOGUE.ca['datos.leyenda.ley37']).toMatch(/ús privat i sense finalitat comercial/)
  })
})

describe('el contrato publicado lo dice', () => {
  const aviso = readFileSync(resolve('src/pages/AvisoLegal.jsx'), 'utf8')

  it('/aviso-legal declara la licencia de los datos de CivicPulse y la de las quejas', () => {
    expect(aviso).toMatch(/Licencia de los datos/)
    expect(aviso).toMatch(/CC BY 4\.0/)
    expect(aviso).toMatch(/texto y la foto de cada queja son de quien la envía/)
  })

  it('no promete la licencia de todo fichero: la tabla dice la de los de su catálogo', () => {
    expect(aviso).not.toMatch(/fichero a fichero/)
    expect(aviso).toMatch(/cada fichero de su catálogo/)
  })

  it('la lista de fuentes dice la licencia del INE', () => {
    // El código fuente puede partir la línea entre «INE» y su licencia.
    expect(aviso).toMatch(/INE\s+\(CC BY 4\.0\)/)
  })

  // La revisión del plan del 22-11-2026 vio dos cosas en lo que dejó #573. La
  // tarjeta de la licencia entró delante de «Cómo pedir una corrección», que es
  // a la que llevan todos los enlaces de réplica del sitio y bajó de tercera a
  // cuarta. Y la tarjeta remite a «las que se enumeran arriba», una lista que
  // empezaba por «Todos los datos… de fuentes públicas o de datos abiertos»
  // (la prensa y las quejas no lo son), citaba una «CC-BY 4.0 datos.gob.es» de
  // la que no sale ningún fichero y una ley de transparencia como si fuera una
  // licencia, y no nombraba la Ley 37/2007 de 28 ficheros del catálogo.
  const tarjetas = [...aviso.matchAll(/<Card\b[^>]*>\s*<SectionHead[^>]*title="([^"]+)"/g)].map(
    (m) => m[1],
  )
  const desdeFuentes = aviso.indexOf('title="De dónde salen los datos"')
  const fuentes = aviso.slice(desdeFuentes, aviso.indexOf('<Card', desdeFuentes))

  it('mide algo: lee las tarjetas y la de las fuentes', () => {
    expect(tarjetas.length).toBeGreaterThan(5)
    expect(fuentes.length).toBeGreaterThan(200)
  })

  it('«Cómo pedir una corrección» sigue siendo la tercera tarjeta, antes de la licencia', () => {
    expect(tarjetas[2]).toBe('Cómo pedir una corrección')
    expect(tarjetas.indexOf('Licencia de los datos')).toBeGreaterThan(2)
  })

  it('la lista de fuentes no dice «todos», ni una fuente de la que no sale nada', () => {
    expect(fuentes).not.toMatch(/Todos los datos/)
    expect(fuentes).not.toMatch(/datos\.gob\.es/)
    expect(fuentes).not.toMatch(/Transparencia Act/)
    expect(fuentes).toMatch(/prensa/)
    expect(fuentes).toMatch(/quejas/)
  })

  it('nombra cada licencia de fuera que usa el catálogo, y lo estricta que es la web del Ayuntamiento', () => {
    const usadas = new Set(Object.values(FICHAS).map((f) => f.licencia))
    const nombre = {
      'ley-37-2007': /Ley 37\/2007/,
      'cc-by-4.0': /CC BY 4\.0/,
      odbl: /ODbL/,
      cc0: /CC0/,
      'ue-2011-833': /Decisión 2011\/833\/UE/,
    }
    const fuera = [...usadas].filter((l) => l !== 'propia' && l !== 'prensa')
    expect(fuera.length).toBeGreaterThan(3)
    for (const l of fuera) {
      expect(nombre[l], `licencia sin nombre en la prueba: ${l}`).toBeDefined()
      expect(fuentes, l).toMatch(nombre[l])
    }
    expect(fuentes).toMatch(/uso privado y sin fin comercial/)
  })

  // Lo vio la lectura independiente del cambio: el catálogo no recoge todas las
  // fuentes (Open-Meteo, el GTFS de FGV), el padrón sale del CSV del INE y no de
  // su API JSON, y una queja no enlaza a ningún registro ni a ninguna noticia.
  it('no llama «listado completo» al catálogo ni da el padrón por la API JSON del INE', () => {
    expect(fuentes).not.toMatch(/listado completo/)
    expect(fuentes).not.toMatch(/API JSON del INE/)
    expect(fuentes).not.toMatch(/Cada dato individual enlaza/)
  })

  it('las fuentes con licencia abierta se citan con la atribución que exigen', () => {
    expect(fuentes).toMatch(/licencia abierta[^.]*atribución/)
  })
})
