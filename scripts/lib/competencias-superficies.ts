/**
 * ¿Llega a un lector la competencia firmada de este indicador?
 *
 * `competencias.json` se cura y se firma fila a fila, y `check:competencias`
 * vigila que la persona nombrada conserve el cargo. Lo que nadie preguntaba es
 * lo otro: **si esa fila se pinta en alguna parte**. El 24-08-2026 siete de
 * veintidós —Compra Pública y Finanzas públicas y recaudación, todas de
 * `/gestion`— llevaban semanas firmadas y sin pintarse, porque `PanelMunicipal`
 * no tenía prop donde recibirlas y `Gestion.jsx` no cargaba el índice. La
 * guarda decía «22 de 22 coincide» todo ese tiempo.
 *
 * Se lee del CÓDIGO, no de una tabla escrita a mano: qué paneles filtra cada
 * página sale de sus propios `m.panel === '…'`. Una tabla a mano dentro de un
 * control contra el desfase se desfasa ella misma, que es el chiste que este
 * repositorio ya ha contado dos veces (el mapa de prosa nació así, con nueve
 * entradas escritas a mano donde el código tenía sesenta y cuatro).
 *
 * Vive en `scripts/lib` y no dentro del test porque lo necesitan DOS: el test,
 * que reda en CI, y `check-competencias.ts`, que corre en la nocturna y en
 * `cesel-entrega.yml` — dos sitios donde `npm test` no se ejecuta. Dos copias
 * del mismo recorrido es el duplicado que DATA_INTEGRITY §1 prohíbe: se arregla
 * una y la otra sigue mintiendo.
 *
 * Módulo puro salvo por la lectura de `src/`: no toca red y no escribe nada.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/** Las páginas que pintan indicadores MUNICIPALES (los de `m.panel`). */
export const PAGINAS = ['src/pages/Eficiencia.jsx', 'src/pages/Gestion.jsx'] as const

/** El componente por el que pasan TODOS los indicadores municipales. */
export const PANEL_MUNICIPAL = 'src/components/eficiencia/PanelMunicipal.jsx'

/**
 * Dónde se pinta el nombre de quien responde de un SERVICIO del coste efectivo.
 *
 * Era `/eficiencia`: el libro tenía una columna «Quién responde» y los quince
 * servicios enseñaban ahí su competencia. Desde el rediseño de agosto de 2026
 * el libro pasó de ocho columnas a cinco y esa columna se fue entera a la
 * ficha, `/eficiencia/:id`, que es el único sitio donde el nombre cabe en la
 * misma tarjeta que la salvedad que lo desarma — una celda de tabla no tiene
 * sitio para eso.
 *
 * Mover esta constante NO es cosmética, y es justo la avería que esta guarda
 * nació para cazar: si se quedaba apuntando a `Eficiencia.jsx`, la página
 * seguiría importando `useCompetencias` (le hace falta para `PanelMunicipal`) y
 * el cotejo habría dicho «renderizado» de los quince servicios mientras ninguna
 * de las quince filas pintaba un nombre. Es el 24-08-2026 otra vez —«22 de 22
 * coincide» con siete sin pintar— colándose por el proxy en vez de por el dato.
 *
 * No hay `m.panel === …` que declare esta página porque un servicio no es un
 * municipal: `ServicioDetalle` recorre `data.indicadores` entero y no filtra.
 */
const PAGINA_DE_SERVICIOS = 'src/pages/ServicioDetalle.jsx'

export interface FuentesFront {
  /** ruta relativa del fichero → su texto */
  get(f: string): string | undefined
}

/** Lee del disco los ficheros que este módulo necesita inspeccionar. */
export function leerFuentes(raiz = '.'): Map<string, string> {
  const m = new Map<string, string>()
  for (const f of [...PAGINAS, PAGINA_DE_SERVICIOS, PANEL_MUNICIPAL]) {
    m.set(f, readFileSync(resolve(raiz, f), 'utf8'))
  }
  return m
}

/** Los `m.panel === '…'` que una página declara filtrar. */
export function panelesQuePinta(src: string): string[] {
  return [...src.matchAll(/\.panel\s*===\s*'([^']+)'/g)].map((m) => m[1])
}

/** ¿Esta página carga el índice de competencias? */
export function paginaCableada(src: string): boolean {
  return src.includes('useCompetencias')
}

/** ¿`PanelMunicipal` sabe siquiera recibir la competencia? */
export function panelMunicipalRecibeCompetencia(src: string): boolean {
  return /export function PanelMunicipal\(\{[^}]*\bcompetencias?\b/.test(src)
}

export interface Panel {
  indicadores: Array<{ id: string }>
  municipales: Array<{ id: string; panel?: string }>
}

export type Desenlace =
  /** la pinta al menos una página, y esa página está cableada */
  | 'renderizado'
  /** la clave no existe en indicadores.json, o su panel no lo filtra nadie */
  | 'sin-pagina'
  /** hay página, pero no le llega la competencia */
  | 'no-renderizado'

export interface Cotejo {
  desenlace: Desenlace
  /** los ficheros de página que pintan esta clave */
  paginas: string[]
  /** por qué, cuando no se renderiza */
  detalle?: string
}

/**
 * ¿Se pinta en algún sitio la competencia firmada de esta clave?
 *
 * `fuentes` se inyecta para que el test pueda simular un cableado roto sin
 * tocar el árbol: una guarda que no se puede probar rota es una guarda que
 * nadie sabe si funciona.
 */
export function cotejarSuperficie(clave: string, panel: Panel, fuentes: FuentesFront): Cotejo {
  const src = (f: string) => fuentes.get(f) ?? ''

  const esServicio = panel.indicadores.some((i) => i.id === clave)
  const municipal = panel.municipales.find((m) => m.id === clave)

  const paginas = esServicio
    ? [PAGINA_DE_SERVICIOS]
    : municipal
      ? PAGINAS.filter((p) => panelesQuePinta(src(p)).includes(municipal.panel ?? ''))
      : []

  if (paginas.length === 0) {
    return {
      desenlace: 'sin-pagina',
      paginas: [],
      detalle:
        esServicio || municipal
          ? `su panel «${municipal?.panel ?? '?'}» no lo filtra ninguna página`
          : 'la clave no existe en indicadores.json',
    }
  }

  const sinCablear = paginas.filter((p) => !paginaCableada(src(p)))
  if (sinCablear.length > 0) {
    return {
      desenlace: 'no-renderizado',
      paginas,
      detalle: `${sinCablear.join(', ')} no importa useCompetencias`,
    }
  }

  // Los municipales pasan por PanelMunicipal; si no acepta la prop, da igual
  // que la página tenga el índice cargado.
  if (municipal && !panelMunicipalRecibeCompetencia(src(PANEL_MUNICIPAL))) {
    return {
      desenlace: 'no-renderizado',
      paginas,
      detalle: 'PanelMunicipal no recibe competencias',
    }
  }

  return { desenlace: 'renderizado', paginas }
}
