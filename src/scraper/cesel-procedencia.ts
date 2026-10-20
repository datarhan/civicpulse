/**
 * De qué documento del ministerio sale cada entrega del coste efectivo, y en
 * qué celda de ese documento está cada cifra.
 *
 * POR QUÉ EXISTE
 *
 * Hasta el 2026-10-19 las quince fichas de /eficiencia citaban
 * `cesel-2021.xlsx` —el volcado nacional, la única entrega que el ministerio
 * publica entera— con «entrega 2024» al lado y una celda
 * «CE2:a1621:Econ14». La cifra de 2024 no está en ese fichero: sale del
 * informe por comunidad autónoma, que tiene otras hojas, otras columnas y el
 * programa escrito sin la letra de la variante. Un lector que seguía el
 * enlace encontraba 801.040,17 € (2021) donde la ficha decía 740.272,16 €
 * (2024). La cita existía y no resolvía: en un sitio cuyo contrato es que toda
 * afirmación lleva su fuente, es la misma avería que una cita textual que no
 * está en el acta que dice citar.
 *
 * La forma de la celda depende del DOCUMENTO, no del año, y qué documento dio
 * cada año lo sabe sólo quien lo leyó: scripts/scrape-coste-efectivo.ts lo
 * escribe en `source.entregas` de coste-efectivo.json. Aquí se traduce a lo
 * que un lector necesita para encontrar la cifra a mano.
 *
 * La clave interna de cada magnitud (`cesel:2024:CE2:a1621:Econ14`) NO cambia:
 * es la dirección de la cifra dentro de coste-efectivo.json, la que comprueban
 * `check:indicadores` y `check:eficiencia-findings` y la que llevan congelada
 * las fichas firmadas. Lo que cambia es que ya no se enseña como si fuera la
 * celda del documento del ministerio.
 *
 * Módulo puro y sin SheetJS: lo lee también la ficha en el navegador.
 */

export const DOCUMENTOS_CESEL = ['volcado-nacional', 'informe-ccaa', 'informe-ente'] as const
export type DocumentoCesel = (typeof DOCUMENTOS_CESEL)[number]

/** El documento del que salió una entrega, tal como lo anota el adaptador. */
export interface OrigenEntrega {
  documento: DocumentoCesel
  url: string
  /** Comunidad autónoma del informe por comunidad (17 = Comunitat Valenciana). */
  ccaa?: number
}

/** Dónde encuentra un lector las dos mitades del cociente. */
export interface Procedencia {
  /** El documento, en palabras, con cómo llegar a él si no es un enlace directo. */
  documento: string
  url: string
  /** Hoja, fila y columna del coste. */
  coste: string
  /** Hoja, fila y columna de la unidad física. */
  unidad: string
}

const CCAA: Record<number, string> = { 17: 'la Comunitat Valenciana' }

/**
 * La procedencia de las dos cifras de un servicio en una entrega.
 *
 * @param programa  el programa como lo guarda el snapshot, con la letra de la
 *                  variante (`a1621`, `b132/130P`). El volcado lo escribe así;
 *                  los informes, sin la letra y en la hoja de esa variante.
 * @param ente      el código de ente del municipio (`17-46-214-AA-000`).
 */
export function procedenciaCesel(
  anio: number,
  origen: OrigenEntrega,
  { programa, atributo, ente }: { programa: string; atributo: string; ente: string },
): Procedencia {
  if (origen.documento === 'volcado-nacional') {
    return {
      documento: `Volcado nacional del ministerio, ejercicio ${anio}`,
      url: origen.url,
      coste: `hoja «${anio} CE2» · fila con Ente ${ente} y Programa ${programa} · columna Econ14`,
      unidad:
        `hoja «${anio} CE3» · fila con Ente ${ente}, Programa ${programa} y Atributo ` +
        `«${atributo}» · columna Valor`,
    }
  }

  // Los informes reparten las variantes en hojas propias: `b132/130P` es la
  // fila `132/130P` de las hojas «…b». El mismo traslado que hace
  // parseCeselInforme al leerlas, al revés.
  const variante = programa[0]
  const codigo = programa.slice(1)
  const unidad =
    `hoja «CE3${variante}» · fila con Código Ente ${ente}, Grupo de programa ${codigo} y ` +
    `Unidades físicas de referencia «${atributo}» · columna Nº unidades`

  if (origen.documento === 'informe-ccaa') {
    const region = CCAA[origen.ccaa ?? -1] ?? `la comunidad autónoma ${origen.ccaa ?? '—'}`
    return {
      documento:
        `Informe de ${region} de la entrega, en la consulta por mapa del ministerio ` +
        '(se elige el ejercicio y se pincha la comunidad)',
      url: origen.url,
      coste:
        `hoja «CE1${variante} y CE2${variante}» · fila con Código Ente ${ente} y Grupo de ` +
        `programa ${codigo} · columna coste_efectivo`,
      unidad,
    }
  }

  return {
    documento:
      'Informe del ayuntamiento de la entrega, en la consulta del ministerio (se elige el ' +
      'ejercicio y el ente)',
    url: origen.url,
    coste:
      `hoja «CE2${variante}» · fila con Código Ente ${ente} y Grupo de programa ${codigo} · ` +
      'columna coste_efectivo',
    unidad,
  }
}
