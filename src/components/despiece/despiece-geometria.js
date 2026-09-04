/**
 * Dónde va cada pieza del despiece. Módulo puro: ni React ni DOM ni fs.
 *
 * ## Por qué NO hay baricentro
 *
 * Medido sobre el grafo real: 20 % de las aristas van hacia atrás —`compute-*`
 * lee snapshots y escribe snapshots, y eso es realimentación de verdad— y 56 %
 * se saltan al menos un carril. Sobre eso, el orden por baricentro deja decenas
 * de miles de cruces y ni siquiera converge de forma monótona: la octava pasada
 * sale peor que la quinta. Quitar los concentradores tampoco lo salva.
 *
 * ## Lo que sí funciona: el espinazo
 *
 * A cada nodo se le da UNA arista primaria —su sucesor menos concurrido— y cada
 * carril se ordena agrupando sus nodos bajo la fila de su destino primario.
 * Cero cruces, sin iterar, y el mismo dibujo cada vez. Lo demás son aristas
 * secundarias, que no se pintan hasta que el lector abre un nodo.
 */

/** El orden de los carriles ES el orden en que corre el dato. */
export const CARRILES = ['fuente', 'script', 'parser', 'snapshot', 'hook', 'vista', 'ruta']

const indiceCarril = (carril) => CARRILES.indexOf(carril)

/** Comparación estable por id: sin ella, dos ejecuciones pueden diferir. */
const porId = (x, y) => (x < y ? -1 : x > y ? 1 : 0)

function agruparPorCarril(nodos) {
  const porCarril = new Map()
  for (const n of nodos) {
    const c = indiceCarril(n.carril)
    if (c === -1) continue
    const l = porCarril.get(c) ?? []
    l.push(n.id)
    porCarril.set(c, l)
  }
  return porCarril
}

/**
 * El orden ingenuo, alfabético dentro de cada carril.
 *
 * Existe para que la prueba tenga un control positivo: si el alfabético diera
 * cero cruces sobre el mismo grafo, «el espinazo da cero» no mediría nada.
 */
export function ordenAlfabetico(nodos) {
  const salida = new Map()
  for (const [carril, ids] of agruparPorCarril(nodos)) {
    ;[...ids].sort(porId).forEach((id, fila) => salida.set(id, { carril, fila }))
  }
  return salida
}

/**
 * La arista primaria de cada nodo: su sucesor MENOS concurrido.
 *
 * «Menos concurrido» —grado de entrada más bajo— es lo que acerca cada nodo a
 * la página que trata DE él en vez de al concentrador que lo lee de pasada:
 * `/datos` lee treinta y tres cosas y no habla de ninguna en particular.
 * Devuelve `null` cuando el nodo no tiene sucesor, y `null` es una respuesta:
 * significa «no llega a ninguna parte», que es justo lo que hay que ver.
 */
export function espina(nodos, aristas) {
  const gradoEntrada = new Map()
  const sucesores = new Map()
  for (const a of aristas) {
    gradoEntrada.set(a.a, (gradoEntrada.get(a.a) ?? 0) + 1)
    const l = sucesores.get(a.de) ?? []
    l.push(a.a)
    sucesores.set(a.de, l)
  }
  const salida = new Map()
  for (const n of nodos) {
    const candidatos = [...new Set(sucesores.get(n.id) ?? [])].sort(
      (x, y) => (gradoEntrada.get(x) ?? 0) - (gradoEntrada.get(y) ?? 0) || porId(x, y),
    )
    salida.set(n.id, candidatos[0] ?? null)
  }
  return salida
}

/**
 * Carril y fila de cada nodo. De derecha a izquierda, porque cada carril se
 * ordena por dónde cayó el de su derecha.
 */
export function ordenarCarriles(nodos, aristas, esp) {
  const porCarril = agruparPorCarril(nodos)
  const carriles = [...porCarril.keys()].sort((a, b) => a - b)
  const salida = new Map()

  for (let i = carriles.length - 1; i >= 0; i--) {
    const carril = carriles[i]
    const ids = [...porCarril.get(carril)]
    if (i === carriles.length - 1) {
      ids.sort(porId)
    } else {
      // Sin destino primario colocado, al final: un nodo que no llega a ninguna
      // parte no debe empujar a los que sí, pero tampoco desaparecer.
      const fila = (id) => salida.get(esp.get(id))?.fila ?? Number.POSITIVE_INFINITY
      ids.sort((x, y) => fila(x) - fila(y) || porId(x, y))
    }
    ids.forEach((id, fila) => salida.set(id, { carril, fila }))
  }
  return salida
}

/**
 * Cuántas veces se cruzan dos aristas. O(m²) — vive en las pruebas, no en el
 * render: es el número que demuestra que el espinazo no cruza, y un número que
 * nadie comprueba es una afirmación.
 */
export function contarCruces(orden, aristas) {
  const situadas = aristas
    .map((a) => ({ de: orden.get(a.de), a: orden.get(a.a) }))
    .filter((e) => e.de && e.a)
  let cruces = 0
  for (let i = 0; i < situadas.length; i++) {
    for (let j = i + 1; j < situadas.length; j++) {
      const p = situadas[i]
      const q = situadas[j]
      // Sólo se comparan aristas que cubren el mismo tramo de carriles.
      if (p.de.carril !== q.de.carril || p.a.carril !== q.a.carril) continue
      const salida = p.de.fila - q.de.fila
      const llegada = p.a.fila - q.a.fila
      if (salida * llegada < 0) cruces += 1
    }
  }
  return cruces
}

/**
 * El recorrido de un nodo: qué lo alimenta y adónde llega, con la DISTANCIA.
 *
 * La distancia importa. Para un concentrador, atenuar «todo lo que no está en
 * su camino» apaga medio dibujo y no dice nada; ligando la opacidad al salto,
 * se ve la vecindad primero. Un binario aquí miente.
 */
export function cierre(id, aristas, { profundidad = 2 } = {}) {
  const avanzar = (haciaDelante) => {
    const vecinos = new Map()
    for (const a of aristas) {
      const desde = haciaDelante ? a.de : a.a
      const hasta = haciaDelante ? a.a : a.de
      const l = vecinos.get(desde) ?? []
      l.push(hasta)
      vecinos.set(desde, l)
    }
    const vistos = new Map()
    let frente = [id]
    for (let d = 1; d <= profundidad && frente.length > 0; d++) {
      const siguiente = []
      for (const actual of frente) {
        for (const v of vecinos.get(actual) ?? []) {
          if (v === id || vistos.has(v)) continue
          vistos.set(v, d)
          siguiente.push(v)
        }
      }
      frente = siguiente
    }
    return vistos
  }
  return { arriba: avanzar(false), abajo: avanzar(true) }
}

/** Medidas del dibujo, en píxeles. Un sitio, no repartidas por el JSX. */
export const GEOMETRIA = {
  anchoCaja: 168,
  altoCaja: 24,
  huecoFila: 9,
  anchoCarril: 210,
  margen: { x: 12, arriba: 34, abajo: 12 },
}

/**
 * De `{carril, fila}` a cajas con x/y, compactando los carriles vacíos.
 *
 * Compactar importa: la vista de un dominio usa tres o cuatro carriles de los
 * siete, y dejar las columnas vacías dibuja huecos que se leen como piezas que
 * faltan. El hueco que SÍ significa algo —un dominio sin hook, un snapshot sin
 * ruta— se ve porque el carril existe y está vacío DENTRO de la fila, no porque
 * sobre una columna.
 */
export function medida(orden, geometria = GEOMETRIA) {
  const g = geometria
  const usados = [...new Set([...orden.values()].map((p) => p.carril))].sort((a, b) => a - b)
  const columna = new Map(usados.map((c, i) => [c, i]))

  const carriles = usados.map((c) => ({
    carril: CARRILES[c],
    indice: c,
    x: g.margen.x + columna.get(c) * g.anchoCarril,
    ancho: g.anchoCaja,
  }))

  const cajas = new Map()
  let filaMaxima = 0
  for (const [id, pos] of orden) {
    filaMaxima = Math.max(filaMaxima, pos.fila)
    cajas.set(id, {
      x: g.margen.x + columna.get(pos.carril) * g.anchoCarril,
      y: g.margen.arriba + pos.fila * (g.altoCaja + g.huecoFila),
      ancho: g.anchoCaja,
      alto: g.altoCaja,
      columna: columna.get(pos.carril),
    })
  }

  return {
    carriles,
    cajas,
    ancho: g.margen.x * 2 + Math.max(1, usados.length - 1) * g.anchoCarril + g.anchoCaja,
    alto:
      g.margen.arriba +
      (filaMaxima + 1) * (g.altoCaja + g.huecoFila) -
      g.huecoFila +
      g.margen.abajo,
  }
}

/**
 * La curva de una arista, con tangente horizontal forzada.
 *
 * Recta no: cruza los carriles con ángulos que se confunden con los propios
 * nodos. Ortogonal tampoco: a este número de aristas hace falta enrutar canales
 * y sale un plano de metro. La bézier con tangente horizontal deja el ángulo de
 * salida idéntico en todas y por eso el haz se lee.
 *
 * Devuelve `null` si falta un extremo. Una curva hacia una caja que no existe
 * es una relación dibujada que nadie puede comprobar.
 */
export function trazar(m, arista) {
  const a = m.cajas.get(arista.de)
  const b = m.cajas.get(arista.a)
  if (!a || !b) return null

  const x0 = a.x + a.ancho
  const y0 = a.y + a.alto / 2
  const x1 = b.x
  const y1 = b.y + b.alto / 2
  const d = (x1 - x0) * 0.45

  return {
    d: `M${x0},${y0} C${x0 + d},${y0} ${x1 - d},${y1} ${x1},${y1}`,
    // Cuántas columnas se salta por encima. Se pinta a trazos y con el nombre
    // del carril omitido: un salto silencioso se lee como que ese paso no
    // existe, cuando lo que pasa es que ese dato no pasa por ahí.
    salta: Math.max(0, Math.abs(b.columna - a.columna) - 1),
    atras: b.columna < a.columna,
  }
}
