import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  sirveElVeredictoCacheado,
  readCacheEntry,
  type ReviewCacheEntry,
} from '../src/scraper/reader-review'

/**
 * «Sin leer desde hace seis días» sobre una página leída hoy.
 *
 * El barrido nocturno del 24-08-2026 recorrió las 30 rutas públicas al 100 % y
 * el digest siguió publicando «9 ruta(s) sin leer desde hace más de 3 días»,
 * nombrando cuatro de ellas con su antigüedad. Las dos cosas eran ciertas a la
 * vez porque medían cosas distintas: 11 de esas rutas se resolvieron por
 * acierto de caché —el texto renderizado era idéntico— y la rama del acierto
 * hacía `continue` sin tocar la entrada, así que `at` conservaba la fecha de la
 * última LLAMADA al modelo, no la de la última comprobación.
 *
 * Un control que nombra nueve rutas como desatendidas el mismo día en que se
 * atendieron es un control que se aprende a ignorar, que es exactamente lo que
 * este repositorio lleva pagando todo el mes.
 *
 * Y al arreglarlo apareció el agujero de al lado: la caché de LLM
 * (`cacheKey` en src/llm/client.ts) SÍ lleva `promptVersion`, y ésta no. Con el
 * texto igual, un cambio de prompt no re-revisaba nada — y refrescar `at` en
 * cada acierto lo habría empeorado, dejando la entrada con pinta de recién
 * comprobada bajo una pregunta que ya no se hace.
 */

describe('reutilizar un veredicto exige texto igual Y pregunta igual', () => {
  const base: ReviewCacheEntry = {
    hash: 'aaaa',
    findings: [],
    at: '2026-08-18T05:34:00.000Z',
    promptVersion: 'reader-review-v2',
    factsHash: 'f111',
  }

  it('sirve cuando coinciden las dos cosas', () => {
    expect(sirveElVeredictoCacheado(base, 'aaaa', 'reader-review-v2', 'f111')).toBe(true)
  })

  it('NO sirve si la página cambió', () => {
    expect(sirveElVeredictoCacheado(base, 'bbbb', 'reader-review-v2', 'f111')).toBe(false)
  })

  it('NO sirve si cambió la versión del prompt, aunque el texto sea idéntico', () => {
    expect(sirveElVeredictoCacheado(base, 'aaaa', 'reader-review-v3', 'f111')).toBe(false)
  })

  it('una entrada SIN versión se vuelve a revisar — falla hacia MÁS revisión', () => {
    const vieja: ReviewCacheEntry = { hash: 'aaaa', findings: [] }
    expect(sirveElVeredictoCacheado(vieja, 'aaaa', 'reader-review-v2', 'f111')).toBe(false)
  })

  it('sin entrada previa, no sirve', () => {
    expect(sirveElVeredictoCacheado(null, 'aaaa', 'reader-review-v2', 'f111')).toBe(false)
  })

  it('NO sirve si se movieron las CIFRAS, aunque el texto y la pregunta sean los mismos', () => {
    // El tercer eje, y el que faltaba. El modelo no juzga sólo el texto: se le
    // inyecta al lado un bloque de hechos que `factsFor(route)` saca de los
    // snapshots VIVOS. Con el texto igual y las cifras movidas, la caché servía
    // el veredicto de ayer sobre los números de hoy — la misma frase juzgada
    // contra otro dato, y ganaba el dato viejo.
    expect(sirveElVeredictoCacheado(base, 'aaaa', 'reader-review-v2', 'f222')).toBe(false)
  })

  it('una entrada SIN huella de hechos se vuelve a revisar', () => {
    // Igual que con `promptVersion`: se falla hacia MÁS revisión. Todas las
    // entradas existentes están en este caso el día del despliegue.
    const sinHuella: ReviewCacheEntry = {
      hash: 'aaaa',
      findings: [],
      promptVersion: 'reader-review-v2',
    }
    expect(sirveElVeredictoCacheado(sinHuella, 'aaaa', 'reader-review-v2', 'f111')).toBe(false)
  })

  it('los tres ejes tienen que coincidir a la vez', () => {
    // Cada uno por su cuenta ya se comprueba arriba; esto fija que ninguno
    // pueda «rescatar» a otro.
    expect(sirveElVeredictoCacheado(base, 'bbbb', 'reader-review-v3', 'f222')).toBe(false)
    expect(sirveElVeredictoCacheado(base, 'aaaa', 'reader-review-v2', 'f111')).toBe(true)
  })

  it('readCacheEntry conserva la huella de hechos', () => {
    expect(readCacheEntry(base)?.factsHash).toBe('f111')
    expect(readCacheEntry('aaaa')?.factsHash).toBeUndefined()
  })

  it('readCacheEntry conserva la versión, y el formato viejo no la inventa', () => {
    expect(readCacheEntry(base)?.promptVersion).toBe('reader-review-v2')
    expect(readCacheEntry('aaaa')?.promptVersion).toBeUndefined()
  })
})

// ─── Y que el acierto de caché lo ESCRIBA de verdad ─────────────────────────
//
// El predicado puro puede estar perfecto y la rama seguir haciendo `continue`
// sin escribir: ese fue literalmente el defecto. Se comprueba sobre el código
// fuente, que es donde vivía.

describe('la rama de acierto de caché refresca la entrada', () => {
  const src = readFileSync(resolve('scripts/review-surfaces.ts'), 'utf8')

  it('mide algo: el fichero se lee y usa el predicado', () => {
    expect(src.length).toBeGreaterThan(1000)
    expect(src).toContain('sirveElVeredictoCacheado')
  })

  it('escribe cache[route] dentro del acierto, con at, promptVersion y factsHash', () => {
    const i = src.indexOf('sirveElVeredictoCacheado(prev, h, READER_REVIEW_PROMPT_VERSION, fh)')
    expect(i, 'no se encuentra la rama del acierto').toBeGreaterThan(-1)
    // La ventana hasta el `continue` de esa rama.
    const rama = src.slice(i, src.indexOf('continue', i))
    expect(rama, 'el acierto no reescribe la entrada').toContain('cache[route] = {')
    expect(rama, 'el acierto no actualiza `at`').toContain('at: new Date().toISOString()')
    expect(rama, 'el acierto no registra la versión de prompt').toContain('promptVersion')
    expect(rama, 'el acierto no registra la huella de hechos').toContain('factsHash')
    // Lo que NO puede pasar: perder los hallazgos al refrescar la fecha.
    expect(rama, 'el acierto pierde los señalamientos vivos').toContain('findings: prev!.findings')
  })
})

// ─── Y la caché de LLM, que es la capa de abajo ─────────────────────────────
//
// Arreglar sólo la entrada de ruta no bastaba, y se midió: con la huella de
// hechos en `cache[route]` pero NO en el `input` que hashea `cacheKey`
// (src/llm/client.ts), mover el total adjudicado hacía que el bucle se
// reejecutara y los siete fragmentos salieran igualmente de caché —
// «cobertura: 100% · 7/7 fragmento(s) (0 leído(s) ahora, 7 de caché)», dos
// segundos, cero llamadas—. El veredicto seguía siendo el calculado contra la
// cifra vieja. El defecto sobrevivía una capa más abajo.

describe('el input que hashea la caché de LLM lleva las cifras', () => {
  const src = readFileSync(resolve('scripts/review-surfaces.ts'), 'utf8')

  it('mide algo: el fichero se lee y construye un input por fragmento', () => {
    expect(src.length).toBeGreaterThan(1000)
    expect(src).toContain('fragment: hashOf(chunk)')
  })

  it('el input incluye ruta, fragmento Y huella de hechos', () => {
    const m = src.match(/input: \{ route: i\.route,[^}]*\}/)
    expect(m, 'no se encuentra el input de la llamada por fragmento').not.toBeNull()
    const input = m![0]
    // Los tres, y por motivos distintos: sin `fragment` un fragmento contesta
    // por toda la página; sin `facts` una cifra movida sirve el juicio viejo.
    expect(input, 'sin ruta').toContain('route: i.route')
    expect(input, 'sin fragmento: un fragmento contestaría por toda la página').toContain(
      'fragment: hashOf(chunk)',
    )
    expect(input, 'SIN HUELLA DE HECHOS: una cifra movida serviría el veredicto viejo').toContain(
      'facts: fh',
    )
  })

  it('la huella se calcula ANTES del acierto de caché, no después', () => {
    // Si `factsFor` se llamara después del `continue`, la rama del acierto no
    // tendría con qué comparar y volveríamos al punto de partida.
    const iFacts = src.indexOf('const fh = huellaDeHechos(')
    const iHit = src.indexOf('sirveElVeredictoCacheado(prev, h,')
    expect(iFacts).toBeGreaterThan(-1)
    expect(iHit).toBeGreaterThan(-1)
    expect(iFacts, 'los hechos se calculan después del acierto de caché').toBeLessThan(iHit)
  })
})

// ─── Una pasada PARCIAL no puede borrar una completa ────────────────────────
//
// `check:surfaces` llevaba días diciendo que /plenos y /laboratorio no se
// habían revisado NUNCA. El log nocturno tiene las dos leídas al 100 %, dos
// veces, y /plenos con un señalamiento abierto sobre el contador «✓».
//
// La causa: `if (complete) { cache[route] = … } else delete cache[route]`.
// No escribir con una revisión a medias es correcto —cachear lo parcial
// retiraría para siempre el trozo no leído—, pero el `else` además TIRA la
// entrada buena que ya había. Y basta un `git push`: el gancho tiene 180 s,
// empieza una ruta larga, se queda a medias y borra la lectura completa de esa
// madrugada. El parte pasa a decir «sin revisar» en vez de «tiene un aviso».
//
// Es el defecto de siempre con el signo cambiado: no un control que dice «bien»
// sin mirar, sino uno que OLVIDA lo que ya miró y lo reporta como no mirado.

describe('la rama de revisión incompleta conserva lo que ya había', () => {
  const src = readFileSync(resolve('scripts/review-surfaces.ts'), 'utf8')

  it('mide algo: el fichero se lee y tiene la rama de escritura', () => {
    expect(src.length).toBeGreaterThan(1000)
    expect(src).toContain('if (complete)')
  })

  it('NO borra la entrada cuando la pasada quedó incompleta', () => {
    // La línea exacta del defecto.
    expect(src, 'una pasada parcial sigue borrando la entrada de una completa').not.toMatch(
      /else\s+delete\s+cache\[route\]/,
    )
  })

  it('y sigue sin ESCRIBIR una parcial, que era lo correcto del original', () => {
    const i = src.indexOf('if (complete) {')
    expect(i).toBeGreaterThan(-1)
    const rama = src.slice(i, src.indexOf('persistirCache()', i))
    expect(rama, 'la escritura ya no está dentro de `if (complete)`').toContain('cache[route] = {')
  })
})
