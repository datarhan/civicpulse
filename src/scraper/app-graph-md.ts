/**
 * El despiece en texto: el manual que un agente sí puede leer.
 *
 * Una página de React contesta a quien pulsa. Un agente —o cualquiera que no se
 * baje el repositorio— necesita un fichero. Sale del MISMO grafo que el dibujo,
 * a posta: dos descripciones de la misma máquina se separan, y la que nadie mira
 * es la que miente.
 *
 * Módulo puro: recibe el grafo y devuelve una cadena.
 */
import type { Carril, GrafoApp, NodoApp } from './app-graph'

// `proceso` va al final y no en medio: no es un paso del recorrido del dato,
// es lo que lo empuja y lo comprueba.
const ORDEN: Carril[] = [
  'fuente',
  'script',
  'parser',
  'snapshot',
  'hook',
  'vista',
  'ruta',
  'proceso',
]

const ETIQUETA: Record<Carril, string> = {
  fuente: 'fuente',
  script: 'guion',
  parser: 'parser',
  snapshot: 'snapshot',
  hook: 'hook',
  vista: 'vista',
  ruta: 'ruta',
  proceso: 'proceso',
}

function porDominio(grafo: GrafoApp): Map<string, NodoApp[]> {
  const out = new Map<string, NodoApp[]>()
  for (const n of grafo.nodos) {
    if (n.dominio === null) continue
    const l = out.get(n.dominio) ?? []
    l.push(n)
    out.set(n.dominio, l)
  }
  return out
}

/**
 * Las fuentes de arriba de un dominio.
 *
 * Se siguen por la arista y no por `nodo.dominio` porque un mismo host alimenta
 * varias familias —`ribarroja.es` sirve actas, plantilla y transparencia— y
 * meterlo en una sola sería elegir por él.
 */
function fuentesDe(grafo: GrafoApp, miembros: NodoApp[]): string[] {
  const suyos = new Set(miembros.map((m) => m.id))
  const out = new Set<string>()
  for (const a of grafo.aristas) {
    if (a.tipo !== 'alimenta') continue
    if (a.de.startsWith('fuente:') && suyos.has(a.a)) out.add(a.de.slice('fuente:'.length))
  }
  return [...out].sort()
}

/**
 * Las rutas a las que llega un dominio, siguiendo la cadena del NAVEGADOR:
 * hook, vista, ruta.
 *
 * Con sólo las aristas `alimenta` directas, `pleno-claims/` —que llega a
 * `/plenos/:id` por `usePlenoClaims`— salía como «ninguna página lo lee»
 * teniendo su hook delante. Con el cierre entero pasaría lo contrario: un guion
 * que escribe otro snapshot haría de puente y diría que se ve una página que no
 * lo carga. Un guion no es una página.
 */
function rutasDe(grafo: GrafoApp, miembros: NodoApp[]): string[] {
  const siguientes = new Map<string, string[]>()
  for (const a of grafo.aristas) {
    if (!/^(hook|vista|ruta):/.test(a.a)) continue
    siguientes.set(a.de, [...(siguientes.get(a.de) ?? []), a.a])
  }
  const visto = new Set(miembros.map((m) => m.id))
  for (const id of visto) for (const sig of siguientes.get(id) ?? []) visto.add(sig)
  return [...visto]
    .filter((x) => x.startsWith('ruta:'))
    .map((x) => x.slice('ruta:'.length))
    .sort()
}

export function renderManual(grafo: GrafoApp): string {
  const l: string[] = []
  const { stats } = grafo

  l.push('# El despiece de CivicPulse')
  l.push('')
  l.push('Generado de `npm run despiece`. No se edita a mano: sale del código.')
  l.push('')
  l.push(
    `${grafo.nodos.length} piezas · ${stats.aristas} relaciones · ` +
      ORDEN.map((c) => `${ETIQUETA[c]} ${stats.porCarril[c]}`).join(' · '),
  )
  l.push('')

  // Dos listas, no una. «No pude leer este guion» y «no sé QUÉ fichero es este
  // nombre» son hechos distintos, y mezclarlos hacía que el recuento de guiones
  // ilegibles subiera de treinta y tres a cuarenta y uno con ocho nombres
  // ambiguos dentro.
  const sinAnalizar = grafo.nodos.filter((n) => n.carril === 'script' && !n.analizado)
  const ambiguos = grafo.nodos.filter((n) => n.carril === 'snapshot' && !n.analizado)
  l.push('## Lo que este mapa NO pudo leer')
  l.push('')
  if (sinAnalizar.length === 0) {
    l.push('Nada: se pudo analizar cada guion.')
  } else {
    // Va ARRIBA y no en un apéndice a posta. Un mapa que no dice dónde está
    // ciego se lee como si no lo estuviera, y eso es peor que no tenerlo.
    l.push(
      `${sinAnalizar.length} de ${stats.scriptsAnalizados + stats.scriptsSinAnalizar} guiones ` +
        'construyen sus rutas de una forma que el escaneo no sigue. Sus relaciones ' +
        'NO están en este documento — ausencia de aristas aquí no es ausencia de ' +
        'dependencias allí:',
    )
    l.push('')
    for (const n of sinAnalizar) l.push(`- \`${n.ruta ?? n.nombre}\` — ⚠ no leído`)
  }
  l.push('')

  if (ambiguos.length > 0) {
    l.push('## Nombres que no se pudieron situar')
    l.push('')
    l.push(
      `${ambiguos.length} nombre(s) casan con más de un fichero del repositorio. Cada guion ` +
        'que los nombra recibe su propio nodo en vez de compartirlo: unirlos ataba ' +
        '`.voiceprints/index.json` al manifiesto publicado `pleno-claims/index.json`, que ' +
        'son dos ficheros distintos.',
    )
    l.push('')
    for (const n of ambiguos) l.push(`- \`${n.nombre}\` — ${n.detalle ?? 'ambiguo'}`)
    l.push('')
  }

  const { averias, noMedido } = grafo.averias
  l.push('## Puntos débiles medidos')
  l.push('')
  if (averias.length === 0 && noMedido.length === 0) {
    l.push('Ninguno de los que este mapa sabe medir.')
  } else {
    const por = new Map()
    for (const a of averias) por.set(a.codigo, [...(por.get(a.codigo) ?? []), a])
    for (const [codigo, filas] of por) {
      l.push(`- **${codigo}** (${filas.length}) — ${filas[0].detalle}`)
      for (const f of filas) l.push(`  - \`${f.nodo.split(':').slice(1).join(':')}\``)
    }
    if (noMedido.length > 0) {
      // Aparte, y con motivo. «No pude mirar» no es «está limpio».
      l.push('')
      l.push(`**No medido (${noMedido.length}).** No son hallazgos ni son un visto bueno:`)
      for (const n of noMedido) l.push(`- ${n.motivo}`)
    }
  }
  l.push('')

  const familias = porDominio(grafo)
  l.push(`## Los dominios (${familias.size})`)
  l.push('')
  l.push('Cada uno es una cadena completa: de dónde sale el dato y en qué página acaba.')
  l.push('')

  for (const [dominio, miembros] of [...familias].sort((a, b) => a[0].localeCompare(b[0]))) {
    l.push(`## ${dominio}`)
    l.push('')
    const fuentes = fuentesDe(grafo, miembros)
    if (fuentes.length > 0) {
      l.push(`- **fuente** — ${fuentes.map((f) => `\`${f}\``).join(', ')}`)
    }
    for (const carril of ORDEN) {
      if (carril === 'fuente') continue
      const suyos = miembros
        .filter((m) => m.carril === carril)
        .sort((a, b) => a.id.localeCompare(b.id))
      if (suyos.length === 0) continue
      const nombres = suyos
        .map((n) => {
          // «No publicado» va marcado en el propio renglón. Este mapa llegó a
          // dibujar nueve colas de `editorial/` dentro de `public/data/`, que
          // es decir que están en el sitio: `editorial/` está ignorado por git
          // PRECISAMENTE porque guarda prosa sin revisar sobre personas vivas.
          const fuera = n.carril === 'snapshot' && n.publicado === false ? ' · NO publicado' : ''
          return `\`${n.nombre}\`${fuera}${n.analizado ? '' : ' ⚠ no leído'}`
        })
        .join(', ')
      l.push(`- **${ETIQUETA[carril]}** — ${nombres}`)
    }
    const rutas = rutasDe(grafo, miembros)
    // Un dominio que no llega a ninguna página se DICE. Es la clase de hallazgo
    // que este mapa existe para enseñar, no un renglón que se omite.
    l.push(
      rutas.length > 0
        ? `- **se ve en** — ${rutas.map((r) => `\`${r}\``).join(', ')}`
        : '- **se ve en** — ninguna página. Se publica y nadie lo lee.',
    )
    l.push('')
  }

  return l.join('\n')
}
