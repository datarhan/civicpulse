import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { CATALOGUE } from '../src/i18n'

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

/**
 * Lo que el bot le dice al vecino, contra lo que hacen el código y las páginas.
 *
 * #33 quitó de /quejas «escalamos al Síndic»: nadie escala en nombre del canal, se
 * prepara una plantilla. El bot lo seguía diciendo en tres sitios —la bienvenida,
 * la confirmación de cada queja y el aviso de silencio—, y la confirmación llamaba
 * «registrada» a una queja que sólo se había recibido, en un proyecto donde
 * «registrada» es el registro del ayuntamiento, desde el que corre el plazo.
 */
describe('lo que el bot le dice al vecino dice lo mismo que las páginas', () => {
  const INICIO = lee('bot/src/commands/start.ts')
  const QUEJA = lee('bot/src/commands/queja.ts')
  const CANAL = lee('bot/src/services/channel.ts')
  const OLVIDAR = lee('bot/src/commands/olvidar.ts')
  const CONSULTAS = lee('bot/src/db/queries.ts')

  it('lee los cuatro mensajes (si no, no mide nada)', () => {
    for (const texto of [INICIO, QUEJA, CANAL, OLVIDAR]) expect(texto.length).toBeGreaterThan(500)
  })

  it('ninguno promete que el canal escala al Síndic', () => {
    const conEscalamos = Object.entries({
      'commands/start.ts': INICIO,
      'commands/queja.ts': QUEJA,
      'services/channel.ts': CANAL,
    })
      .filter(([, texto]) => /escalamos/i.test(texto))
      .map(([fichero]) => fichero)
    expect(conEscalamos, 'se prepara una plantilla; nadie escala en nombre del canal').toEqual([])
  })

  it('la bienvenida da los dos plazos del enrutador y no dice que el canal envía el lote', () => {
    expect(INICIO).toContain(`${meses(DIAS_GENERAL)} meses`)
    expect(INICIO).toContain(`${meses(DIAS_TRANSPARENCIA)} mes`)
    expect(INICIO, 'el lote lo presenta una persona').not.toMatch(/enviamos el lote/i)
  })

  it('una queja recién presentada no se llama «registrada»', () => {
    expect(QUEJA).not.toContain('Queja registrada')
  })

  it('el aviso de silencio no escribe un plazo fijo: el del enrutador cambia con la queja', () => {
    // Con parámetro: sin él, la primera coincidencia es el `postSilencio() {}` vacío
    // del canal mudo, y la prueba medía un método sin texto.
    const cuerpo = CANAL.slice(
      CANAL.indexOf('async postSilencio(q'),
      CANAL.indexOf('async postEscaladaSindic(q'),
    )
    expect(cuerpo.length, 'no encuentro postSilencio').toBeGreaterThan(50)
    expect(cuerpo, 'escribe los días a mano').not.toMatch(/\b\d+ días/)
  })

  it('la respuesta a /olvidar dice lo que pasa: «anónima» sólo si la identidad se borra, y nada de /mis', () => {
    const retirada = CONSULTAS.slice(
      CONSULTAS.indexOf('export function softDeleteQueja'),
      CONSULTAS.indexOf('export function anonimizaRetiradas'),
    )
    expect(retirada.length, 'no encuentro softDeleteQueja').toBeGreaterThan(100)
    if (!/telegram_user_id = 0/.test(retirada)) {
      expect(OLVIDAR, 'promete un registro anónimo que el código no hace').not.toMatch(
        /anonimizada|como anónima/i,
      )
    }
    // Sin identidad, /mis ya no puede listarla: invitar a comprobarlo allí es mandar
    // al vecino a buscar algo que no va a encontrar.
    expect(OLVIDAR).not.toMatch(/verificarlo ahora mismo con \/mis/i)
  })
})

/** Los workflows, el despliegue del bot y el cron que trae las quejas: donde viven los tiempos. */
const WORKFLOWS = readdirSync(join(RAIZ, '.github/workflows'))
  .filter((f) => /\.ya?ml$/.test(f))
  .map((f) => lee(`.github/workflows/${f}`))
/**
 * Un fichero de configuración sin sus líneas de comentario. Nombrar un script en un
 * comentario no lo ejecuta, y contarlo lo daba por lanzado: el comentario de
 * `pull-quejas.yml` que explica por qué la poda ya no vive en `process-photos`
 * bastaba para que este contrato exigiera al aviso decir que la pasada corre.
 */
const sinLineasDeComentario = (texto) =>
  texto
    .split('\n')
    .filter((l) => !/^\s*#/.test(l))
    .join('\n')
const LANZAN_FOTOS = [...WORKFLOWS, lee('bot/fly.toml'), lee('bot/Dockerfile')].some((s) =>
  sinLineasDeComentario(s).includes('process-photos'),
)
const CRON_QUEJAS = lee('.github/workflows/pull-quejas.yml').match(/cron: '([^']+)'/)?.[1]
/** Si el workflow que trae quejas.json poda también las fotos. */
const PODA_FOTOS = sinLineasDeComentario(lee('.github/workflows/pull-quejas.yml')).includes(
  'node scripts/fotos-quejas.mjs',
)
const CONSULTAS_BOT = lee('bot/src/db/queries.ts')
const ANALISIS_FOTOS = lee('bot/src/services/photo-anonymize.ts')

/**
 * El aviso legal es el contrato con quien presenta una queja, y cada frase de su
 * tramo sobre /olvidar describe algo que hace el código. Aquí se lee ese código.
 *
 * Prometía que una queja retirada, y su foto, desaparecían «inmediatamente»; luego
 * que la retirada era «instantánea (≤24 h)», cuando GitHub arranca la ejecución
 * diaria horas tarde y dos seguidas pueden distar más de un día. Decía que el
 * original de la foto se guarda en el almacén del bot, que sólo guarda la
 * referencia de Telegram; que quedaba un «registro anónimo» mientras la fila
 * conservaba al autor; y mandaba a cualquier lector a usar /olvidar, que sólo sirve
 * a quien envió la queja.
 */
describe('el aviso legal dice lo que hace /olvidar, cuándo y con qué foto', () => {
  const AVISO = plano('src/pages/AvisoLegal.jsx')
  // Todo el tramo de las quejas: de la foto de la lista a los derechos adicionales.
  const desde = AVISO.indexOf('Fotografía adjunta (si la envías)')
  const hasta = AVISO.indexOf('Derechos adicionales')
  const TRAMO = AVISO.slice(desde, hasta)
  const FOTO_EN_LA_LISTA = TRAMO.slice(0, TRAMO.indexOf('Base jurídica'))
  const RESPUESTA = lee('bot/src/commands/olvidar.ts')
  const RETIRADA = CONSULTAS_BOT.slice(
    CONSULTAS_BOT.indexOf('export function softDeleteQueja'),
    CONSULTAS_BOT.indexOf('export function anonimizaRetiradas'),
  )
  // El pie de la foto vive en el catálogo desde que la ficha se lee en valencià (#38):
  // se mira que la ficha lo pinta y lo que dice en los dos idiomas.
  const FICHA = lee('src/pages/QuejaDetail.jsx')
  const PIE_DE_FOTO = CATALOGUE.es['quejas.detalle.foto.pie'] ?? ''
  const PIE_DE_FOTO_CA = CATALOGUE.ca['quejas.detalle.foto.pie'] ?? ''

  it('lee de dónde viven los tiempos (si no, no mide nada)', () => {
    expect(desde, 'no encuentro la foto adjunta en el aviso').toBeGreaterThan(-1)
    expect(hasta, 'no encuentro los derechos adicionales detrás').toBeGreaterThan(desde)
    expect(FOTO_EN_LA_LISTA.length, 'no encuentro la base jurídica tras la lista').toBeGreaterThan(
      20,
    )
    expect(TRAMO).toContain('/olvidar')
    expect(WORKFLOWS.length).toBeGreaterThan(5)
    expect(CRON_QUEJAS, 'pull-quejas.yml ya no tiene cron').toBeTruthy()
    expect(RETIRADA.length, 'no encuentro softDeleteQueja').toBeGreaterThan(100)
  })

  it('la web se actualiza a diario: nada promete retirarla «de inmediato» ni en horas', () => {
    expect(CRON_QUEJAS, 'minuto y hora fijos, todos los días').toMatch(/^\d+ \d+ \* \* \*$/)
    expect(TRAMO, '/aviso-legal promete inmediatez o un plazo en horas').not.toMatch(
      /inmediat|instantáne|≤\s*24\s*h/i,
    )
    expect(RESPUESTA, 'la respuesta del bot promete que ya ha desaparecido').not.toMatch(
      /ha desaparecido|inmediat/i,
    )
    expect(TRAMO).toContain('siguiente actualización diaria')
    expect(METODOLOGIA).toContain('siguiente actualización diaria')
  })

  it('la foto se va en la misma actualización que la queja, porque el workflow la poda', () => {
    expect(PODA_FOTOS, 'pull-quejas.yml ya no poda las fotos').toBe(true)
    expect(TRAMO).toContain('misma actualización')
    expect(METODOLOGIA).toContain('misma actualización')
  })

  it('la foto: el bot no guarda el original, nadie la revisa y el servicio que la analiza tiene nombre', () => {
    expect(TRAMO, 'se contradecía: «tras revisión» y «sin revisión humana previa»').not.toMatch(
      /tras revisión/i,
    )
    expect(TRAMO).toContain('nadie revisa la imagen')
    expect(TRAMO, 'el bot sólo guarda la referencia de Telegram').not.toMatch(
      /almacén (local )?del bot/i,
    )
    expect(FOTO_EN_LA_LISTA).toContain('Telegram')
    // Un solo destino para la imagen: si el código vuelve a tener otro, el aviso se queda corto.
    expect(ANALISIS_FOTOS).not.toMatch(/api\.openai\.com/)
    expect(TRAMO).toContain('Gemini')
    if (LANZAN_FOTOS) {
      expect(TRAMO).not.toContain('no se está ejecutando')
    } else {
      expect(TRAMO, 'hoy nada lanza la anonimización, y el aviso tiene que decirlo').toContain(
        'no se está ejecutando',
      )
    }
  })

  it('lo que el aviso dice que se borra del registro, lo borra la retirada', () => {
    expect(TRAMO, 'prometía un «registro anónimo» mientras la fila guardaba al autor').not.toMatch(
      /registro anónimo/i,
    )
    expect(TRAMO).toContain('tu identidad de Telegram')
    for (const campo of [
      'telegram_user_id = 0',
      'telegram_username = NULL',
      'lat = NULL',
      'lng = NULL',
      'photo_file_id = NULL',
    ]) {
      expect(RETIRADA, `la retirada no hace ${campo}`).toContain(campo)
    }
  })

  it('/olvidar sólo lo usa quien envió la queja, y el aviso y la ficha lo dicen así', () => {
    expect(FICHA, 'la ficha ya no pinta el pie de su foto').toContain("'quejas.detalle.foto.pie'")
    expect(PIE_DE_FOTO).toContain('Si la enviaste tú')
    expect(PIE_DE_FOTO_CA).toContain('Si la vas enviar tu')
    expect(TRAMO).toContain('Si la enviaste tú')
  })

  it('la reescritura del historial dice hasta dónde no llega', () => {
    // Las referencias que GitHub guarda de cada solicitud de cambio no se reescriben
    // desde el repositorio: este mismo repositorio tuvo que borrarse y recrearse.
    expect(TRAMO).toContain('solicitud de cambio')
    expect(TRAMO).toContain('clonado')
  })
})
