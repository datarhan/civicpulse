/**
 * La medida de las dos lecturas, comiteada (plan revisado, 4a.5).
 *
 * Era el apéndice de la auditoría del 25-10-2026, un guion para pegar en la
 * consola. Aquí es una función que corre DENTRO de la página
 * (`page.evaluate(medirLecturas, …)`): Playwright la serializa, así que no
 * puede tocar nada de fuera de su cuerpo; todo lo que necesita le llega por
 * argumento.
 *
 * Mide la capa vecinal —todo lo que lleva `data-lectura-vecinal`— y no la
 * página entera: es donde rige el estilo de la casa (una idea por frase, un
 * término con su enlace al glosario). La lectura experta usa el vocabulario de
 * la fuente a propósito.
 *
 * Lo que devuelve, y para qué objetivo:
 *
 * - `pantallasAntes`: dónde empieza la primera capa vecinal, en pantallas.
 * - `primeraRespuesta`: dónde ACABA la primera frase de respuesta, en
 *   pantallas; ≤ 1 es que cabe en la primera. La respuesta es la primera
 *   `.cp-en-breve-frase` con texto (la pregunta y la entradilla del bloque no
 *   responden; una tarjeta sin frase pinta el párrafo vacío) o, en una capa sin
 *   tarjetas, su primer párrafo. La frase acaba en el primer «.», «?» o «!»
 *   seguido de espacio, así que una abreviatura («art. 30») la acorta: el
 *   sesgo va hacia el ✓, y la tabla se lee sabiéndolo.
 * - `jergaSinEnlace` y `siglasSinEnlace`: términos de `JARGON` y siglas que la
 *   capa vecinal imprime fuera de su botón del glosario (`.cp-termino`) o de un
 *   `<abbr title>`. Un literal de la fuente (`data-literal`, el título de un
 *   punto del orden del día) no cuenta: no es prosa nuestra y no se le pone
 *   enlace dentro. Sólo la capa: la cabecera de la página, aunque vaya antes,
 *   no se mide, y un ✓ aquí no dice nada de ella.
 * - `cifras`: cada cifra de tarjeta contra el detalle al que enlaza, por
 *   atributo (`data-cifra`, `data-cifra-valor`; ver `TarjetaEnBreve`):
 *   `coincide`, `no-coincide`, `sin-pareja` (marcada, pero su ancla no tiene
 *   esa cifra o no está en la página), `sin-valor` (un lado no trae
 *   `data-cifra-valor`, o no es un número: `Number(null)` es 0, y dos ausencias
 *   «coincidirían» sin haber comparado nada) o `sin-marcar`.
 * - `ruta`: la ruta en la que acabó la página. Sin el flag de lanzamiento,
 *   /eficiencia redirige a la portada, y lo medido sería la portada.
 * - `palabras`: las de la página que se ven, con el pliegue que haya puesto.
 * - `experta`: si la página tiene secciones plegables (`SeccionExperta`); sólo
 *   entonces tiene sentido contar las palabras con «lo esencial».
 */

/**
 * La sonda de jerga de la auditoría, tal cual. Es una sonda fija, no un
 * diccionario: dice qué palabras de la fuente llegaron a la capa vecinal sin su
 * definición. Las siglas en mayúsculas se buscan enteras y respetando la caja
 * («DEA» no está en «idea»); el resto, por el principio de palabra y sin caja,
 * así que «lote» cuenta «lotes» y «adjudica», «adjudicado».
 */
export const JARGON: readonly string[] = [
  'obligaciones reconocidas',
  'crédito definitivo',
  'capítulo',
  'deuda viva',
  'percentil',
  'mediana',
  'entrega',
  'coste efectivo',
  'CONPREL',
  'PMP',
  'LPACAP',
  'Síndic',
  'expediente',
  'adjudica',
  'licitación',
  'LOREG',
  'DEA',
  'moción',
  'dictamen',
  'literal',
  'tramo',
  'cesta',
  'curador',
  'documentada',
  'contradice',
  'ejecución',
  'contrato menor',
  'lote',
  'UTE',
  'concesión',
  'competencia delegada',
]

export type EstadoCifra = 'coincide' | 'no-coincide' | 'sin-pareja' | 'sin-valor' | 'sin-marcar'

export interface CifraMedida {
  tarjeta: string
  clave: string | null
  estado: EstadoCifra
}

export interface Medida {
  ruta: string
  capas: number
  pantallasAntes: number | null
  primeraRespuesta: number | null
  jergaSinEnlace: string[]
  siglasSinEnlace: string[]
  cifras: CifraMedida[]
  palabras: number
  experta: boolean
}

export function medirLecturas({ jerga, alto }: { jerga: readonly string[]; alto: number }): Medida {
  const redondea = (x: number) => Math.round(x * 10) / 10
  const raiz =
    document.querySelector<HTMLElement>('#contenido') ||
    document.querySelector<HTMLElement>('main') ||
    document.body
  const capas = [...document.querySelectorAll<HTMLElement>('[data-lectura-vecinal]')]

  // Dónde empieza la capa.
  const pantallasAntes = capas.length
    ? redondea((capas[0].getBoundingClientRect().top + window.scrollY) / alto)
    : null

  // Dónde acaba la primera frase de respuesta.
  let primeraRespuesta: number | null = null
  const respuesta = capas.length
    ? [...capas[0].querySelectorAll<HTMLElement>('.cp-en-breve-frase')].find((p) =>
        (p.textContent ?? '').trim(),
      ) ||
      (capas[0].matches('p') ? capas[0] : null) ||
      [...capas[0].querySelectorAll<HTMLElement>('p')].find((p) => p.innerText.trim())
    : null
  if (respuesta) {
    try {
      const rango = document.createRange()
      rango.selectNodeContents(respuesta)
      const andador = document.createTreeWalker(respuesta, NodeFilter.SHOW_TEXT)
      for (let n = andador.nextNode(); n; n = andador.nextNode()) {
        const fin = /[.!?](?=\s|$)/.exec(n.textContent ?? '')
        if (fin) {
          rango.setEnd(n, fin.index + 1)
          break
        }
      }
      const r = rango.getBoundingClientRect()
      primeraRespuesta = redondea((r.bottom + window.scrollY) / alto)
    } catch {
      primeraRespuesta = null
    }
  }

  // El texto de la capa que es prosa nuestra y no está enlazado.
  const trozos: string[] = []
  for (const capa of capas) {
    const andador = document.createTreeWalker(capa, NodeFilter.SHOW_TEXT)
    for (let n = andador.nextNode(); n; n = andador.nextNode()) {
      const padre = n.parentElement
      if (padre?.closest('.cp-termino, abbr[title], [data-literal], style, script')) continue
      trozos.push(n.textContent ?? '')
    }
  }
  // Un espacio entre trozos, y los términos de varias palabras se buscan con
  // `\s+`: «obligaciones <strong>reconocidas</strong>» son dos nodos, y un
  // espacio duro (U+00A0) también es `\s`.
  const texto = trozos.join(' ')
  const escapa = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+')
  const jergaSinEnlace = jerga.filter((termino) =>
    /^\p{Lu}+$/u.test(termino)
      ? new RegExp(`(?<![\\p{L}\\d])${escapa(termino)}(?![\\p{L}\\d])`, 'u').test(texto)
      : new RegExp(`(?<![\\p{L}\\d])${escapa(termino)}`, 'iu').test(texto),
  )
  const siglasSinEnlace = [
    ...new Set(texto.match(/(?<![\p{L}\d])\p{Lu}{2,}\p{Ll}?(?![\p{L}\d])/gu) ?? []),
  ]

  // Cada cifra de tarjeta contra su detalle.
  const cifras: CifraMedida[] = []
  for (const capa of capas) {
    for (const tarjeta of capa.querySelectorAll<HTMLElement>('[data-en-breve]')) {
      const cifra = tarjeta.querySelector<HTMLElement>('.cp-en-breve-cifra')
      if (!cifra) continue
      const id = tarjeta.getAttribute('data-en-breve') ?? ''
      const clave = cifra.getAttribute('data-cifra')
      if (!clave) {
        cifras.push({ tarjeta: id, clave: null, estado: 'sin-marcar' })
        continue
      }
      const href = tarjeta.querySelector('a.cp-en-breve-ancla')?.getAttribute('href') ?? ''
      const destino = href.startsWith('#') ? document.getElementById(href.slice(1)) : null
      const pareja = destino
        ? [destino, ...destino.querySelectorAll<HTMLElement>('[data-cifra]')].find(
            (el) => el !== cifra && el.getAttribute('data-cifra') === clave,
          )
        : undefined
      if (!pareja) {
        cifras.push({ tarjeta: id, clave, estado: 'sin-pareja' })
        continue
      }
      const valor = (el: Element) => {
        const v = (el.getAttribute('data-cifra-valor') ?? '').trim()
        const n = v === '' ? NaN : Number(v)
        return Number.isFinite(n) ? n : null
      }
      const a = valor(cifra)
      const b = valor(pareja)
      if (a == null || b == null) {
        cifras.push({ tarjeta: id, clave, estado: 'sin-valor' })
        continue
      }
      cifras.push({
        tarjeta: id,
        clave,
        estado: Math.abs(a - b) < 0.005 ? 'coincide' : 'no-coincide',
      })
    }
  }

  const palabras = (raiz.innerText || raiz.textContent || '')
    .split(/\s+/)
    .filter((w) => /[\p{L}\d]/u.test(w)).length

  return {
    ruta: location.pathname,
    capas: capas.length,
    pantallasAntes,
    primeraRespuesta,
    jergaSinEnlace,
    siglasSinEnlace,
    cifras,
    palabras,
    experta: document.querySelector('[data-seccion-experta]') !== null,
  }
}
