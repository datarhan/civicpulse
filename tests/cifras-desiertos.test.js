import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

/**
 * Si una frase publica numerador, denominador y porcentaje, ¿se dividen?
 *
 * El 2026-09-08 la auditoría de cifras marcó el denominador de los desiertos
 * informativos con su palomita y anotó «el denominador estaba bien». No lo
 * estaba, y la prueba llevaba semanas dentro de la propia frase:
 *
 *   6.304 / 8.131 = 77,53 %  ← el porcentaje que la frase citaba
 *   6.304 / 8.147 = 77,38 %  ← el denominador que la frase citaba
 *
 * Las tres cifras no podían ser ciertas a la vez. El 8.147 acabó publicado en
 * `/about`, en el blog, en el README y —lo peor— en la propia regla de registro
 * de `docs/DESCRIPCION.md`: la regla que obliga a citar esa cifra con su fuente
 * llevaba dentro una cifra sin comprobar. Y en la tabla de escala del mismo
 * fichero seguía como «Censo comprobado», así que la fuente única se
 * contradecía consigo misma.
 *
 * Esta guarda no necesita fuente, ni red, ni modelo: hace la división. Es la
 * regla 1 de DATA_INTEGRITY aplicada a la prosa — no se recita una cifra, se
 * deriva de la fuente única y se comprueba que cuadre con las otras dos.
 *
 * ## Tres cifras que se parecen y no son la misma
 *
 * - **8.131** — el denominador del ESTUDIO (Negreira-Rey et al., 2023). Es el
 *   único que va con el 77,53 %.
 * - **8.132** — el censo VIGENTE, contado del diccionario del INE. Sirve para
 *   las frases de escala, no para citar el estudio.
 * - **8.147** — no es ninguna de las dos.
 *
 * Que 8.131 y 8.132 se distingan a dos decimales (77,53 % frente a 77,52 %) es
 * lo que permite que la división cace justo la confusión que produjo el error.
 */
const RAIZ = join(__dirname, '..')

/** La fuente única. `docs/DESCRIPCION.md` manda y las demás derivan de ella. */
const FUENTE = 'docs/DESCRIPCION.md'

/** Las superficies que repiten la cifra. Publicadas las cuatro. */
const DERIVADAS = [
  'README.md',
  'src/pages/About.jsx',
  'src/pages/blog/BuildingCivicPulse.jsx',
  'docs/blog/2026-building-a-town-watchdog-solo-with-ai.md',
]

const leer = (rel) => readFileSync(join(RAIZ, rel), 'utf8')

/**
 * Entidades HTML fuera, negritas fuera, espacios colapsados.
 *
 * La frase vive partida en varias líneas en el JSX y en el markdown, y en el
 * JSX lleva `&rsquo;` y `&mdash;` en medio de los números. Sin normalizar, un
 * emparejamiento falla por el formato y no por la cifra, que es la clase de
 * rojo que enseña a desactivar la prueba.
 */
function normaliza(texto) {
  return texto
    .replace(/&rsquo;|&#8217;|&apos;/g, "'")
    .replace(/&mdash;|&#8212;/g, '—')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
}

/**
 * `6.304` y `6,304` son el mismo número; `77,53` y `77.53` también.
 *
 * El separador de miles y el decimal se intercambian entre el castellano y el
 * inglés, y las dos superficies conviven en este repositorio. Se decide por la
 * FORMA del token, no por el idioma del fichero.
 */
function numero(token) {
  const t = String(token).trim()
  if (/^\d{1,3}(?:[.,]\d{3})+$/.test(t)) return Number(t.replace(/[.,]/g, ''))
  if (/^\d+[.,]\d{1,2}$/.test(t)) return Number(t.replace(',', '.'))
  if (/^\d+$/.test(t)) return Number(t)
  return NaN
}

/** «6.304 de 8.131 municipios (77,53 %)» · «6,304 of Spain's 8,147 municipalities — 77.53%» */
const TRIO =
  /([\d.,]+)\s+(?:of|de)\s+[^\d]{0,25}?([\d.,]+)\s+(?:municipalities|municipios)\b[^%]{0,120}?([\d.,]+)\s*%/

function trioDe(rel) {
  const m = normaliza(leer(rel)).match(TRIO)
  if (!m) return null
  return {
    numerador: numero(m[1]),
    denominador: numero(m[2]),
    porcentaje: numero(m[3]),
    literal: m[0],
  }
}

/** El porcentaje que se deduce del numerador y el denominador, a dos decimales. */
const division = (n, d) => Number(((n / d) * 100).toFixed(2))

const fuente = trioDe(FUENTE)

describe('los desiertos informativos: las tres cifras cuadran', () => {
  // Anti-hueco. Si la frase de la fuente se reescribe y el emparejamiento deja
  // de encontrarla, todo lo de abajo compararía `null` contra `null` o se
  // saltaría en silencio: un verde por no medir nada, que es el defecto que
  // este repositorio persigue en todas partes.
  it('mide algo: la fuente única publica las tres cifras', () => {
    expect(
      fuente,
      `no se encontró «N de M municipios (P %)» en ${FUENTE} — si la frase se ha reescrito, actualiza el emparejamiento de esta prueba antes de creerte ningún verde`,
    ).not.toBeNull()
    expect(Number.isFinite(fuente.numerador), `numerador ilegible en ${FUENTE}`).toBe(true)
    expect(Number.isFinite(fuente.denominador), `denominador ilegible en ${FUENTE}`).toBe(true)
    expect(Number.isFinite(fuente.porcentaje), `porcentaje ilegible en ${FUENTE}`).toBe(true)
  })

  it('la fuente única se divide bien', () => {
    expect(
      division(fuente.numerador, fuente.denominador),
      `${FUENTE} publica ${fuente.numerador} de ${fuente.denominador} y dice ${fuente.porcentaje} %, pero la división da ${division(fuente.numerador, fuente.denominador)} %. Las tres cifras no pueden ser ciertas a la vez: haz la división antes de creerte cualquier «✔ comprobado». Literal: «${fuente.literal}»`,
    ).toBe(fuente.porcentaje)
  })

  for (const rel of DERIVADAS) {
    describe(rel, () => {
      const t = trioDe(rel)

      it('publica las tres cifras', () => {
        expect(
          t,
          `no se encontró la frase de los desiertos en ${rel}. O se ha reescrito —y entonces hay que actualizar esta prueba— o ha desaparecido de una superficie que debería llevarla`,
        ).not.toBeNull()
      })

      it('se divide bien', () => {
        expect(
          division(t.numerador, t.denominador),
          `${rel} publica ${t.numerador} de ${t.denominador} y dice ${t.porcentaje} %, pero la división da ${division(t.numerador, t.denominador)} %`,
        ).toBe(t.porcentaje)
      })

      it('cita las mismas cifras que la fuente única', () => {
        expect(
          { n: t.numerador, d: t.denominador, p: t.porcentaje },
          `${rel} no cuadra con ${FUENTE}. Las superficies derivan de la fuente única; no se corrigen una a una`,
        ).toEqual({ n: fuente.numerador, d: fuente.denominador, p: fuente.porcentaje })
      })
    })
  }

  /**
   * El censo de HOY no es el denominador del ESTUDIO.
   *
   * Se parecen —8.132 y 8.131— y mezclarlos es exactamente lo que produjo el
   * error. Cada uno sirve para una frase distinta: el del estudio para citar el
   * estudio, el vigente para hablar de escala.
   */
  it('el censo vigente y el denominador del estudio no se confunden', () => {
    const texto = normaliza(leer(FUENTE))

    const mVigente = texto.match(/censo VIGENTE son ([\d.,]+) municipios/i)
    expect(
      mVigente,
      `${FUENTE} ya no dice cuál es el censo vigente; sin esa cifra la regla no distingue los dos denominadores`,
    ).not.toBeNull()
    const vigente = numero(mVigente[1])

    expect(
      vigente,
      'el censo vigente y el denominador del estudio han quedado con el mismo valor: si de verdad coincidieran, la regla que los separa sobra; lo normal es que sea la confusión de siempre',
    ).not.toBe(fuente.denominador)

    // Y la fila de escala tiene que citar el VIGENTE, no el del estudio ni una
    // tercera cifra. Aquí es donde la fuente única se contradecía a sí misma.
    const mEscala = texto.match(/Censo[^:]{0,40}:\s*([\d.,]+)\s*municipios/i)
    expect(
      mEscala,
      `no se encontró la fila de escala («Censo …: N municipios») en ${FUENTE}`,
    ).not.toBeNull()
    expect(
      numero(mEscala[1]),
      `la fila de escala de ${FUENTE} cita ${mEscala[1]} municipios, que no es el censo vigente (${vigente}). La fuente única no puede contradecirse a sí misma: es de donde copian las otras cuatro superficies`,
    ).toBe(vigente)
  })

  /**
   * La cifra descartada no vuelve.
   *
   * Sólo sobre las DERIVADAS: `DESCRIPCION.md` cita el 8.147 a propósito, como
   * el contraejemplo que explica la regla. Prohibirlo allí obligaría a borrar la
   * explicación, que es lo único que impide que el error vuelva a entrar.
   */
  it('el 8.147 no reaparece en ninguna superficie derivada', () => {
    const conLaCifra = DERIVADAS.filter((rel) => /8[.,]147/.test(normaliza(leer(rel))))
    expect(
      conLaCifra,
      'el 8.147 no es el denominador del estudio ni el censo vigente: no es ninguna cifra de este proyecto',
    ).toEqual([])
  })

  /**
   * Y una SEXTA copia se vigila el día que aparece.
   *
   * `DERIVADAS` es una lista escrita a mano, o sea justo la avería que este
   * repositorio ya ha contado dos veces: una lista a mano DENTRO de un control
   * contra el desfase se desfasa ella misma. La cifra llegó a cuatro superficies
   * precisamente copiándose, así que la guarda no puede depender de que alguien
   * acuerde de añadir la quinta aquí.
   *
   * Así que no se comprueba la lista: se BUSCA la frase por todo lo que git
   * versiona y se exige que lo encontrado sea exactamente lo declarado. Copiar
   * la frase a una superficie nueva pone esta prueba en rojo, y el rojo dice qué
   * fichero es y qué hacer con él.
   *
   * La única exclusión es este fichero: su cabecera cita las dos frases —la
   * buena y la mala— como ejemplos, y es lo que explica la regla.
   */
  it('no hay ninguna superficie sin declarar que publique la misma frase', () => {
    const versionados = execFileSync('git', ['ls-files', '-z'], {
      cwd: RAIZ,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })
      .split('\0')
      .filter(Boolean)
      .filter((p) => /\.(md|mdx|jsx?|tsx?|html|txt)$/.test(p))
      .filter((p) => !p.startsWith('public/data/'))
      .filter((p) => !p.startsWith('tests/fixtures/'))
      .filter((p) => !p.startsWith('pleno-speaker-map/'))
      // Este mismo fichero: cita las dos frases como ejemplo.
      .filter((p) => p !== 'tests/cifras-desiertos.test.js')

    // Anti-hueco: si el listado llega vacío —cwd mal, git ausente, filtro
    // demasiado agresivo— el `toEqual` de abajo compararía [] con [] y saldría
    // verde sin haber mirado un solo fichero.
    expect(
      versionados.length,
      'el barrido no encontró ningún fichero de texto versionado: no está midiendo nada',
    ).toBeGreaterThan(50)

    const conLaFrase = versionados.filter((rel) => TRIO.test(normaliza(leer(rel)))).sort()

    expect(
      conLaFrase,
      'alguna superficie publica «N de M municipios (P %)» sin estar declarada aquí. Añádela a DERIVADAS —y así queda comprobada su división y su coincidencia con la fuente— o quita la cifra de ella',
    ).toEqual([FUENTE, ...DERIVADAS].sort())
  })
})
