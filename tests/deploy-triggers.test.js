import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * ¿Se despliega lo que los bots empujan a main?
 *
 * GitHub no dispara workflows encadenados para los push hechos con el
 * GITHUB_TOKEN por defecto —protección antibucle—, así que un workflow que
 * comitea datos a main no provoca despliegue por sí solo. `deploy-vercel.yml`
 * lo arregla con un `workflow_run`, y esa lista se mantenía a mano.
 *
 * Hasta el 2026-08-12 tenía UNA entrada de seis. Las consecuencias no eran
 * teóricas: los cuatro ingestores de derecho de réplica comiteaban a main y no
 * desplegaban nada, de modo que un grupo ejercía su derecho, el bot comentaba
 * «✅ Réplica publicada · visible en …» y no era visible. La trampa ya estaba
 * escrita en el comentario del propio fichero; sólo se había arreglado para uno.
 *
 * Una lista de workflows escrita a mano dentro del control que evita ese fallo
 * es la broma que este repositorio ya se ha gastado dos veces, así que aquí se
 * vuelve a derivar del directorio.
 */
const WF = join(__dirname, '..', '.github', 'workflows')
const DEPLOY = 'deploy-vercel.yml'

const ficheros = readdirSync(WF).filter((f) => /\.ya?ml$/.test(f))
const leer = (f) => readFileSync(join(WF, f), 'utf8')
const nombreDe = (texto) => (texto.match(/^name:\s*(.+)$/m) ?? [])[1]?.trim()

/** ¿Este workflow empuja commits a la rama por defecto? */
const empujaAMain = (texto) => /^\s*(?:-\s*)?(?:run:\s*)?.*\bgit push\b/m.test(texto)

describe('workflows — todo lo que empuja a main dispara despliegue', () => {
  const deploy = leer(DEPLOY)
  const declarados = [...deploy.matchAll(/^\s+- '([^']+)'$/gm)].map((m) => m[1])

  it('el disparador declara alguna lista (si no, no está midiendo nada)', () => {
    expect(declarados.length).toBeGreaterThan(1)
  })

  it('cada workflow que hace git push está en la lista de workflow_run', () => {
    const pusheadores = ficheros
      .filter((f) => f !== DEPLOY)
      .filter((f) => empujaAMain(leer(f)))
      .map((f) => ({ fichero: f, nombre: nombreDe(leer(f)) }))

    // Anti-hueco: si el detector deja de encontrar pusheadores, este test
    // pasaría sin comprobar nada — que es justo el fallo que persigue.
    expect(pusheadores.length).toBeGreaterThan(3)

    const faltan = pusheadores.filter((p) => !declarados.includes(p.nombre))
    expect(
      faltan.map((p) => `${p.fichero} («${p.nombre}»)`),
      'empujan a main y no disparan despliegue',
    ).toEqual([])
  })

  it('la lista no nombra workflows que no existen', () => {
    const nombres = ficheros.map((f) => nombreDe(leer(f)))
    for (const d of declarados) expect(nombres, `«${d}» no es ningún workflow`).toContain(d)
  })
})

/**
 * Las banderas de lanzamiento viven a mano en DOS ficheros, y tienen que decir
 * lo mismo.
 *
 * `e2e.yml` las pone «por paridad con producción»: sin la bandera, la ruta no
 * se monta, su spec se SALTA sola —seis pruebas y una pasada de axe— y la
 * página llega a producción sin que nada la haya ejercitado en CI. Una suite
 * que se pone verde por no ejecutarse es exactamente el defecto que este
 * repositorio lleva pagando desde que se auditó, y la paridad que lo evita
 * estaba confiada a que alguien se acordara de editar los dos sitios.
 */
describe('workflows — las banderas de producción se prueban en CI', () => {
  const banderas = (texto) =>
    new Set([...texto.matchAll(/^\s+(VITE_ENABLE_[A-Z_]+):\s*'true'$/gm)].map((m) => m[1]))

  const enDeploy = banderas(leer(DEPLOY))
  const enE2e = banderas(leer('e2e.yml'))

  it('mide algo: el despliegue enciende alguna bandera', () => {
    expect(enDeploy.size).toBeGreaterThan(0)
  })

  it('toda bandera encendida en producción lo está también en e2e', () => {
    const soloProd = [...enDeploy].filter((b) => !enE2e.has(b))
    expect(
      soloProd,
      'se despliegan en producción y su spec se salta en CI — la ruta llega al público sin que nada la ejercite',
    ).toEqual([])
  })
})
