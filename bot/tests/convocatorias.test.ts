import { describe, it, expect } from 'vitest'
import {
  CONVOCATORIAS,
  estadoDe,
  avisosDe,
  runConvocatoriasOnce,
  proximoHito,
  type Convocatoria,
} from '../src/services/convocatorias.ts'

/**
 * Avisos de convocatorias — el calendario que hoy vive en la cabeza del operador.
 *
 * Cuatro plazos de 2026-2027 caen en meses distintos y ninguno avisa solo: NLnet
 * cierra el 3 de noviembre, el European Press Prize ABRE ese mismo día laborable
 * y dura seis semanas, Sigma abre en diciembre, y las líneas grandes ni siquiera
 * se pueden mirar sin entidad jurídica. Perder uno cuesta un año entero, porque
 * todos son anuales.
 *
 * DOS REGLAS, y las dos son sobre honestidad más que sobre fechas:
 *
 * 1 · Una fecha APROXIMADA no se pinta como exacta. «Sigma abre ~diciembre» es
 *     lo que sabemos, y un aviso que diga «abre el 1 de diciembre» inventa una
 *     precisión que nadie ha comprobado. Se avisa antes y se dice que hay que
 *     confirmarlo en la web.
 *
 * 2 · Lo que NO se puede solicitar todavía se dice con su MOTIVO. «Pluralistic
 *     Media: 1,4 M€» sin decir «necesita entidad jurídica» es un aviso que
 *     manda a perder una tarde. El motivo ES el aviso.
 *
 * Y una regla de contenido: aquí sólo entran HECHOS PÚBLICOS —el nombre de la
 * convocatoria, sus fechas y su URL, tal y como los publica quien convoca—.
 * Ni el importe que pedimos, ni la prioridad, ni la estrategia. Este código se
 * despliega en Fly y vive en un repositorio público desde el 8-09-2026.
 */

const enero = (d: number, h = 9) => new Date(Date.UTC(2026, 0, d, h, 0, 0))

const FIJA: Convocatoria = {
  id: 'prueba-cierra',
  nombre: 'Prueba que cierra',
  url: 'https://example.org',
  cierra: '2026-01-31T11:00:00Z',
  precision: 'exacta',
}

describe('estadoDe', () => {
  it('dice abierta mientras el plazo corre', () => {
    expect(estadoDe(FIJA, enero(10)).estado).toBe('abierta')
  })

  it('dice cerrada cuando el plazo ya pasó', () => {
    expect(estadoDe(FIJA, new Date(Date.UTC(2026, 1, 2))).estado).toBe('cerrada')
  })

  it('dice aun-no cuando todavía no ha abierto', () => {
    const futura: Convocatoria = { ...FIJA, id: 'f', abre: '2026-03-01T00:00:00Z' }
    expect(estadoDe(futura, enero(10)).estado).toBe('aun-no')
  })

  // Regla 2: un bloqueo sin motivo manda a perder una tarde.
  it('marca bloqueada y NO la da por abierta cuando falta la entidad', () => {
    const grande: Convocatoria = {
      ...FIJA,
      id: 'g',
      cierra: undefined,
      requiere: 'entidad jurídica en la UE27',
    }
    const e = estadoDe(grande, enero(10))
    expect(e.estado).toBe('bloqueada')
    expect(e.motivo).toContain('entidad')
  })
})

describe('avisosDe', () => {
  it('avisa en los hitos de cierre y en ninguna otra fecha', () => {
    // cierra el 31 → 30 días antes es el 1 de enero
    expect(avisosDe([FIJA], enero(1)).map((a) => a.dias)).toEqual([30])
    expect(avisosDe([FIJA], enero(24)).map((a) => a.dias)).toEqual([7])
    expect(avisosDe([FIJA], enero(30)).map((a) => a.dias)).toEqual([1])
    // un día cualquiera no genera ruido
    expect(avisosDe([FIJA], enero(12))).toEqual([])
  })

  it('avisa el día que una convocatoria abre', () => {
    const abre: Convocatoria = {
      id: 'a',
      nombre: 'Abre hoy',
      url: 'https://example.org',
      abre: '2026-01-15T00:00:00Z',
      precision: 'exacta',
    }
    const a = avisosDe([abre], enero(15))
    expect(a).toHaveLength(1)
    expect(a[0].clase).toBe('abre')
  })

  // Regla 1: una fecha aproximada avisa ANTES y se declara aproximada.
  it('una fecha aproximada avisa con más antelación y se dice aproximada', () => {
    const aprox: Convocatoria = {
      id: 'ap',
      nombre: 'Abre por diciembre',
      url: 'https://example.org',
      abre: '2026-01-15T00:00:00Z',
      precision: 'aproximada',
    }
    const a = avisosDe([aprox], enero(1))
    expect(a).toHaveLength(1)
    expect(a[0].texto).toMatch(/aproximada/i)
  })

  it('no inventa un aviso para una convocatoria ya cerrada', () => {
    expect(avisosDe([FIJA], new Date(Date.UTC(2026, 5, 1)))).toEqual([])
  })

  // Un dato guardado que no llega al mensaje es decoración. La `nota` es donde
  // vive lo que hay que saber ANTES de sentarse a escribir —que NLnet exige un
  // registro de prompts, que Public Discourse admite tres piezas aparte—, y si
  // no viaja en el aviso da igual haberlo averiguado.
  it('la nota viaja dentro del aviso', () => {
    const conNota: Convocatoria = { ...FIJA, id: 'n', nota: 'exige un registro de prompts' }
    expect(avisosDe([conNota], enero(1))[0].texto).toContain('exige un registro de prompts')
  })
})

describe('una convocatoria ya presentada', () => {
  const PRESENTADA: Convocatoria = {
    ...FIJA,
    id: 'ya-enviada',
    presentada: { fecha: '2026-01-05', ref: 'REF-123' },
  }

  // El plazo NO deja de importar al enviar —NLnet admite reenvío hasta el
  // cierre—, así que callar del todo perdería la última oportunidad de
  // corregir. Pero repetir cinco veces «cierra en N días» sobre algo que ya
  // está enviado es ruido, y el ruido es lo que enseña a ignorar los avisos.
  it('avisa menos veces, no deja de avisar', () => {
    expect(avisosDe([PRESENTADA], enero(1))).toEqual([]) // el hito de 30 se calla
    expect(avisosDe([PRESENTADA], enero(24)).map((a) => a.dias)).toEqual([7])
    expect(avisosDe([PRESENTADA], enero(30)).map((a) => a.dias)).toEqual([1])
  })

  // Y lo que diga tiene que decir que ya está enviada, con su referencia: un
  // «cierra en 7 días» a secas manda a rellenar otra vez un formulario hecho.
  it('el aviso dice que ya se envió, y con qué referencia', () => {
    const [a] = avisosDe([PRESENTADA], enero(24))
    expect(a.texto).toMatch(/presentada/i)
    expect(a.texto).toContain('REF-123')
    expect(a.texto).toMatch(/reenv/i)
  })

  it('estadoDe la distingue de una simplemente abierta', () => {
    expect(estadoDe(PRESENTADA, enero(10)).estado).toBe('presentada')
    expect(estadoDe(FIJA, enero(10)).estado).toBe('abierta')
  })
})

describe('runConvocatoriasOnce', () => {
  it('manda un DM por administrador cuando hay algo que decir', async () => {
    const enviados: { a: number; texto: string }[] = []
    const r = await runConvocatoriasOnce(
      [1, 2],
      async (a, texto) => void enviados.push({ a, texto }),
      enero(1),
      [FIJA],
    )
    expect(r.avisos).toBe(1)
    expect(enviados.map((e) => e.a)).toEqual([1, 2])
    expect(enviados[0].texto).toContain('Prueba que cierra')
  })

  it('no manda nada un día sin hitos', async () => {
    const enviados: unknown[] = []
    const r = await runConvocatoriasOnce([1], async () => void enviados.push(1), enero(12), [FIJA])
    expect(r.avisos).toBe(0)
    expect(enviados).toEqual([])
  })

  // Sin administradores configurados esto no puede funcionar, y decirlo es
  // distinto de no tener nada que decir: es el defecto `r?.findings ?? []`.
  it('distingue «no hay administradores» de «no hay avisos»', async () => {
    const r = await runConvocatoriasOnce([], async () => {}, enero(1), [FIJA])
    expect(r.sinAdministradores).toBe(true)
    expect(r.avisos).toBe(1)
  })
})

describe('proximoHito', () => {
  // Sin esto el cron es indistinguible de estar muerto en cualquier día sin
  // hito, que son casi todos: sólo habla cuando hay algo que decir, y el
  // silencio se lee igual que un import que nunca cargó. Un arranque tiene que
  // DEMOSTRAR que hizo el trabajo — regla 2 de DATA_INTEGRITY.
  it('dice cuál es el siguiente aviso y cuándo', () => {
    // FIJA cierra el 31-01; el primer hito es el de 30 días, el 01-01.
    const r = proximoHito(new Date('2025-12-15T00:00:00Z'), [FIJA])
    expect(r).not.toBeNull()
    expect(r!.fecha).toBe('2026-01-01')
    expect(r!.id).toBe('prueba-cierra')
  })

  // Con el plazo ya pasado no queda hito ninguno, y `null` es la respuesta
  // honesta: inventar una fecha para tener algo que imprimir sería peor que
  // callar.
  it('devuelve null si no queda ninguno, en vez de inventarse uno', () => {
    expect(proximoHito(new Date('2026-06-01T00:00:00Z'), [FIJA])).toBeNull()
  })
})

describe('el calendario que se despliega', () => {
  it('cada convocatoria lleva nombre, URL y precisión declarada', () => {
    expect(CONVOCATORIAS.length).toBeGreaterThan(0)
    for (const c of CONVOCATORIAS) {
      expect(c.nombre, `${c.id} sin nombre`).toBeTruthy()
      expect(c.url, `${c.id} sin URL`).toMatch(/^https:\/\//)
      expect(['exacta', 'aproximada'], `${c.id}`).toContain(c.precision)
    }
  })

  // La regla de contenido, comprobada y no sólo prometida en un comentario.
  it('no lleva importes nuestros ni estrategia: esto se despliega en público', () => {
    const texto = JSON.stringify(CONVOCATORIAS)
    expect(texto).not.toMatch(/30\.?000|40\.?000|80\.?000/)
    expect(texto).not.toMatch(/prioridad|estrategia|salario|salary/i)
  })

  // Una convocatoria sin fechas tiene exactamente DOS motivos legítimos, y hay
  // que distinguirlos: o está BLOQUEADA —y entonces dice qué le falta— o está
  // CONTINUAMENTE abierta —y entonces no hay ventana que recordar—. Sin una de
  // las dos, una fila sin fechas es silencio, y el silencio se lee como «aquí
  // no hay nada que hacer», que es lo contrario de lo que significa en Goteo.
  it('toda convocatoria sin fecha dice si está bloqueada o si es continua', () => {
    for (const c of CONVOCATORIAS) {
      if (c.abre || c.cierra) continue
      expect(
        Boolean(c.requiere) || Boolean(c.continua),
        `${c.id} no tiene fechas y no dice si le falta algo o si es continua`,
      ).toBe(true)
      expect(Boolean(c.requiere) && Boolean(c.continua), `${c.id} no puede ser las dos`).toBe(false)
    }
  })

  // Y el corolario que importa al lector del DM: una bloqueada nunca se anuncia
  // como si se pudiera pedir hoy.
  it('ninguna bloqueada genera un aviso', () => {
    const bloqueadas = CONVOCATORIAS.filter((c) => c.requiere)
    expect(bloqueadas.length).toBeGreaterThan(0)
    for (const c of bloqueadas) {
      for (const d of [0, 1, 7, 14, 30, 45, 200]) {
        const ahora = new Date(Date.UTC(2026, 11, 1) - d * 24 * 3600 * 1000)
        expect(avisosDe([c], ahora), `${c.id} avisó estando bloqueada`).toEqual([])
      }
    }
  })
})
