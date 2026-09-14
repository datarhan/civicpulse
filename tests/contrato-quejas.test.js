import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Lo que el contrato publicado cuenta del camino de una queja, contra el código
 * que lo recorre.
 *
 * /metodologia#camino-de-una-queja y la tarjeta «Cómo funciona» de /quejas
 * publican cifras que no son suyas: los diez apoyos los decide
 * `VERIFIED_THRESHOLD` en el bot, las diez quejas por lote `selectBatch`, el
 * aviso semanal un cron de GitHub y los plazos el enrutador de la LPACAP. Son
 * páginas legalmente materiales —el contrato editorial y la puerta del canal—, y
 * una frase así se queda falsa sin que nadie la toque en cuanto cambia el
 * número de otro fichero. Ninguna prueba de datos lo vería: el dato estaría bien
 * y la frase, mal.
 *
 * El sitio no puede importar el código del bot —se construyen por separado—, así
 * que la frase no se puede derivar. Lo que sí se puede es leer las constantes
 * donde viven y exigir que la prosa diga lo mismo, que es lo que hace esto.
 */
const RAIZ = join(__dirname, '..')
const lee = (ruta) => readFileSync(join(RAIZ, ruta), 'utf8')
/**
 * El texto de una página JSX como se lee: sin etiquetas, sin los `{' '}` con que
 * Prettier parte las frases y con los saltos de línea aplanados. Sin quitar las
 * etiquetas, «<strong>3 meses legales</strong> (1 mes…)» no casaba con la frase
 * que el lector ve entera.
 */
const plano = (ruta) =>
  lee(ruta)
    .replace(/<[^>]+>/g, '')
    .replace(/\{' '\}/g, ' ')
    .replace(/\s+/g, ' ')

/** Un número leído de su fuente, o un fallo que dice cuál no se encontró. */
function numero(ruta, patron, que) {
  const m = lee(ruta).match(patron)
  if (!m) throw new Error(`no encuentro ${que} en ${ruta}: el patrón ya no casa`)
  return Number(m[1])
}

/** Los números escritos delante de «apoyos», en letra o en cifra. */
const NUMERO_DE_APOYOS =
  /\b(\d+|un|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|veinte) apoyos\b/gi
const apoyosEn = (texto) => [...texto.matchAll(NUMERO_DE_APOYOS)].map((m) => m[1].toLowerCase())

/** Cómo se escriben en la prosa los números que el contrato usa en letra. */
const EN_LETRA = { 1: 'un', 3: 'tres', 10: 'diez' }
const enLetra = (n) => {
  if (!(n in EN_LETRA)) throw new Error(`el contrato tendría que decir ${n} en letra, y no sé cómo`)
  return EN_LETRA[n]
}

const UMBRAL = numero(
  'bot/src/db/queries.ts',
  /export const VERIFIED_THRESHOLD = (\d+)/,
  'el umbral de apoyos',
)
const LOTE = numero(
  'bot/src/services/batch.ts',
  /export function selectBatch\(db: Db, limit = (\d+)\)/,
  'el tamaño del lote',
)
const DIAS_GENERAL = numero(
  'src/scraper/queja-router.ts',
  /const PROFILE_STANDARD[\s\S]*?resolucionDays: (\d+)/,
  'el plazo general',
)
const DIAS_TRANSPARENCIA = numero(
  'src/scraper/queja-router.ts',
  /const PROFILE_TRANSPARENCIA[\s\S]*?resolucionDays: (\d+)/,
  'el plazo de transparencia',
)
const meses = (dias) => {
  if (dias % 30 !== 0) throw new Error(`${dias} días no son meses enteros`)
  return dias / 30
}

const METODOLOGIA = plano('src/pages/Metodologia.jsx')
const QUEJAS = plano('src/pages/Quejas.jsx')

describe('el contrato de las quejas dice lo que hace el código', () => {
  it('lee las cuatro cifras de donde viven (si no, no mide nada)', () => {
    for (const n of [UMBRAL, LOTE, DIAS_GENERAL, DIAS_TRANSPARENCIA]) {
      expect(Number.isInteger(n) && n > 0).toBe(true)
    }
    // Y la tarjeta que se vigila existe: sin ella, «no dice nada falso» es gratis.
    // (Sobre el fichero tal cual: el texto aplanado ya no lleva las etiquetas.)
    expect(lee('src/pages/Metodologia.jsx')).toContain('id="camino-de-una-queja"')
  })

  it('los apoyos: TODA mención en /metodologia y /quejas pide los que pide el bot', () => {
    const enMetodologia = apoyosEn(METODOLOGIA)
    const enQuejas = apoyosEn(QUEJAS)
    // Mide algo: las dos páginas los nombran.
    expect(enMetodologia.length, '/metodologia no dice cuántos apoyos').toBeGreaterThan(0)
    expect(enQuejas.length, '/quejas no dice cuántos apoyos').toBeGreaterThan(0)
    // Todas, no alguna: /metodologia los nombra dos veces, y una mención vieja
    // se escondería detrás de la buena si bastara con que apareciera una.
    expect(
      enMetodologia.filter((n) => n !== enLetra(UMBRAL)),
      `el bot pide ${UMBRAL} apoyos`,
    ).toEqual([])
    expect(
      enQuejas.filter((n) => n !== String(UMBRAL)),
      `el bot pide ${UMBRAL} apoyos`,
    ).toEqual([])
  })

  it('el lote agrupa las que agrupa `selectBatch`', () => {
    expect(METODOLOGIA, `el lote lleva hasta ${LOTE}`).toContain(`hasta ${enLetra(LOTE)} quejas`)
  })

  it('el aviso es semanal porque el cron lo es', () => {
    const cron = lee('.github/workflows/batch-reminder.yml').match(/cron: '([^']+)'/)?.[1]
    expect(cron, 'batch-reminder.yml ya no tiene cron').toBeTruthy()
    // Minuto y hora fijos, cualquier día del mes y del año, UN día de la semana.
    expect(cron).toMatch(/^\d+ \d+ \* \* [0-6]$/)
    expect(METODOLOGIA).toContain('Un aviso semanal')
  })

  it('los plazos son los del enrutador', () => {
    const general = meses(DIAS_GENERAL)
    const transparencia = meses(DIAS_TRANSPARENCIA)
    expect(METODOLOGIA).toContain(`${enLetra(general)} meses`)
    expect(METODOLOGIA).toContain(`${enLetra(transparencia)} mes`)
    expect(QUEJAS).toContain(`${general} meses legales (${transparencia} mes si es transparencia)`)
  })

  it('la tarjeta «Estado» de /quejas no promete un escalado que nadie hace, ni un solo plazo', () => {
    // `plano()` quita las etiquetas CON sus atributos, así que el título del
    // SectionHead no sirve de ancla: se ancla en el texto del párrafo y en el
    // primer paso de «Cómo funciona», que va detrás.
    const desde = QUEJAS.indexOf('CivicPulse opera su propio canal')
    const hasta = QUEJAS.indexOf('tu queja al bot', desde)
    expect(desde, 'no encuentro la tarjeta «Estado»').toBeGreaterThan(-1)
    expect(hasta, 'no encuentro «Cómo funciona» detrás').toBeGreaterThan(desde)
    const estado = QUEJAS.slice(desde, hasta)
    // Mide algo: el trozo es la tarjeta y habla del lote.
    expect(estado).toContain('lote')
    expect(estado, 'la plantilla se prepara; nadie escala en nombre del canal').not.toMatch(
      /escalamos/i,
    )
    expect(estado, 'el plazo corre desde el registro').toContain('Desde ese registro')
    expect(estado).toContain(`${enLetra(meses(DIAS_GENERAL))} meses`)
    expect(estado).toContain(`${enLetra(meses(DIAS_TRANSPARENCIA))} mes`)
  })
})
