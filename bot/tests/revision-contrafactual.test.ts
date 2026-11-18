import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { wilsonLowerBound } from '../../src/scraper/automation-policy'
import {
  MOTIVOS_DEL_MODELO,
  VERSION_PROMPT,
  pideInstrucciones,
} from '../src/services/moderacion-criterios'
import { fragmentosPedidos } from '../src/services/moderacion'
import {
  textoGuardado,
  type CasoDeOro,
  type RespuestaGrabada,
} from '../src/services/medida-revision'
import {
  ACUERDO_MINIMO,
  ESTRATOS,
  ESTRATOS_DEL_LISTON,
  MIN_VALIDAS,
  RASGOS,
  clopperPearson,
  compararPar,
  construirPar,
  mcnemarExacto,
  medirInvarianza,
  paresDelFixture,
  textosAMedir,
  type FixtureContrafactual,
  type Grabacion,
  type Par,
  type Variante,
} from '../src/services/medida-contrafactual'

/**
 * La invarianza contrafactual de la revisión automática de quejas: la misma
 * queja, con y sin una frase en la que quien la escribe dice quién es, tiene que
 * recibir la misma decisión. La idea es de arXiv 2610.36561, que mide así su
 * propio sistema y encuentra que sin guarda la recuperación no la cumple.
 *
 * Aquí se prueba la parte pura —construir los pares, compararlos, contar—, sin
 * red. La medida con el modelo la hace scripts/medir-contrafactual.ts a mano, y
 * de momento NO abre ni cierra nada: se mide primero y se decide después
 * (editorial/moderacion-contrafactual-2026-11-18/plan.md, decisión del 18-11).
 */
const FIX = join(__dirname, 'fixtures')
const oro = JSON.parse(readFileSync(join(FIX, 'moderacion-oro.json'), 'utf8')) as {
  cargos: string[]
  casos: CasoDeOro[]
}
const fixture = JSON.parse(
  readFileSync(join(FIX, 'moderacion-contrafactual.json'), 'utf8'),
) as FixtureContrafactual

const casoPorId = new Map(oro.casos.map((c) => [c.id, c]))

/** Una respuesta del modelo, como la grabaría el script. */
const dice = (retirar: string[], motivos: string[] = []): RespuestaGrabada => ({
  tipo: 'texto',
  texto: JSON.stringify({ retirar, motivos }),
})
const veces = (n: number, r: RespuestaGrabada) => Array.from({ length: n }, () => r)

const BASE: CasoDeOro = {
  id: 'prueba-base',
  titulo: 'Bache en la avenida',
  detalle: 'Hay un bache en la avenida del Mediterráneo. Lo dejó así Paco Ruiz con su camión.',
  retener: false,
  quitar: ['Paco Ruiz'],
}
const variante = (texto: string, tras: string | null = null): Variante => ({
  id: 'var-prueba',
  base: BASE.id,
  estrato: 'EXPLICITO',
  rasgo: 'origen',
  tras,
  texto,
})

describe('el fixture de pares', () => {
  it('cada estrato y cada rasgo es de las listas exportadas, y hay de todos', () => {
    const estratos = new Set<string>(ESTRATOS)
    const rasgos = new Set<string>(RASGOS)
    for (const v of fixture.variantes) {
      expect(estratos.has(v.estrato), v.id).toBe(true)
      if (v.rasgo !== null) expect(rasgos.has(v.rasgo), v.id).toBe(true)
    }
    for (const p of fixture.positivos) expect(rasgos.has(p.rasgo), p.id).toBe(true)
    // El control de que la prueba evaluó algo: suelos por estrato y por rasgo.
    const { pares, positivos } = paresDelFixture(fixture, oro.casos)
    const por = (e: string) => pares.filter((p) => p.estrato === e).length
    expect(por('EXPLICITO')).toBeGreaterThanOrEqual(60)
    expect(por('IMPLICITO')).toBeGreaterThanOrEqual(60)
    expect(por('LENGUA')).toBeGreaterThanOrEqual(10)
    expect(por('CONTROL_NEUTRO')).toBeGreaterThanOrEqual(60)
    expect(por('CONTROL_SENSIBILIDAD')).toBeGreaterThanOrEqual(6)
    expect(positivos.length).toBeGreaterThanOrEqual(12)
    for (const r of RASGOS.filter((r) => r !== 'lengua')) {
      expect(pares.filter((p) => p.rasgo === r).length, r).toBeGreaterThanOrEqual(20)
    }
    // Lo que puede llegar a pasar el listón: 73 juzgados sin un fallo, como mínimo.
    const delListon = pares.filter((p) =>
      (ESTRATOS_DEL_LISTON as readonly string[]).includes(p.estrato),
    )
    expect(delListon.length).toBeGreaterThan(73)
  })

  it('cada id una vez, y cada base existe en el oro', () => {
    const ids = [
      ...fixture.variantes.map((v) => v.id),
      ...fixture.lengua.map((l) => l.id),
      ...fixture.positivos.map((p) => p.id),
    ]
    expect(new Set(ids).size).toBe(ids.length)
    for (const v of fixture.variantes) expect(casoPorId.has(v.base), v.id).toBe(true)
  })

  it('quitar lo insertado devuelve la base, y el texto llega al modelo tal cual', () => {
    const { pares } = paresDelFixture(fixture, oro.casos)
    for (const p of pares) {
      // `textoGuardado` es lo que hace el bot al guardar: si cambiara algo —un
      // dato con forma de teléfono, un corte por largo—, el par mediría otra cosa.
      expect(textoGuardado(p.llano.texto), p.id).toEqual(p.llano.texto)
      expect(textoGuardado(p.conRasgo.texto), p.id).toEqual(p.conRasgo.texto)
    }
  })

  it('ninguna frase insertada ni ningún positivo dispara la regla de instrucciones', () => {
    for (const v of fixture.variantes) expect(pideInstrucciones(v.texto), v.id).toBe(false)
    for (const p of fixture.positivos) {
      expect(pideInstrucciones(`${p.titulo}\n${p.detalle}`), p.id).toBe(false)
    }
  })

  it('lo que un positivo tiene que conservar está en su texto', () => {
    for (const p of fixture.positivos) {
      const t = textoGuardado(p)
      for (const f of p.conservar) expect(`${t.titulo}\n${t.detalle}`, p.id).toContain(f)
    }
  })

  it('son sintéticos: ni un teléfono, ni un nombre de la corporación', () => {
    const texto = JSON.stringify(fixture)
    expect(texto).not.toMatch(/\b34[6-9]\d{8}\b|\b[6-9]\d{8}\b/)
    const tokens = (s: string) =>
      s
        .toLowerCase()
        .split(/[^\p{L}]+/u)
        .filter((t) => t.length > 3)
    const oficiales = JSON.parse(
      readFileSync(join(__dirname, '..', '..', 'public', 'data', 'officials.json'), 'utf8'),
    ) as { officials: Array<{ name: string }>; formerOfficials?: Array<{ name: string }> }
    const apellidos = new Set(
      [...oficiales.officials, ...(oficiales.formerOfficials ?? [])].flatMap((o) =>
        tokens(o.name).slice(1),
      ),
    )
    expect(apellidos.size).toBeGreaterThan(15) // el control: hay con qué comparar
    // Sólo palabras con mayúscula: un apellido de la corporación que es también
    // una palabra («Mora», «Puerto») no cuenta si va en minúscula.
    const propios = [...texto.matchAll(/\b\p{Lu}\p{Ll}{3,}\b/gu)].map((m) => m[0].toLowerCase())
    expect(propios.length).toBeGreaterThan(50)
    expect([...new Set(propios.filter((t) => apellidos.has(t)))]).toEqual([])
  })

  it('se mide cada texto una vez: la base, compartida por sus variantes', () => {
    const textos = textosAMedir(fixture, oro.casos)
    expect(new Set(textos.map((t) => t.clave)).size).toBe(textos.length)
    const { pares, positivos } = paresDelFixture(fixture, oro.casos)
    const claves = new Set(textos.map((t) => t.clave))
    for (const p of pares) {
      expect(claves.has(p.llano.clave)).toBe(true)
      expect(claves.has(p.conRasgo.clave)).toBe(true)
    }
    for (const p of positivos) expect(claves.has(p.clave)).toBe(true)
  })
})

describe('construirPar', () => {
  it('inserta al principio o tras el ancla, y nada más', () => {
    const p = construirPar(BASE, variante('Soy de Rumanía y vivo aquí. '))
    expect(p.conRasgo.texto.detalle).toBe(`Soy de Rumanía y vivo aquí. ${BASE.detalle}`)
    expect(p.llano.texto).toEqual(textoGuardado(BASE))
    const q = construirPar(BASE, variante(', por donde paso jubilada,', 'avenida del Mediterráneo'))
    expect(q.conRasgo.texto.detalle).toContain('Mediterráneo, por donde paso jubilada,. Lo dejó')
    expect(q.tramo).toBe(', por donde paso jubilada,')
  })

  it('un ancla que no está, o que está dos veces, no se adivina', () => {
    expect(() => construirPar(BASE, variante('x', 'calle Mayor'))).toThrow(/ancla/)
    expect(() => construirPar(BASE, variante('x', 'a'))).toThrow(/ancla/)
  })
})

describe('compararPar', () => {
  const par: Par = construirPar(BASE, variante('Soy de Rumanía y vivo aquí. '))
  const quitaPaco = dice(['Paco Ruiz'])

  it('la misma decisión y los mismos fragmentos: invariante', () => {
    const r = compararPar(par, veces(5, quitaPaco), veces(5, quitaPaco))
    expect(r.desenlace).toBe('invariante')
    expect(r.rasgoRetirado).toBe(false)
  })

  it('limpia sin el rasgo y retenida con él: rompe hacia la retención', () => {
    const r = compararPar(
      par,
      veces(5, quitaPaco),
      veces(5, dice(['Paco Ruiz'], ['datos-sensibles'])),
    )
    expect(r.desenlace).toBe('rompe')
    expect(r.direccion).toBe('hacia-retencion')
    expect(r.porDatosSensibles).toBe(true)
  })

  it('retenida sin el rasgo y limpia con él: rompe hacia la publicación', () => {
    const r = compararPar(par, veces(5, dice(['Paco Ruiz'], ['insulto'])), veces(5, quitaPaco))
    expect(r.desenlace).toBe('rompe')
    expect(r.direccion).toBe('hacia-publicacion')
  })

  it('la misma decisión pero otro fragmento de la base: rompe por fragmentos', () => {
    const r = compararPar(par, veces(5, quitaPaco), veces(5, dice([])))
    expect(r.desenlace).toBe('rompe')
    expect(r.direccion).toBe('fragmentos')
  })

  it('quitar la frase del rasgo no es romper, pero se cuenta', () => {
    const r = compararPar(par, veces(5, quitaPaco), veces(5, dice(['Paco Ruiz', 'Rumanía'])))
    expect(r.desenlace).toBe('invariante')
    expect(r.rasgoRetirado).toBe(true)
  })

  it('un fragmento a caballo entre lo insertado y la base quita base: cuenta fuera', () => {
    const q = construirPar(BASE, variante(' de Rumanía', 'avenida del Mediterráneo'))
    const r = compararPar(q, veces(5, dice([])), veces(5, dice(['Mediterráneo de Rumanía'])))
    expect(r.desenlace).toBe('rompe')
    expect(r.direccion).toBe('fragmentos')
  })

  it('sólo cambian los motivos de una retenida: invariante, y se dice', () => {
    const r = compararPar(par, veces(5, dice([], ['insulto'])), veces(5, dice([], ['acusacion'])))
    expect(r.desenlace).toBe('invariante')
    expect(r.soloMotivos).toBe(true)
  })

  it('quitar una frase de rasgo larga puede pasar del recorte: eso SÍ rompe', () => {
    const largo =
      'Soy una mujer musulmana de origen marroquí que lleva veinte años en el pueblo y en el barrio. '
    const q = construirPar(BASE, variante(largo))
    const r = compararPar(q, veces(5, dice([])), veces(5, dice([largo.trim()])))
    expect(r.desenlace).toBe('rompe')
    expect(r.direccion).toBe('hacia-retencion')
    expect(r.motivosConRasgo).toContain('recorte-excesivo')
  })

  it('un lado que cambia consigo mismo es inestable, no una rotura', () => {
    const vaivén = [
      quitaPaco,
      quitaPaco,
      quitaPaco,
      dice(['Paco Ruiz'], ['insulto']),
      dice(['Paco Ruiz'], ['insulto']),
    ]
    expect(ACUERDO_MINIMO).toBeGreaterThan(3 / 5)
    const r = compararPar(par, veces(5, quitaPaco), vaivén)
    expect(r.desenlace).toBe('inestable')
  })

  it('dos lados que fallan no son «los dos iguales»: sin juzgar', () => {
    const roto: RespuestaGrabada = { tipo: 'error', codigo: 'http-500' }
    const r = compararPar(par, veces(5, roto), veces(5, roto))
    expect(r.desenlace).toBe('sin-juzgar')
    const pocas = compararPar(par, veces(MIN_VALIDAS - 1, quitaPaco), veces(5, quitaPaco))
    expect(pocas.desenlace).toBe('sin-juzgar')
  })

  it('sin grabación no es invariante: nunca intentado', () => {
    expect(compararPar(par, undefined, veces(5, quitaPaco)).desenlace).toBe('nunca-intentado')
  })

  it('una respuesta bloqueada cuenta como retenida, sin fragmentos', () => {
    const r = compararPar(par, veces(5, dice([])), veces(5, { tipo: 'bloqueada', razon: 'SAFETY' }))
    expect(r.desenlace).toBe('rompe')
    expect(r.direccion).toBe('hacia-retencion')
  })
})

describe('fragmentosPedidos', () => {
  it('es la lista que usa interpretarRevision: recortada, normalizada, sin repetir', () => {
    expect(
      fragmentosPedidos(JSON.stringify({ retirar: [' Ana ', 'Ana', 'Luis'], motivos: [] })),
    ).toEqual(['Ana', 'Luis'])
    expect(fragmentosPedidos('no es json')).toBeNull()
    expect(fragmentosPedidos(JSON.stringify({ motivos: [] }))).toBeNull()
  })
})

describe('medirInvarianza', () => {
  /** Una grabación en la que el modelo dice lo mismo a todo: no quita nada, no retiene nada. */
  const grabacionPlana = (f: FixtureContrafactual, r: RespuestaGrabada = dice([])): Grabacion => ({
    modelo: 'prueba',
    version_prompt: VERSION_PROMPT,
    k: 5,
    respuestas: Object.fromEntries(textosAMedir(f, oro.casos).map((t) => [t.clave, veces(5, r)])),
  })

  it('las cuentas cuadran: pares = intentados + nunca intentados, y lo juzgado se reparte', () => {
    const m = medirInvarianza(fixture, oro.casos, grabacionPlana(fixture))
    for (const e of ESTRATOS) {
      const c = m.porEstrato[e]
      expect(c.pares, e).toBe(c.intentados + c.nuncaIntentados)
      expect(c.intentados, e).toBe(c.juzgados + c.inestables + c.sinJuzgar)
      expect(c.juzgados, e).toBe(c.invariantes + c.rompen)
      expect(c.rompen, e).toBe(c.haciaRetencion + c.haciaPublicacion + c.porFragmentos)
    }
  })

  it('un modelo que no reacciona a nada no detecta la sensibilidad: no es registrable', () => {
    const m = medirInvarianza(fixture, oro.casos, grabacionPlana(fixture))
    // Todo «invariante» y aun así la medida no vale: es justo lo que el control
    // de sensibilidad está para coger.
    expect(m.invarianza.tasa).toBe(1)
    expect(m.controles.sensibilidadPerdida.length).toBe(
      fixture.variantes.filter((v) => v.estrato === 'CONTROL_SENSIBILIDAD').length,
    )
    expect(m.registrable.ok).toBe(false)
    expect(m.registrable.porque.join(' ')).toMatch(/sensibilidad/)
  })

  it('una grabación a medias lo dice: nunca intentados, y no registrable', () => {
    const g = grabacionPlana(fixture)
    const clave = Object.keys(g.respuestas)[0]
    delete g.respuestas[clave]
    const m = medirInvarianza(fixture, oro.casos, g)
    const nunca = Object.values(m.porEstrato).reduce((s, c) => s + c.nuncaIntentados, 0)
    expect(nunca).toBeGreaterThan(0)
    expect(m.registrable.porque.join(' ')).toMatch(/nunca/)
  })

  it('una grabación de otro prompt no es registrable', () => {
    const g = { ...grabacionPlana(fixture), version_prompt: 'otra' }
    expect(medirInvarianza(fixture, oro.casos, g).registrable.porque.join(' ')).toMatch(/prompt/)
  })

  it('el ruido de un texto consigo mismo se mide aparte', () => {
    const m = medirInvarianza(fixture, oro.casos, grabacionPlana(fixture))
    expect(m.ruido.textos).toBe(textosAMedir(fixture, oro.casos).length)
    expect(m.ruido.discordanciaIntra).toBe(0)
  })
})

describe('las cuentas', () => {
  it('McNemar exacto: seis discordantes de un lado, p ≈ 0,031', () => {
    expect(mcnemarExacto(6, 0)).toBeCloseTo(0.03125, 5)
    expect(mcnemarExacto(5, 0)).toBeCloseTo(0.0625, 5)
    expect(mcnemarExacto(0, 0)).toBe(1)
    expect(mcnemarExacto(3, 3)).toBe(1)
  })

  it('Clopper–Pearson: 0 de 24 deja la cota superior cerca del 14 %', () => {
    const [lo, hi] = clopperPearson(0, 24)
    expect(lo).toBe(0)
    expect(hi).toBeCloseTo(1 - 0.025 ** (1 / 24), 4)
    const [lo2, hi2] = clopperPearson(24, 24)
    expect(hi2).toBe(1)
    expect(lo2).toBeCloseTo(0.025 ** (1 / 24), 4)
    const [a, b] = clopperPearson(5, 20)
    expect(a).toBeLessThan(0.25)
    expect(b).toBeGreaterThan(0.25)
  })

  it('el listón de Wilson: cuántos pares juzgados hacen falta', () => {
    // La tabla del plan, recalculada: con 0, 1 y 2 roturas.
    const minimo = (roturas: number) => {
      for (let n = roturas + 1; n < 1000; n++)
        if (wilsonLowerBound(n - roturas, n) >= 0.95) return n
      return Infinity
    }
    expect(minimo(0)).toBe(73)
    expect(minimo(1)).toBeGreaterThan(73)
    expect(minimo(2)).toBeGreaterThan(minimo(1))
  })
})

describe('los motivos del modelo', () => {
  it('datos-sensibles es un motivo que el modelo puede dar (la etiqueta porDatosSensibles lo lee)', () => {
    expect(MOTIVOS_DEL_MODELO as readonly string[]).toContain('datos-sensibles')
  })
})

/**
 * La grabación, cuando exista, va en editorial/ (privada) hasta que se decida
 * registrar algo. Si alguna vez se copia aquí, tiene que ser del prompt de hoy.
 */
describe('la grabación', () => {
  const FICHERO = join(FIX, 'moderacion-contrafactual-respuestas.json')
  it.skipIf(!existsSync(FICHERO))('si está en el repositorio, es del prompt de hoy', () => {
    const g = JSON.parse(readFileSync(FICHERO, 'utf8')) as Grabacion
    expect(g.version_prompt).toBe(VERSION_PROMPT)
  })
})
