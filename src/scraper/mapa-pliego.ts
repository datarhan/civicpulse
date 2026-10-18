/**
 * El mapa de situación de «matrículas y móviles»: dónde pone el pliego sus
 * aparatos, y dónde está el Parque Natural que da título al contrato.
 *
 * Puro: recibe la respuesta de Overpass (`out geom`) y una configuración, y
 * devuelve la geometría que la figura dibuja, ya simplificada. Sin red; la
 * descarga la hace `scripts/build-mapa-pliego.ts`.
 *
 * Reglas de los mapas de este sitio (CLAUDE.md, «Map honesty rules»):
 *
 * - **Ningún punto inventado.** El pliego no da coordenadas de los
 *   aparcamientos: los sitúa «junto a» una calle. Así que la figura no pone un
 *   pin donde creemos que está el aparcamiento —eso sería adivinar—: dibuja la
 *   CALLE que nombra el pliego, tal como está en OpenStreetMap. Lo que se ve es
 *   la referencia del documento, no una inferencia nuestra.
 * - **Un fallo se dice, no se tapa.** Una calle configurada que no aparece en
 *   la respuesta lanza: dibujar dos de tres en silencio publicaría un mapa que
 *   parece completo.
 * - **La figura comprueba la frase.** La pieza afirma que ninguno de los tres
 *   aparcamientos está en el Parque Natural. Cada tramo se prueba contra el
 *   polígono del parque (`dentro`, par-impar, con los huecos), y el script que
 *   escribe la instantánea se niega si alguno cae dentro: la prosa sería falsa.
 */

/** [lat, lon], redondeado a 5 decimales (~1 m) al salir. */
export type Pt = [number, number]

interface GeomPt {
  lat: number
  lon: number
}

export interface ElementoOsm {
  type: 'node' | 'way' | 'relation'
  id: number
  lat?: number
  lon?: number
  tags?: Record<string, string>
  geometry?: GeomPt[]
  members?: Array<{ type: string; ref: number; role: string; geometry?: GeomPt[] }>
}

export interface ConfigMapa {
  /** Id de la relación OSM del espacio protegido. */
  parque: number
  /** Nombre OSM exacto del río que se dibuja para orientarse, o null. */
  rio: string | null
  /** Cada aparcamiento del pliego y la calle «junto a» la que lo sitúa, con su nombre OSM exacto. */
  aparcamientos: Array<{ nombre: string; calle: string }>
  /** Un lugar con nombre, por su nodo OSM. */
  lugar: { nombre: string; nodo: number }
  /** El núcleo urbano, por su nodo de lugar OSM: sólo para rotularlo. */
  pueblo: { nombre: string; nodo: number }
  /** Encuadre de la figura: [sur, oeste, norte, este]. */
  encuadre: [number, number, number, number]
  /** Tolerancia de simplificación, en metros. */
  toleranciaM: number
}

export interface MapaPliego {
  encuadre: [number, number, number, number]
  /** `rotulo`: dónde se escribe el nombre del parque, un punto DENTRO de él (`polo`). */
  parque: { id: number; nombre: string; anillos: Pt[][]; rotulo: Pt }
  rio: { nombre: string; tramos: Pt[][] } | null
  aparcamientos: Array<{
    nombre: string
    calle: string
    tramos: Pt[][]
    ways: number[]
    /** Algún punto de la calle cae dentro del parque. */
    dentroDelParque: boolean
  }>
  lugar: { nombre: string; nodo: number; punto: Pt; dentroDelParque: boolean }
  pueblo: { nombre: string; nodo: number; punto: Pt }
}

const R = 6_371_000
const rad = (g: number) => (g * Math.PI) / 180
const red = (p: GeomPt | Pt): Pt => {
  const [lat, lon] = Array.isArray(p) ? p : [p.lat, p.lon]
  return [Math.round(lat * 1e5) / 1e5, Math.round(lon * 1e5) / 1e5]
}
const igual = (a: Pt, b: Pt) => a[0] === b[0] && a[1] === b[1]

/**
 * Los anillos cerrados de una relación multipolígono, uniendo sus vías por los
 * extremos (Overpass repite las coordenadas exactas de los nodos compartidos).
 * Exteriores e interiores se unen por separado. Lanza si un anillo no cierra:
 * un polígono abierto haría mentir a `dentro`.
 */
export function anillos(rel: ElementoOsm): Pt[][] {
  const out: Pt[][] = []
  for (const rol of ['outer', 'inner']) {
    const tramos: Pt[][] = (rel.members ?? [])
      .filter((m) => m.type === 'way' && m.role === rol && (m.geometry?.length ?? 0) > 1)
      .map((m) => (m.geometry as GeomPt[]).map((g) => [g.lat, g.lon] as Pt))
    while (tramos.length) {
      let anillo = tramos.shift() as Pt[]
      while (!igual(anillo[0], anillo[anillo.length - 1])) {
        const fin = anillo[anillo.length - 1]
        const i = tramos.findIndex((t) => igual(t[0], fin) || igual(t[t.length - 1], fin))
        if (i < 0) throw new Error(`anillos: un anillo ${rol} de la relación ${rel.id} no cierra`)
        const t = tramos.splice(i, 1)[0]
        anillo = anillo.concat((igual(t[0], fin) ? t : [...t].reverse()).slice(1))
      }
      out.push(anillo)
    }
  }
  return out
}

/** Par-impar sobre todos los anillos: un hueco (interior) saca el punto del parque. */
export function dentro(p: Pt, rings: Pt[][]): boolean {
  let d = false
  const [y, x] = p
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [yi, xi] = ring[i]
      const [yj, xj] = ring[j]
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) d = !d
    }
  }
  return d
}

/** Distancia en metros de `p` al segmento a–b, en proyección local. */
function distSegmento(p: Pt, a: Pt, b: Pt): number {
  const k = Math.cos(rad(p[0]))
  const px = rad(p[1]) * k * R
  const py = rad(p[0]) * R
  const ax = rad(a[1]) * k * R
  const ay = rad(a[0]) * R
  const bx = rad(b[1]) * k * R
  const by = rad(b[0]) * R
  const dx = bx - ax
  const dy = by - ay
  const l2 = dx * dx + dy * dy
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/** Douglas-Peucker, conservando los extremos (un anillo sigue cerrado). */
export function simplificar(linea: Pt[], tolM: number): Pt[] {
  if (linea.length < 3) return linea.slice()
  let max = 0
  let idx = 0
  for (let i = 1; i < linea.length - 1; i++) {
    const d = distSegmento(linea[i], linea[0], linea[linea.length - 1])
    if (d > max) {
      max = d
      idx = i
    }
  }
  if (max <= tolM) return [linea[0], linea[linea.length - 1]]
  const izq = simplificar(linea.slice(0, idx + 1), tolM)
  const der = simplificar(linea.slice(idx), tolM)
  return izq.slice(0, -1).concat(der)
}

/** Simplifica un anillo cerrado partiéndolo en dos, para que DP no lo colapse a un punto. */
function simplificarAnillo(ring: Pt[], tolM: number): Pt[] {
  if (ring.length < 8) return ring
  const mitad = Math.floor(ring.length / 2)
  const a = simplificar(ring.slice(0, mitad + 1), tolM)
  const b = simplificar(ring.slice(mitad), tolM)
  return a.slice(0, -1).concat(b)
}

/**
 * Recorta un anillo a un rectángulo (Sutherland-Hodgman). Sólo para DIBUJAR:
 * el parque mide treinta kilómetros y la figura enseña cinco, y guardar el
 * contorno entero era casi todo el peso de la instantánea. `dentro` se calcula
 * antes, sobre el anillo completo. El recorte puede dejar aristas sobre el
 * borde del rectángulo; quedan fuera de lo visible porque se recorta a un
 * marco mayor que el encuadre y la figura lo enmascara al suyo.
 */
export function recortar(ring: Pt[], [s, w, n, e]: [number, number, number, number]): Pt[] {
  const lados: Array<{ fuera: (p: Pt) => boolean; corte: (a: Pt, b: Pt) => Pt }> = [
    { fuera: (p) => p[0] < s, corte: (a, b) => cortaLat(a, b, s) },
    { fuera: (p) => p[0] > n, corte: (a, b) => cortaLat(a, b, n) },
    { fuera: (p) => p[1] < w, corte: (a, b) => cortaLon(a, b, w) },
    { fuera: (p) => p[1] > e, corte: (a, b) => cortaLon(a, b, e) },
  ]
  let out = ring.slice(0, -1)
  for (const { fuera, corte } of lados) {
    const entrada = out
    out = []
    for (let i = 0; i < entrada.length; i++) {
      const a = entrada[(i + entrada.length - 1) % entrada.length]
      const b = entrada[i]
      if (!fuera(b)) {
        if (fuera(a)) out.push(corte(a, b))
        out.push(b)
      } else if (!fuera(a)) out.push(corte(a, b))
    }
    if (!out.length) return []
  }
  return out.length >= 3 ? [...out, out[0]] : []
}
const cortaLat = (a: Pt, b: Pt, lat: number): Pt => [
  lat,
  a[1] + ((b[1] - a[1]) * (lat - a[0])) / (b[0] - a[0]),
]
const cortaLon = (a: Pt, b: Pt, lon: number): Pt => [
  a[0] + ((b[0] - a[0]) * (lon - a[1])) / (b[1] - a[1]),
  lon,
]

/**
 * Un punto dentro del parque y en la franja central del encuadre, lo más lejos
 * posible de su borde: ahí va el rótulo. Búsqueda en rejilla (40 × 40), con la distancia
 * a los vértices como aproximación del borde; a esta escala basta. Lanza si
 * ningún punto de la rejilla cae dentro: sin parque a la vista no hay rótulo
 * que poner.
 */
export function polo(rings: Pt[][], [s, w, n, e]: [number, number, number, number]): Pt {
  const k = Math.cos(rad((s + n) / 2))
  const verts = rings.flat()
  let mejor: Pt | null = null
  let dMejor = -1
  // Columnas sólo del 25 % al 75 % del ancho y filas del 15 % al 85 % del
  // alto: el rótulo va centrado en el punto y mide un tercio del encuadre; más
  // cerca del borde se corta.
  for (let i = 6; i <= 34; i++) {
    for (let j = 10; j <= 30; j++) {
      const p: Pt = [s + ((n - s) * i) / 40, w + ((e - w) * j) / 40]
      if (!dentro(p, rings)) continue
      let d = Infinity
      for (const v of verts) {
        const dy = v[0] - p[0]
        const dx = (v[1] - p[1]) * k
        d = Math.min(d, dx * dx + dy * dy)
      }
      if (d > dMejor) {
        dMejor = d
        mejor = p
      }
    }
  }
  if (!mejor) throw new Error('polo: el parque no asoma en el encuadre')
  return mejor
}

export function mapaDelPliego(elementos: ElementoOsm[], cfg: ConfigMapa): MapaPliego {
  const rel = elementos.find((e) => e.type === 'relation' && e.id === cfg.parque)
  if (!rel) throw new Error(`mapaDelPliego: falta la relación ${cfg.parque} del parque`)
  const rings = anillos(rel)
  // El marco de recorte: el encuadre más un 10 % por lado.
  const [s, w, n, e] = cfg.encuadre
  const mLat = (n - s) * 0.1
  const mLon = (e - w) * 0.1
  const marco: [number, number, number, number] = [s - mLat, w - mLon, n + mLat, e + mLon]
  const enMarco = (l: Pt[]) =>
    l.some(([la, lo]) => la >= marco[0] && la <= marco[2] && lo >= marco[1] && lo <= marco[3])

  const ways = elementos.filter((e) => e.type === 'way' && (e.geometry?.length ?? 0) > 1)
  const linea = (w: ElementoOsm) => (w.geometry as GeomPt[]).map((g) => [g.lat, g.lon] as Pt)

  const aparcamientos = cfg.aparcamientos.map(({ nombre, calle }) => {
    const suyas = ways.filter((w) => w.tags?.name === calle && w.tags?.highway)
    if (!suyas.length) throw new Error(`mapaDelPliego: «${calle}» no está en la respuesta`)
    const tramos = suyas.map(linea)
    return {
      nombre,
      calle,
      tramos: tramos.map((t) => simplificar(t, cfg.toleranciaM).map(red)),
      ways: suyas.map((w) => w.id).sort((a, b) => a - b),
      dentroDelParque: tramos.some((t) => t.some((p) => dentro(p, rings))),
    }
  })

  const nodoPt = ({ nombre, nodo: id }: { nombre: string; nodo: number }): Pt => {
    const nodo = elementos.find((e) => e.type === 'node' && e.id === id)
    if (!nodo || nodo.lat === undefined || nodo.lon === undefined)
      throw new Error(`mapaDelPliego: falta el nodo ${id} (${nombre})`)
    return [nodo.lat, nodo.lon]
  }
  const punto = nodoPt(cfg.lugar)

  const rio = cfg.rio
    ? (() => {
        const suyas = ways.filter((w) => w.tags?.waterway === 'river' && w.tags?.name === cfg.rio)
        if (!suyas.length)
          throw new Error(`mapaDelPliego: el río «${cfg.rio}» no está en la respuesta`)
        // Del río sólo los tramos que pasan por el marco, con un punto de más a
        // cada lado para que la línea no se corte dentro de lo visible.
        const dentroMarco = (p: Pt) =>
          p[0] >= marco[0] && p[0] <= marco[2] && p[1] >= marco[1] && p[1] <= marco[3]
        const tramos = suyas.flatMap((w) => {
          const l = linea(w)
          const runs: Pt[][] = []
          let run: Pt[] = []
          l.forEach((p, i) => {
            const cerca = dentroMarco(p) || dentroMarco(l[i - 1] ?? p) || dentroMarco(l[i + 1] ?? p)
            if (cerca) run.push(p)
            else if (run.length) {
              runs.push(run)
              run = []
            }
          })
          if (run.length) runs.push(run)
          return runs.filter((r) => r.length > 1)
        })
        return {
          nombre: cfg.rio,
          tramos: tramos.filter(enMarco).map((t) => simplificar(t, cfg.toleranciaM).map(red)),
        }
      })()
    : null

  return {
    encuadre: cfg.encuadre,
    parque: {
      id: rel.id,
      nombre: rel.tags?.['name:es'] ?? rel.tags?.name ?? '',
      rotulo: red(polo(rings, cfg.encuadre)),
      anillos: rings
        .map((r) => recortar(r, marco))
        .filter((r) => r.length)
        .map((r) => simplificarAnillo(r, cfg.toleranciaM).map(red)),
    },
    rio,
    aparcamientos,
    lugar: {
      nombre: cfg.lugar.nombre,
      nodo: cfg.lugar.nodo,
      punto: red(punto),
      dentroDelParque: dentro(punto, rings),
    },
    pueblo: { nombre: cfg.pueblo.nombre, nodo: cfg.pueblo.nodo, punto: red(nodoPt(cfg.pueblo)) },
  }
}
