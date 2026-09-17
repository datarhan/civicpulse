import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Las afirmaciones de /reportajes/coste-efectivo que el 2026-09-17 resultaron
 * FALSAS al leerlas contra su documento primario, antes de escribir a ningún
 * regulador sobre la pieza. Todas tenían la cifra bien y la frase mal, así que
 * ninguna prueba de datos las veía: la infografía cuadraba, las e2e pasaban y
 * la página decía, por ejemplo, que la tarifa del agua no estaba publicada en
 * ningún sitio cuando la publicó el DOGV en 2013.
 *
 * Cada `it` nombra la fuente que desmiente la frase. Si una frase vuelve, la
 * prueba se pone en rojo con el porqué delante. Las notas de corrección se
 * excluyen a propósito: CITAN lo que se retiró, y eso es lo que tienen que
 * hacer.
 *
 * Registro completo de la verificación, fuera de git:
 * editorial/investigaciones/coste-efectivo/00-VERIFICACION.md
 */
const RAIZ = join(__dirname, '..')
const leer = (p) => readFileSync(join(RAIZ, p), 'utf8')

const pieza = JSON.parse(leer('public/data/reportajes/coste-efectivo.json'))
// Todo lo que el lector ve salvo las notas de corrección, que citan lo retirado.
const { correcciones, ...metaSinCorrecciones } = pieza.meta
const cuerpo = JSON.stringify({ ...pieza, meta: metaSinCorrecciones })

/** El JSX sin comentarios: los comentarios explican lo que se corrigió, citándolo. */
const sinComentarios = (src) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
const jsx = sinComentarios(leer('src/pages/reportajes/CosteEfectivo.jsx'))

const infografiaEntera = leer('public/infografias/eficiencia-2026-08.html')
const infografia = infografiaEntera.replace(/<p class="correccion">[\s\S]*?<\/p>/g, '')

const hidraqua = JSON.parse(leer('public/data/sociedades.json')).sociedades.find(
  (s) => s.id === 'hidraqua',
)

const superficies = { 'el reportaje': cuerpo, 'su componente': jsx, 'la infografía': infografia }

function enNinguna(patron, porque) {
  for (const [donde, texto] of Object.entries(superficies)) {
    expect(texto, `${donde}: ${porque}`).not.toMatch(patron)
  }
}

describe('coste-efectivo · lo que la verificación del 17-09-2026 encontró falso', () => {
  it('mide algo: lee las tres superficies y la ficha de la sociedad', () => {
    // Control: si una ruta cambia y lee vacío, cada `not.toMatch` pasaría solo.
    expect(cuerpo.length).toBeGreaterThan(10000)
    expect(jsx.length).toBeGreaterThan(10000)
    expect(infografia.length).toBeGreaterThan(5000)
    expect(hidraqua, 'sociedades.json ya no trae a hidraqua').toBeTruthy()
    // Y el filtro de correcciones no se come la infografía entera.
    expect(infografia.length).toBeGreaterThan(infografiaEntera.length / 2)
  })

  it('la concesión NO explica el cero: la Orden manda declarar lo recaudado por tarifas', () => {
    // Orden HAP/2075/2014, art. 6, párr. 2 (BOE-A-2014-11492). Las diez
    // entregas declaran «Gestión indirecta mediante concesión», también las
    // que traen 1,8-1,97 M€, así que la concesión no puede ser la causa de las
    // cinco que traen cero.
    const porque = 'la Orden HAP/2075/2014 (art. 6) manda declarar los ingresos por tarifas'
    enNinguna(/porque el servicio está concedido/, porque)
    enNinguna(/la entidad local no paga/, porque)
    enNinguna(/le cuesta el servicio a la entidad local/, porque)
    enNinguna(/es cómo funciona la fuente/, porque)
    expect(cuerpo).toContain(
      'el coste efectivo vendrá determinado por los ingresos derivados de las tarifas que aquellos abonen',
    )
  })

  it('la tarifa SÍ está publicada, y los enlaces de la Plataforma no caducan', () => {
    // DOGV núm. 6949, de 23-01-2013 [2013/500], apartado 3.23; y el estudio de
    // viabilidad de la concesión (04-2019) en la ficha del expediente. Los
    // enlaces con `&cifrado=` devolvieron el mismo sha256 desde tres sesiones.
    enNinguna(/ningún sitio que se pueda enlazar/, 'la tarifa está en el DOGV de 2013')
    enNinguna(/enlaces que caducan/, 'los enlaces completos de la PLACSP son estables')
    enNinguna(/no se pueden citar/, 'los documentos de la PLACSP se pueden citar')
    expect(cuerpo).toContain('https://dogv.gva.es/datos/2013/01/23/pdf/2013_500.pdf')
    expect(cuerpo, 'falta el enlace estable al estudio de viabilidad').toMatch(
      /GetDocumentByIdServlet\?cifrado=[^"]+DocumentIdParam=zpUyMDGjYYbfY5wXh4UoAf/,
    )
  })

  it('la entrega de 2020 no se cuelga de un concejal: la remite la Intervención', () => {
    // Orden HAP/2105/2012, art. 4.1.b: la remisión «se centralizará a través
    // de… la intervención o unidad que ejerza sus funciones». Y el decreto
    // citado no era el que estaba en vigor en 2021. El nombre no vuelve, ni en
    // la nota de corrección: repetirlo publicaría lo que se retira.
    expect(JSON.stringify(pieza), 'el reportaje vuelve a nombrar al concejal').not.toMatch(
      /Carrizosa/,
    )
    expect(infografiaEntera).not.toMatch(/Carrizosa/)
    expect(cuerpo).toMatch(/Intervención/)
    expect(cuerpo).toMatch(/4\.1\.b/)
    // Y «sin rendir» deja de apoyarse sólo en una ausencia: Hacienda lo lista.
    expect(cuerpo).toContain('IncumplimientoSuministroCCLL-LOEPSF.aspx')
  })

  it('los recursos y la sentencia están en la ficha, y la suspensión la ordenó un juzgado', () => {
    // Auto de 9-12-2020 del Juzgado C-A nº 3 de València (PO 291/2019), STSJCV
    // 904/2022 y STS 205/2026, todo descargable de la ficha del expediente.
    enNinguna(/no están en la ficha pública/, 'recursos y sentencia se descargan de la ficha')
    enNinguna(/no los ha visto/, 'los documentos se han leído')
    expect(cuerpo).toMatch(/Juzgado de lo Contencioso-Administrativo nº 3/)
    expect(cuerpo).toMatch(/205\/2026/)
  })

  it('no hay once actas de la primera a la undécima: no hay ninguna nº 7', () => {
    enNinguna(/de la primera a la undécima/, 'la ficha publica las nº 1-6 y 8-11')
    enNinguna(/once actas/, 'se publicaron diez actas el 28-04-2026')
  })

  it('la adjudicación se acordó el 27 de julio; el 6 de agosto sólo se publicó', () => {
    expect(pieza.concesion.adjudicadaEl).toBe('2026-07-27')
    expect(jsx).not.toMatch(/El 6 de agosto de 2026 el Ayuntamiento adjudicó/)
    expect(hidraqua.porQueAparece).not.toMatch(/adjudicada el 6 de agosto/)
    // Sin formalizar no hay contrato «vigente», y la fuente dice «17 Año(s)».
    expect(hidraqua.porQueAparece).not.toMatch(/vigente hasta/)
    expect(pieza.concesion.hasta, 'la fecha de fin salía del volcado que el método no usa').toBe(
      undefined,
    )
  })

  it('el método no dice que las cifras sigan intactas: el 02-09 se movieron', () => {
    enNinguna(/con sus cifras intactas/, 'la corrección del 02-09 recompuso la banda')
    enNinguna(/no se han tocado/, 'la corrección del 02-09 recompuso la banda')
  })

  it('la infografía no arrastra lo que el reportaje ya corrigió', () => {
    expect(infografia).not.toMatch(/Los trece costes unitarios/)
    expect(infografia).not.toMatch(/Lo segundo, no\./)
    expect(infografia).not.toMatch(/503 de sus\s+vecinos/)
    expect(infografia).not.toMatch(/ninguno de los dos era el servicio/)
    // «34 pp» NO está aquí a propósito: la verificación lo señaló (75,72 −
    // 42,32 = 33,4) y es una decisión documentada en el propio HTML — la
    // columna resta las cifras impresas, 76 − 42, para que el lector pueda
    // cuadrarla. Una prueba contra una decisión deliberada sería la que miente.
  })

  it('menores: tiempos y fechas que la fuente no sostiene', () => {
    enNinguna(/tres años y medio/, 'de febrero de 2021 a diciembre de 2024 van casi cuatro')
    // La inscripción es del 7-12-2023; el anuncio no fecha el hecho.
    for (const h of hidraqua.hechos) {
      expect(h.que).not.toMatch(/pasó a tener un solo dueño el 7 de diciembre/)
    }
  })

  it('ninguna fila se pierde en silencio por una clave de React repetida', () => {
    // CorrectionNote usa `key={c.fecha}` y la cronología `key={h.f}`: dos
    // entradas con la misma fecha harían desaparecer una sin error ni aviso.
    const fechas = pieza.meta.correcciones.map((c) => c.fecha)
    expect(new Set(fechas).size).toBe(fechas.length)
    expect(fechas).toContain('2026-09-17')
    const hitos = pieza.cronologia.hitos.map((h) => h.f)
    expect(new Set(hitos).size).toBe(hitos.length)
  })
})

describe('la misma premisa, en /eficiencia y /metodologia', () => {
  it('ni la tarjeta ni el contrato editorial atribuyen el cero a la concesión', () => {
    const vocabulario = leer('src/components/eficiencia/vocabulario.js')
    const lectura = sinComentarios(leer('src/scraper/indicador-lectura.ts'))
    const metodologia = sinComentarios(leer('src/pages/Metodologia.jsx'))
    const porque = 'la Orden HAP/2075/2014 (art. 6) manda declarar los ingresos por tarifas'
    expect(vocabulario, porque).not.toMatch(/porque el concesionario cobra del recibo/)
    expect(lectura, porque).not.toMatch(/porque el servicio está concedido/)
    expect(metodologia, porque).not.toMatch(/se rellena de forma errática/)
  })
})
