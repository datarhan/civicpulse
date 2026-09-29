import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { CATALOGUE } from '../src/i18n'
import {
  CLAVE_MEDICION,
  DESCRIPCION_MOTIVO,
  MOTIVOS_RETENCION,
} from '../bot/src/services/moderacion-criterios'

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
// Los plazos se leen YA en meses. Estaban escritos en el enrutador como 90 y
// 30 días y aquí se dividían entre 30 para escribir la prosa, que es la misma
// conversión equivocada dos veces: el art. 21.3 LPACAP dice «tres meses» y el
// art. 30.4 manda contarlos de fecha a fecha, así que un mes no son 30 días
// (#62). Ahora la fuente ya está en la unidad de la norma y no hay nada que
// convertir.
const MESES_GENERAL = numero(
  'src/scraper/queja-router.ts',
  /const PROFILE_STANDARD[\s\S]*?resolucionMeses: (\d+)/,
  'el plazo general',
)
const MESES_TRANSPARENCIA = numero(
  'src/scraper/queja-router.ts',
  /const PROFILE_TRANSPARENCIA[\s\S]*?resolucionMeses: (\d+)/,
  'el plazo de transparencia',
)

const METODOLOGIA = plano('src/pages/Metodologia.jsx')
const QUEJAS = plano('src/pages/Quejas.jsx')

describe('el contrato de las quejas dice lo que hace el código', () => {
  it('lee las cuatro cifras de donde viven (si no, no mide nada)', () => {
    for (const n of [UMBRAL, LOTE, MESES_GENERAL, MESES_TRANSPARENCIA]) {
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
    expect(METODOLOGIA).toContain(`${enLetra(MESES_GENERAL)} meses`)
    expect(METODOLOGIA).toContain(`${enLetra(MESES_TRANSPARENCIA)} mes`)
    expect(QUEJAS).toContain(
      `${MESES_GENERAL} meses legales (${MESES_TRANSPARENCIA} mes si es transparencia)`,
    )
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
    expect(estado).toContain(`${enLetra(MESES_GENERAL)} meses`)
    expect(estado).toContain(`${enLetra(MESES_TRANSPARENCIA)} mes`)
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
  // Los hitos de cada queja: hasta el 2026-09-29, en el canal público de Telegram
  // (services/channel.ts); desde entonces, a quien modera.
  const HITOS = lee('bot/src/services/avisos-hitos.ts')
  const OLVIDAR = lee('bot/src/commands/olvidar.ts')
  const CONSULTAS = lee('bot/src/db/queries.ts')

  it('lee los cuatro mensajes (si no, no mide nada)', () => {
    for (const texto of [INICIO, QUEJA, HITOS, OLVIDAR]) expect(texto.length).toBeGreaterThan(500)
  })

  it('ninguno promete que el canal escala al Síndic', () => {
    const conEscalamos = Object.entries({
      'commands/start.ts': INICIO,
      'commands/queja.ts': QUEJA,
      'services/avisos-hitos.ts': HITOS,
    })
      .filter(([, texto]) => /escalamos/i.test(texto))
      .map(([fichero]) => fichero)
    expect(conEscalamos, 'se prepara una plantilla; nadie escala en nombre del canal').toEqual([])
  })

  it('la bienvenida da los dos plazos del enrutador y no dice que el canal envía el lote', () => {
    expect(INICIO).toContain(`${MESES_GENERAL} meses`)
    expect(INICIO).toContain(`${MESES_TRANSPARENCIA} mes`)
    expect(INICIO, 'el lote lo presenta una persona').not.toMatch(/enviamos el lote/i)
  })

  it('una queja recién presentada no se llama «registrada»', () => {
    expect(QUEJA).not.toContain('Queja registrada')
  })

  it('el aviso de silencio no escribe un plazo fijo: el del enrutador cambia con la queja', () => {
    const cuerpo = HITOS.slice(HITOS.indexOf("case 'silencio':"), HITOS.indexOf("case 'escalada':"))
    expect(cuerpo.length, 'no encuentro el aviso de silencio').toBeGreaterThan(50)
    expect(cuerpo, 'escribe los días a mano').not.toMatch(/\b\d+ días/)
  })

  it('la escalada dice lo que hace el bot: marca y prepara la plantilla, no la remite', () => {
    const cuerpo = HITOS.slice(HITOS.indexOf("case 'escalada':"))
    expect(cuerpo.length, 'no encuentro el aviso de escalada').toBeGreaterThan(50)
    expect(cuerpo).not.toMatch(/remitid|escalamos/i)
  })

  it('la respuesta a /olvidar dice lo que pasa: «anónima» sólo si la identidad se borra, y nada de /mis', () => {
    const retirada = CONSULTAS.slice(
      CONSULTAS.indexOf('export function softDeleteQueja'),
      CONSULTAS.indexOf('export function anonimizaRetiradas'),
    )
    expect(retirada.length, 'no encuentro softDeleteQueja').toBeGreaterThan(100)
    // La retirada borra la identidad dejando `ciudadano_id` en NULL desde la migración 1;
    // antes la ponía en el centinela `telegram_user_id = 0`.
    if (!/ciudadano_id = NULL/.test(retirada)) {
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
/** Lo mismo para TypeScript: una llamada dentro de un comentario no arma nada. */
const sinComentariosTs = (texto) =>
  texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
/** Si algo lanza la pasada que anonimiza las fotos: un workflow, el despliegue o el propio bot. */
const LANZAN_FOTOS =
  [...WORKFLOWS, lee('bot/fly.toml'), lee('bot/Dockerfile')].some((s) =>
    sinLineasDeComentario(s).includes('process-photos'),
  ) || sinComentariosTs(lee('bot/src/index.ts')).includes('startFotosCron(')
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
      expect(TRAMO, 'el bot lanza la pasada y el aviso no dice cuándo corre').toContain('cada hora')
    } else {
      expect(TRAMO, 'hoy nada lanza la anonimización, y el aviso tiene que decirlo').toContain(
        'no se está ejecutando',
      )
    }
  })

  it('«unos minutos» sólo si el bot pide republicar al confirmar /olvidar', () => {
    // El plazo que el aviso promete depende de una llamada del bot. Si alguien la
    // quita, el aviso seguiría prometiendo minutos que ya nada pide; si existe y el
    // aviso sólo dice «diaria», el bot le cuenta al vecino otra cosa que la página.
    const PIDE_REPUBLICAR = sinComentariosTs(RESPUESTA).includes('pedirRepublicacion(')
    const inicio = METODOLOGIA.indexOf('puede retirarla')
    const RETIRADA_METODOLOGIA = METODOLOGIA.slice(
      inicio,
      METODOLOGIA.indexOf('aviso legal', inicio),
    )
    expect(RETIRADA_METODOLOGIA.length, 'no encuentro la retirada en /metodologia').toBeGreaterThan(
      80,
    )
    if (PIDE_REPUBLICAR) {
      expect(TRAMO, 'el bot pide republicar y el aviso no dice cuánto tarda').toContain(
        'unos minutos',
      )
      expect(RETIRADA_METODOLOGIA).toContain('unos minutos')
    } else {
      expect(TRAMO, 'el aviso promete minutos que nada pide').not.toContain('minutos')
      expect(RETIRADA_METODOLOGIA).not.toContain('minutos')
    }
  })

  it('lo que el aviso dice que se borra del registro, lo borra la retirada', () => {
    expect(TRAMO, 'prometía un «registro anónimo» mientras la fila guardaba al autor').not.toMatch(
      /registro anónimo/i,
    )
    expect(TRAMO).toContain('tu identidad de Telegram')
    // Desde la migración 1 el autor es `ciudadano_id`: la retirada lo deja en NULL,
    // no en el centinela 0 de antes, y la foto es `foto_ref`.
    for (const campo of ['ciudadano_id = NULL', 'lat = NULL', 'lng = NULL', 'foto_ref = NULL']) {
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

/**
 * Esta prueba lee el código del bot como texto, y una prueba así sigue en verde
 * leyendo un fichero que ya nadie ejecuta. Los que lee se sacan de su propio
 * código, y cada uno tiene que alcanzarse por imports desde bot/src/index.ts.
 */
describe('lo que esta prueba lee del bot es lo que el bot ejecuta', () => {
  const ESTA = readFileSync(__filename, 'utf8')
  const LEIDOS = [...new Set([...ESTA.matchAll(/'(bot\/src\/[\w/.-]+\.ts)'/g)].map((m) => m[1]))]

  function alcanzables(desde) {
    const vistos = new Set()
    const pendientes = [desde]
    while (pendientes.length) {
      const ruta = pendientes.pop()
      if (vistos.has(ruta)) continue
      vistos.add(ruta)
      for (const m of lee(ruta).matchAll(/from '(\.\.?\/[^']+\.ts)'/g)) {
        const destino = join(ruta, '..', m[1]).replace(/\\/g, '/')
        if (destino.startsWith('bot/src/')) pendientes.push(destino)
      }
    }
    return vistos
  }

  it('cada fichero del bot que lee se alcanza desde bot/src/index.ts', () => {
    const vivos = alcanzables('bot/src/index.ts')
    expect(LEIDOS.length, 'el patrón no encuentra lo que la prueba lee').toBeGreaterThan(5)
    expect(vivos.size, 'el recorrido de imports no mira nada').toBeGreaterThan(15)
    expect(LEIDOS.filter((f) => !vivos.has(f))).toEqual([])
  })
})

/**
 * El plazo de conservación se prometía a mano en tres sitios —el aviso legal,
 * `/start` y la respuesta a `/olvidar`— y ningún código lo cumplía. Ahora lo
 * cumple `purgarCaducadas` (bot/src/services/retencion.ts) con la cifra de
 * src/scraper/plazos-retencion.ts, y quien la cuenta la importa.
 */
describe('el plazo de conservación se lee de donde se cumple', () => {
  // Dentro de cada prueba: leída al recoger, una fuente que falta tumbaba el fichero entero.
  const anios = () =>
    numero(
      'src/scraper/plazos-retencion.ts',
      /export const CONSERVACION_QUEJAS_ANIOS = (\d+)/,
      'el plazo de conservación',
    )

  it('lo cumple el bot, cada día', () => {
    expect(lee('bot/src/services/retencion.ts')).toMatch(/CONSERVACION_QUEJAS_ANIOS/)
    expect(sinComentariosTs(lee('bot/src/index.ts'))).toMatch(/startRetencionCron\(/)
  })

  it.each(['src/pages/AvisoLegal.jsx', 'bot/src/commands/start.ts', 'bot/src/commands/olvidar.ts'])(
    '%s lo importa en vez de escribirlo',
    (ruta) => {
      const texto = lee(ruta)
      expect(texto).toMatch(/CONSERVACION_QUEJAS_ANIOS/)
      expect(texto, 'escribe el plazo a mano').not.toMatch(new RegExp(`\\b${anios()} años`))
    },
  )

  it('el aviso legal cuenta qué borra /borrar_mis_datos, y el bot lo tiene', () => {
    const aviso = plano('src/pages/AvisoLegal.jsx')
    expect(aviso).toContain('/borrar_mis_datos')
    const borrar = lee('bot/src/services/ciudadano.ts')
    for (const tabla of ['apoyos', 'subscriptions', 'ciudadanos']) {
      expect(borrar, `olvidarTodo no borra ${tabla}`).toMatch(new RegExp(`DELETE FROM ${tabla}\\b`))
    }
    expect(lee('bot/src/commands/registrar.ts')).toMatch(/registerBorrarMisDatos\(/)
  })
})

/**
 * La revisión antes de publicar, contada donde se publica el contrato. Desde la
 * migración 2 una queja nace `pendiente` y no sale hasta que quien modera el
 * canal la publica: /metodologia y /aviso-legal lo tienen que decir, y lo que
 * dicen tiene que ser lo que hace el código.
 */
describe('la revisión antes de publicar', () => {
  const MIGRACIONES = lee('bot/src/db/migraciones.ts')
  const METODOLOGIA = plano('src/pages/Metodologia.jsx')
  const AVISO = plano('src/pages/AvisoLegal.jsx')

  it('una queja nace pendiente: publicar es una decisión', () => {
    expect(MIGRACIONES).toMatch(/ADD COLUMN moderacion TEXT NOT NULL DEFAULT 'pendiente'/)
    expect(METODOLOGIA).toContain('Se revisa antes de publicarla.')
    expect(METODOLOGIA).toContain('no reescribe su texto')
    expect(AVISO).toContain('Revisión antes de publicar')
    // Y /quejas, en la cabecera que se ve con datos y sin ellos.
    expect(QUEJAS).toContain(
      'Desde finales de septiembre de 2026, una persona revisa cada queja antes de publicarla aquí.',
    )
  })

  it('lo publicado antes de la revisión lo dice la página, y lo marca la migración', () => {
    expect(MIGRACIONES).toMatch(/'heredada', 'migracion'/)
    expect(METODOLOGIA).toMatch(
      /antes de que empezara esta revisión, a finales de septiembre de 2026, no pasaron por ella/,
    )
  })

  it('descartar tiene vuelta atrás: la página lo dice y la transición existe', () => {
    expect(METODOLOGIA).toContain('una descartada puede publicarse después')
    expect(AVISO).toContain('una descartada puede publicarse después')
    expect(lee('bot/src/db/queries.ts')).toMatch(/publicar:\s*\{\s*desde:\s*\[[^\]]*'descartada'/)
  })

  it('quien modera sabe que hay foto pero no la ve, y la foto sale sólo con la queja publicada', () => {
    const avisos = sinComentariosTs(lee('bot/src/services/avisos-admin.ts'))
    expect(METODOLOGIA).toContain('sabe si la queja trae una, pero no la ve')
    // Y en la lista de lo que firma una persona, la foto consta como excepción.
    expect(METODOLOGIA).toContain('se anonimiza y se publica sin que nadie la vea')
    expect(AVISO).toContain('sin la foto, que no ve')
    expect(avisos).toMatch(/Trae foto/)
    expect(avisos).not.toMatch(/send(Photo|MediaGroup|Document)/)
    const lista = lee('bot/src/db/queries.ts').match(
      /export function listQuejasWithPhoto[\s\S]*?\n\}/,
    )
    expect(lista, 'no encuentro listQuejasWithPhoto').not.toBeNull()
    expect(lista[0]).toMatch(/SQL_PUBLICA/)
  })

  it('/olvidar quita el texto de las tarjetas, y la pasada horaria remata las que fallaron', () => {
    expect(AVISO).toContain(
      'quita su texto de las tarjetas de revisión que recibió quien modera las quejas —de todas las que Telegram le deja editar—',
    )
    expect(sinComentariosTs(lee('bot/src/commands/olvidar.ts'))).toMatch(/actualizarTarjetas\(/)
    const pasada = sinComentariosTs(lee('bot/src/services/avisos-admin.ts')).match(
      /export async function pasadaHoraria[\s\S]*?\n\}/,
    )
    expect(pasada, 'no encuentro pasadaHoraria').not.toBeNull()
    expect(pasada[0]).toMatch(/vaciarTarjetasEnCola\(/)
  })

  it('retirar una queja no deja su identidad en lo que el bot mandó de ella', () => {
    // La página dice que /olvidar borra la identidad de Telegram y que /borrar_mis_datos
    // la saca del registro. El aviso a su autor se guarda sin ella, y la retirada
    // borra el rastro de la queja en `avisos` en su misma transacción.
    expect(AVISO).toContain('borra de su registro interno tu identidad de Telegram')
    const avisos = sinComentariosTs(lee('bot/src/services/avisos-admin.ts'))
    expect(avisos).toMatch(/const destinatario = 'autor'/)
    expect(avisos).not.toMatch(/`telegram:\$\{/)
    const retirada = sinComentariosTs(lee('bot/src/db/queries.ts')).match(
      /export function softDeleteQueja[\s\S]*?\n\}/,
    )
    expect(retirada, 'no encuentro softDeleteQueja').not.toBeNull()
    expect(retirada[0]).toMatch(/aVaciar\(db, \[id\], 'retirada'\)/)
  })

  it('la dirección para impugnar es la del aviso legal', () => {
    const m = lee('bot/src/services/contacto.ts').match(/CONTACTO = '([^']+)'/)
    expect(m, 'no encuentro CONTACTO').not.toBeNull()
    expect(AVISO).toContain(m[1])
  })

  it('la tarjeta que no llegó a nadie se reenvía: el bot arma la pasada', () => {
    expect(sinComentariosTs(lee('bot/src/index.ts'))).toMatch(/startReenvioTarjetas\(/)
  })
})

/**
 * La revisión automática (bot/src/services/moderacion.ts): un modelo lee cada
 * queja antes de que la decida una persona, quita los nombres de otras personas
 * y dice si tiene que verla alguien. Lo que la página promete de ella se lee de
 * donde lo decide el código.
 */
describe('la revisión automática', () => {
  const METODOLOGIA = plano('src/pages/Metodologia.jsx')
  const AVISO = plano('src/pages/AvisoLegal.jsx')

  it('la metodología publica, uno a uno y literales, los criterios que recibe el modelo', () => {
    expect(MOTIVOS_RETENCION.length).toBeGreaterThan(5) // el control
    for (const m of MOTIVOS_RETENCION) {
      expect(METODOLOGIA, `/metodologia no publica el motivo «${m}»`).toContain(
        DESCRIPCION_MOTIVO[m],
      )
    }
  })

  it('el aviso legal nombra a Gemini para el texto, con sus condiciones de pago', () => {
    expect(AVISO).toContain(
      'el texto lo lee también un modelo de lenguaje, la API Gemini de Google, con sus condiciones de pago',
    )
    expect(AVISO).toContain('no usan lo enviado para mejorar sus productos')
    // Y así lo exige el código: sin GEMINI_NIVEL=pago no corre.
    expect(lee('bot/src/services/moderacion-criterios.ts')).toMatch(
      /GEMINI_NIVEL\?\.trim\(\) !== 'pago'/,
    )
  })

  it('publicar sin una persona pasa por la medición: la política lo dice, y el código también', () => {
    expect(METODOLOGIA).toContain(CLAVE_MEDICION)
    // Ya no es de las que firma siempre una persona: es de las que se miden.
    expect(METODOLOGIA).not.toContain('publicar una queja ciudadana. No porque una persona')
    expect(sinComentariosTs(lee('bot/src/services/moderacion.ts'))).toMatch(
      /decideAutomation\(\s*clasePublicacion\(congelado\)/,
    )
    expect(lee('scripts/check-automation.ts')).toMatch(/clasePublicacion\(/)
  })

  it('/quejas dice que una persona revisa cada queja mientras no haya medición, y sólo entonces', () => {
    const { measurements } = JSON.parse(lee('.automation-measurements.json'))
    const medida = measurements.some((m) => m.key === CLAVE_MEDICION)
    const frase = 'una persona revisa cada queja antes de publicarla aquí'
    // La medición es la que abre la publicación automática: el cambio que la
    // registre tiene que cambiar también esta frase.
    if (medida) expect(QUEJAS).not.toContain(frase)
    else expect(QUEJAS).toContain(frase)
  })

  it('el bot arma la pasada de la revisión', () => {
    expect(sinComentariosTs(lee('bot/src/index.ts'))).toMatch(/startRevisionCron\(/)
  })
})

describe('los datos personales del texto', () => {
  const PII = lee('bot/src/services/pii.ts')
  const AVISO = plano('src/pages/AvisoLegal.jsx')
  const METODOLOGIA = plano('src/pages/Metodologia.jsx')

  it('la página nombra cada clase que se retira, y la marca que queda en su lugar', () => {
    const clases = [
      ...(PII.match(/CLASES_PII = \[([^\]]+)\]/)?.[1] ?? '').matchAll(/'(\w+)'/g),
    ].map((m) => m[1])
    expect(clases.length, 'no encuentro CLASES_PII en pii.ts').toBeGreaterThan(3)
    const nombres = Object.fromEntries(
      [...PII.matchAll(/^\s+(\w+): \['[^']*', '([^']+)'\],?$/gm)].map((m) => [m[1], m[2]]),
    )
    for (const clase of clases) {
      expect(nombres[clase], `${clase} no tiene nombre en NOMBRES_PII`).toBeTruthy()
      expect(AVISO, `/aviso-legal no nombra «${nombres[clase]}»`).toContain(nombres[clase])
      expect(METODOLOGIA, `/metodologia no nombra «${nombres[clase]}»`).toContain(nombres[clase])
    }
    const marca = PII.match(/MARCA_RETIRADO = '([^']+)'/)?.[1]
    expect(marca, 'no encuentro MARCA_RETIRADO').toBeTruthy()
    expect(AVISO).toContain(`«${marca}»`)
    expect(METODOLOGIA).toContain(`«${marca}»`)
  })

  it('se retiran al guardar: createQueja limpia el título y el detalle', () => {
    const crear = sinComentariosTs(lee('bot/src/db/queries.ts')).match(
      /export function createQueja[\s\S]*?\n\}/,
    )
    expect(crear, 'no encuentro createQueja').not.toBeNull()
    expect(crear[0]).toMatch(/limpiarDatosPersonales\(q\.title\)/)
    expect(crear[0]).toMatch(/limpiarDatosPersonales\(q\.detail\)/)
    expect(AVISO).toContain('antes de guardar una queja, el bot retira')
  })
})
