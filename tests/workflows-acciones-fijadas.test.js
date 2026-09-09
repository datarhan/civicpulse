import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Ninguna acción de terceros se referencia por una rama.
 *
 * `@master` y `@main` son referencias MÓVILES: apuntan hoy a un commit y mañana
 * a otro sin que nada nuestro cambie. Quien controle esa rama controla lo que
 * corre en nuestro CI — y en el caso que lo motivó, `bot-deploy.yml`, corre en
 * el mismo trabajo que `FLY_API_TOKEN`, o sea con permiso para desplegar lo que
 * quiera en la app del bot.
 *
 * Se coló el 2026-09-09 en el workflow de despliegue recién nacido, y era el
 * ÚNICO `@master` del repositorio: los otros once usan etiquetas. Una etiqueta
 * de versión (`@v5`) también se puede mover, pero la publica el dueño de la
 * acción como parte de su versionado; una rama de desarrollo no promete nada.
 *
 * Se permite `@vN` y `@vN.N` —la convención de la casa— y el SHA completo, que
 * es lo único inmutable de verdad.
 */
const WF = join(__dirname, '..', '.github', 'workflows')

const usos = readdirSync(WF)
  .filter((f) => /\.ya?ml$/.test(f))
  .flatMap((f) => {
    const texto = readFileSync(join(WF, f), 'utf8')
    return texto
      .split('\n')
      .filter((l) => !/^\s*#/.test(l))
      .map((l, i) => ({ fichero: f, linea: i + 1, l }))
      .filter((x) => /^\s*-?\s*uses:\s*\S+/.test(x.l))
      .map((x) => ({ ...x, ref: (x.l.match(/uses:\s*[^@\s]+@(\S+)/) || [])[1] }))
  })

const ACEPTABLE = /^(?:v\d+(?:\.\d+){0,2}|\d+\.\d+|[0-9a-f]{40})$/

describe('las acciones de los workflows están fijadas', () => {
  // Si esto queda vacío la prueba pasaría sola sin mirar nada.
  it('hay acciones que comprobar', () => {
    expect(usos.length).toBeGreaterThan(5)
  })

  it('ninguna apunta a una rama móvil', () => {
    const moviles = usos
      .filter((u) => u.ref && !ACEPTABLE.test(u.ref))
      .map((u) => `${u.fichero}:${u.linea} → @${u.ref}`)
    expect(
      moviles,
      'una rama apunta hoy a un commit y mañana a otro: fíjala al SHA o a una etiqueta de versión',
    ).toEqual([])
  })
})
