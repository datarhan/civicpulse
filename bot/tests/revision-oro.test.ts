import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CLAVE_MEDICION, VERSION_PROMPT } from '../src/services/moderacion-criterios'
import {
  medirRevision,
  textoGuardado,
  type CasoDeOro,
  type MedidaRevision,
  type RespuestaGrabada,
} from '../src/services/medida-revision'

/**
 * Los casos de oro de la revisión automática y la medida grabada contra ellos.
 *
 * La medida es la que podría abrir la publicación automática, así que tiene que
 * ser la del código que corre: esto la repite con las respuestas grabadas y el
 * código de hoy, y si el código decide otra cosa, se pone en rojo hasta que se
 * vuelva a medir (scripts/medir-revision.ts). Y el prompt de la grabación tiene
 * que ser el de hoy.
 */
const FIX = join(__dirname, 'fixtures')
const oro = JSON.parse(readFileSync(join(FIX, 'moderacion-oro.json'), 'utf8')) as {
  cargos: string[]
  casos: CasoDeOro[]
}

const tokens = (s: string) =>
  s
    .toLowerCase()
    .split(/[^\p{L}]+/u)
    .filter((t) => t.length > 2)

describe('los casos de oro', () => {
  it('hay de los dos lados, los bastantes para el listón, y cada id una vez', () => {
    const limpias = oro.casos.filter((c) => !c.retener)
    // Con el listón de lo notable (0,95 sobre el límite inferior de Wilson), hacen
    // falta más de 73 limpias bien publicadas: con menos, ni sin un fallo se llega.
    expect(limpias.length).toBeGreaterThan(75)
    expect(oro.casos.filter((c) => c.retener).length).toBeGreaterThan(30)
    expect(new Set(oro.casos.map((c) => c.id)).size).toBe(oro.casos.length)
  })

  it('lo que hay que quitar está en el texto que leería el modelo', () => {
    for (const c of oro.casos) {
      const t = textoGuardado(c)
      for (const f of c.quitar) expect(`${t.titulo}\n${t.detalle}`, c.id).toContain(f)
    }
  })

  it('son sintéticos: ni un teléfono de verdad, ni un nombre de la corporación', () => {
    const texto = JSON.stringify(oro)
    expect(texto).not.toMatch(/\b34[6-9]\d{8}\b|\b[6-9]\d{8}\b/)
    const oficiales = JSON.parse(
      readFileSync(join(__dirname, '..', '..', 'public', 'data', 'officials.json'), 'utf8'),
    ) as { officials: Array<{ name: string }>; formerOfficials?: Array<{ name: string }> }
    const reales = new Set(
      [...oficiales.officials, ...(oficiales.formerOfficials ?? [])].flatMap((o) => tokens(o.name)),
    )
    expect(reales.size).toBeGreaterThan(20) // el control: hay nombres con que comparar
    const inventados = [
      ...oro.cargos.map((c) => c.replace(/\(.*\)/, '')),
      ...oro.casos.flatMap((c) => c.quitar),
    ].flatMap(tokens)
    expect(inventados.length).toBeGreaterThan(20) // el control
    expect(inventados.filter((t) => reales.has(t))).toEqual([])
  })
})

/**
 * La grabación hace falta cuando la publicación automática está medida: es lo que
 * respalda la cifra de `.automation-measurements.json`. Sin medición registrada no
 * hace falta —hoy, la clave de desarrollo es del nivel gratuito, con unas veinte
 * preguntas al día, y no llega a los casos—; con ella, sí, y la cifra registrada
 * tiene que ser la de la grabación. Así no se abre la publicación automática con un
 * número que no se puede rehacer.
 */
describe('la medida grabada', () => {
  const FICHERO = join(FIX, 'moderacion-oro-respuestas.json')
  const hayGrabacion = existsSync(FICHERO)
  const leerGrabada = () =>
    JSON.parse(readFileSync(FICHERO, 'utf8')) as {
      modelo: string
      version_prompt: string
      respuestas: Record<string, RespuestaGrabada>
      medida: MedidaRevision
    }
  const { measurements } = JSON.parse(
    readFileSync(join(__dirname, '..', '..', '.automation-measurements.json'), 'utf8'),
  ) as { measurements: Array<{ key: string; precision: number; sample: number; against?: string }> }
  const registrada = measurements.find((m) => m.key === CLAVE_MEDICION)

  it('si la publicación automática está medida, hay grabación, y la cifra es la suya', () => {
    expect(measurements.length).toBeGreaterThan(0) // el control: el fichero se lee
    if (!registrada) {
      expect(registrada).toBeUndefined()
      return
    }
    expect(hayGrabacion, 'medida registrada sin grabación que la respalde').toBe(true)
    const { modelo, version_prompt, medida } = leerGrabada()
    expect(registrada.sample).toBe(medida.publicaria)
    expect(registrada.precision).toBeCloseTo(medida.precision ?? -1, 3)
    expect(registrada.against).toContain(`${modelo}@${version_prompt}`)
  })

  it.runIf(hayGrabacion)('la grabación es de este prompt, y cubre cada caso', () => {
    const grabada = leerGrabada()
    expect(
      grabada.version_prompt,
      'el prompt ha cambiado: vuelve a medir con scripts/medir-revision.ts',
    ).toBe(VERSION_PROMPT)
    expect(Object.keys(grabada.respuestas).sort()).toEqual(oro.casos.map((c) => c.id).sort())
  })

  it.runIf(hayGrabacion)('recalculada con el código de hoy, es la grabada', () => {
    const grabada = leerGrabada()
    expect(
      medirRevision(oro.casos, grabada.respuestas),
      'el código decide otra cosa que lo medido: vuelve a medir con scripts/medir-revision.ts',
    ).toEqual(grabada.medida)
  })
})

describe('cómo cuenta la medida', () => {
  const caso = (o: Partial<CasoDeOro> & { id: string }): CasoDeOro => ({
    titulo: 'Farola apagada',
    detalle: 'La farola de la calle Mayor lleva una semana apagada; Paco García lo vio.',
    retener: false,
    quitar: [],
    ...o,
  })
  const dice = (retirar: string[], motivos: string[]): RespuestaGrabada => ({
    tipo: 'texto',
    texto: JSON.stringify({ retirar, motivos }),
  })

  it('una limpia que había que retener, o con un nombre dentro, cuenta en contra', () => {
    const casos = [
      caso({ id: 'bien', quitar: ['Paco García'] }),
      caso({ id: 'nombre-dentro', quitar: ['Paco García'] }),
      caso({ id: 'a-retener', retener: true }),
    ]
    const m = medirRevision(casos, {
      bien: dice(['Paco García'], []),
      'nombre-dentro': dice([], []),
      'a-retener': dice([], []),
    })
    expect(m).toMatchObject({
      publicaria: 3,
      seguras: 1,
      inseguras: ['nombre-dentro', 'a-retener'],
    })
    expect(m.precision).toBeCloseTo(1 / 3)
  })

  it('una retenida de más no cuenta en contra, pero se dice; ni una inválida ni un error cuentan', () => {
    const casos = [
      caso({ id: 'de-mas' }),
      caso({ id: 'bien-retenida', retener: true }),
      caso({ id: 'invalida' }),
      caso({ id: 'error' }),
      caso({ id: 'bloqueada', retener: true }),
    ]
    const m = medirRevision(casos, {
      'de-mas': dice([], ['acusacion']),
      'bien-retenida': dice([], ['insulto']),
      invalida: dice(['Pepe Martínez'], []),
      error: { tipo: 'error', codigo: 'HTTP 503' },
      bloqueada: { tipo: 'bloqueada', razon: 'SAFETY' },
    })
    expect(m).toMatchObject({
      publicaria: 0,
      retenidasBien: 2,
      retenidasDeMas: ['de-mas'],
      invalidas: ['invalida'],
      errores: ['error'],
      precision: null,
      limiteInferior: null,
    })
  })

  it('quitar lo que había que conservar se dice', () => {
    const c = caso({
      id: 'calle',
      detalle: 'En la calle Mariana Pineda se ha abierto un socavón junto a la alcantarilla.',
      conservar: ['Mariana Pineda'],
    })
    expect(medirRevision([c], { calle: dice(['Mariana Pineda'], []) }).quitadoDeMas).toEqual([
      'calle',
    ])
  })

  it('un caso sin respuesta no es un caso que salió bien', () => {
    expect(() => medirRevision([caso({ id: 'sin' })], {})).toThrow(/sin/)
  })
})
