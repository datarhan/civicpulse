import { describe, it, expect } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'

/**
 * `pleno-speakers/` fuera de git, por las dos puertas.
 *
 * Cada `pleno-speakers/<plenoId>.json` que escribe `identify-pleno-speakers`
 * asigna a cada voz de un pleno el concejal que la huella vocal le acredita,
 * con los tres mejores cosenos: también a la secretaria, al interventor y al
 * público. Y `<plenoId>.identified.txt` es la transcripción con esos nombres.
 * Nada de eso se publica sin que un curador lo firme, y el repositorio es
 * público desde el 2026-09-08.
 *
 * EL FALLO, visto el 2026-11-23: el directorio no estaba en el .gitignore.
 * Sólo lo dejaba fuera que el cron de /hallazgos añade rutas concretas; un
 * `git add -A` desde el checkout del curador lo habría subido entero.
 */
describe('pleno-speakers/ · nunca en git', () => {
  it('el .gitignore lo cubre, también la transcripción con nombres', () => {
    for (const f of ['pleno-speakers/abc123.json', 'pleno-speakers/abc123.identified.txt']) {
      const r = spawnSync('git', ['check-ignore', '-q', f])
      // 0 = ignorado; 1 = no ignorado; 128 = git no pudo contestar. Sólo el 0
      // es un visto bueno: un 128 leído como «falso» no miraría nada.
      expect(r.status, `${f} no está cubierto por el .gitignore`).toBe(0)
    }
  })

  it('no hay nada rastreado bajo pleno-speakers/', () => {
    const todo = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean)
    // Que miró algo: un `git ls-files` vacío daría el visto bueno sin mirar.
    expect(todo.length).toBeGreaterThan(100)
    expect(todo.filter((f) => f.startsWith('pleno-speakers/'))).toEqual([])
  })
})
