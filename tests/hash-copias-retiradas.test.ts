import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fnv32, sha256Short } from '../src/scraper/hash'
import { parseRibalicitaContracts } from '../src/scraper/tenders'
import { parseFactCheckResponse } from '../src/scraper/factcheck'
import { parseDnplocResponse } from '../src/scraper/catastro'

/**
 * Tres módulos llevaban su propia copia de una primitiva de `hash.ts`: el
 * `fallbackId` de `tenders.ts` repetía en línea el bucle de `fnv32`, y
 * `factcheck.ts` y `catastro.ts` tenían cada uno un `sha256()` privado para el
 * `id`. Son claves de fila, así que cambiar la copia por el import sólo vale si
 * la salida es la MISMA para toda entrada, byte a byte.
 *
 * Con `fnv32` eso no es gratis: no es el FNV-1a de libro. Multiplica con `*` y
 * no con `Math.imul`, así que en cuanto el producto pasa de 2^53 pierde bits
 * bajos antes del `>>> 0`. Una copia «arreglada» a `Math.imul` —la tentación
 * obvia— habría renumerado todos los `auto-` de `tenders.json`.
 *
 * Las implementaciones retiradas quedan CONGELADAS aquí, copiadas tal cual: son
 * el «antes» contra el que se mide el «después».
 */

/** El bucle que `fallbackId` llevaba en línea en `tenders.ts`. */
function bucleRetirado(seed: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = (h * 0x01000193) >>> 0
  }
  return h.toString(36)
}

/** El `sha256()` privado de `factcheck.ts` y de `catastro.ts`, idénticos entre sí. */
function sha256Retirado(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 12)
}

/** FNV-1a de libro, con `Math.imul`: lo que `fnv32` NO es. */
function fnv1aDeLibro(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(36)
}

const RAIZ = join(__dirname, '..')
const leer = (p: string) => readFileSync(join(RAIZ, p), 'utf8')

const CSV_ABRIL = leer('tests/fixtures/ribalicita_contratos_2026-04-19.csv')
// Las siete filas SIN `id` del CSV de contratos de Gobierto del 2026-09-27,
// copiadas tal cual. Son las únicas de las 812 que pasan por `fallbackId`.
const CSV_SIN_ID = leer('tests/fixtures/ribalicita_contratos_sin_id_2026-09-27.csv')

// Entradas reales —cada línea y cada campo del CSV de abril: tildes, «», €,
// URLs con %2B— más lo que un corpus real no garantiza.
const ENTRADAS = [
  ...new Set([
    ...CSV_ABRIL.split('\n'),
    ...CSV_ABRIL.split(/[\n,]/),
    CSV_ABRIL,
    '',
    'Riba-roja de Túria',
    '\u0000￿',
    '😀 𝄞', // pares suplentes: charCodeAt ve dos unidades por carácter
    'x'.repeat(10_000),
  ]),
]

describe('las copias retiradas y hash.ts dan lo mismo, byte a byte', () => {
  it('mide algo: la batería distingue fnv32 del FNV-1a de libro', () => {
    // Si ninguna entrada llevara el producto por encima de 2^53, las dos
    // aritméticas coincidirían y la comparación de abajo no demostraría nada.
    expect(ENTRADAS.length).toBeGreaterThan(1000)
    expect(ENTRADAS.filter((s) => fnv32(s) !== fnv1aDeLibro(s)).length).toBeGreaterThan(0)
  })

  it('fnv32 = el bucle que fallbackId llevaba en línea', () => {
    expect(ENTRADAS.filter((s) => fnv32(s) !== bucleRetirado(s))).toEqual([])
  })

  it('sha256Short = el sha256() privado de factcheck.ts y catastro.ts', () => {
    expect(ENTRADAS.filter((s) => sha256Short(s) !== sha256Retirado(s))).toEqual([])
  })
})

describe('los ids publicados no se mueven', () => {
  it('tenders: de sus filas salen los siete `auto-` que publica tenders.json el 2026-09-27', () => {
    // La lista la produjo el código de antes, sobre este mismo CSV: es la de
    // la instantánea de ese día.
    expect(parseRibalicitaContracts(CSV_SIN_ID).map((c) => c.id)).toEqual([
      'auto-o7nwci',
      'auto-be0pgw',
      'auto-tkb2py',
      'auto-mse4o8',
      'auto-1tdghq',
      'auto-nnc0ia',
      'auto-ri3muk',
    ])
  })

  it('factcheck: el único id que ha publicado factcheck.json, en toda su historia', () => {
    // Recorrida la historia entera del fichero en git: un solo item, de Maldita.
    // Hoy el filtro de municipio ya no lo deja pasar, así que se comprueba
    // contra la primitiva y no contra el parser.
    expect(
      sha256Short('https://maldita.es/malditobulo/20241030/alerta-dana-embalse-forata-valencia/'),
    ).toBe('edf5ddad406a')
  })

  it('factcheck y catastro: el id de cada fila es el que daba la copia retirada', () => {
    const url = 'https://www.newtral.es/riba-roja-de-turia-parque/20260201/'
    const [fila] = parseFactCheckResponse([
      {
        claims: [
          {
            text: 'Riba-roja de Túria invertirá 50 millones en el parque',
            claimReview: [{ url, title: 'No es cierto', textualRating: 'Falso' }],
          },
        ],
      },
    ])
    expect(fila?.id).toBe(sha256Retirado(url))

    const { parcels } = parseDnplocResponse(
      {
        consulta_dnplocResult: {
          control: { cuerr: 0, cudnp: 1 },
          lrcdnp: {
            rcdnp: { rc: { pc1: '4720001', pc2: 'YJ2742S', car: '0001', cc1: 'J', cc2: 'F' } },
          },
        },
      },
      { Provincia: 'VALENCIA' },
    )
    expect(parcels.map((p) => p.id)).toEqual([sha256Retirado('4720001YJ2742S0001JF')])
  })
})

/**
 * Y que no vuelva a aparecer una copia. CLAUDE.md lo decía —«never fork a
 * local copy»— y las tres de arriba sobrevivieron a esa frase.
 *
 * Se busca la ARITMÉTICA, no el nombre: `* 0x01000193` con `*` es la de
 * `fnv32`, y `digest('hex').slice(0, 12)` la de `sha256Short`.
 * `reader-review.ts` y `prng.ts` hacen FNV-1a con `Math.imul` a propósito —cortes
 * de caché y semillas, no ids— y no son copias de nada.
 */
describe('ninguna copia de las primitivas fuera de hash.ts', () => {
  const COPIA = /\*\s*0x01000193\b|digest\(\s*['"]hex['"]\s*\)\.slice\(\s*0\s*,\s*12\s*\)/
  const codigo = (dir: string, acc: string[] = []): string[] => {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e)
      if (statSync(p).isDirectory()) codigo(p, acc)
      else if (/\.(m?[jt]sx?)$/.test(p)) acc.push(p)
    }
    return acc
  }
  const ficheros = [...codigo(join(RAIZ, 'src')), ...codigo(join(RAIZ, 'scripts'))]

  it('mide algo: el patrón encuentra las dos primitivas en hash.ts', () => {
    const hash = leer('src/scraper/hash.ts')
    expect(hash.split('\n').filter((l) => COPIA.test(l))).toHaveLength(2)
  })

  it('src/ y scripts/ las importan en vez de repetirlas', () => {
    const copias = ficheros
      .map((f) => relative(RAIZ, f))
      .filter((f) => f !== join('src', 'scraper', 'hash.ts'))
      .filter((f) => COPIA.test(leer(f)))
    expect(ficheros.length).toBeGreaterThan(100)
    expect(copias).toEqual([])
  })
})
