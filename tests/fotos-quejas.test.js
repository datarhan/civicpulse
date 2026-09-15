import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { fotosAPodar } from '../scripts/fotos-quejas.mjs'

/**
 * La poda de las fotos de quejas retiradas vive donde está la instantánea que
 * manda el bot de producción: en el workflow que la trae.
 *
 * Hasta ahora la hacía `npm run process-photos`, que compara contra la base de
 * datos que tenga a mano. En el portátil esa base es una copia del 2 de agosto,
 * así que una queja retirada con /olvidar en el bot de Fly nunca desaparecía de
 * ella y su foto seguía publicada. Aquí se compara contra `quejas.json` recién
 * traído: la foto de una queja que ya no está se borra en el mismo commit que la
 * queja.
 */
const snap = (ids, total = ids.length) => ({
  stats: { total },
  items: ids.map((id) => ({ service_request_id: id })),
})

describe('la poda de las fotos va contra la instantánea que manda el bot de producción', () => {
  it('poda la foto de una queja que ya no está, y deja la de una viva (el control)', () => {
    const r = fotosAPodar(snap(['Q-VIVA0001']), ['q-viva0001.jpg', 'q-ida00002.jpg', 'leeme.txt'])
    expect(r).toEqual({ podar: ['q-ida00002.jpg'], motivo: null })
  })

  it('con el listado truncado no poda nada: no se sabe cuáles siguen', () => {
    const r = fotosAPodar(snap(['Q-VIVA0001'], 2), ['q-ida00002.jpg'])
    expect(r).toEqual({ podar: [], motivo: 'listado parcial' })
  })

  it('una instantánea sin items es un error, no «poda todo»', () => {
    expect(() => fotosAPodar({ stats: { total: 0 } }, ['q-viva0001.jpg'])).toThrow(/items/)
  })

  it('sin ninguna queja publicada sí se podan todas', () => {
    expect(fotosAPodar(snap([]), ['q-ida00002.jpg']).podar).toEqual(['q-ida00002.jpg'])
  })
})

describe('y el workflow que trae quejas.json la ejecuta', () => {
  // Un script que nadie lanza es la clase de defecto que esto viene a cerrar: la
  // poda de antes existía y no la ejecutaba nada. Sin comentarios, porque dentro
  // de uno se puede nombrar el script sin llamarlo.
  const WORKFLOW = readFileSync(join(__dirname, '../.github/workflows/pull-quejas.yml'), 'utf8')
    .split('\n')
    .filter((l) => !/^\s*#/.test(l))
    .join('\n')

  it('poda DESPUÉS de traer la instantánea, y comitea la queja y su foto juntas', () => {
    const trae = WORKFLOW.indexOf('Pull snapshot')
    const poda = WORKFLOW.indexOf('node scripts/fotos-quejas.mjs')
    const comitea = WORKFLOW.indexOf('Commit diff')
    expect(trae, 'no encuentro el paso que trae quejas.json').toBeGreaterThan(-1)
    expect(poda, 'el workflow no ejecuta la poda').toBeGreaterThan(trae)
    expect(comitea).toBeGreaterThan(poda)
    const commit = WORKFLOW.slice(comitea)
    expect(commit).toContain(
      'git diff --quiet -- public/data/quejas.json public/data/quejas-photos',
    )
    expect(commit).toContain('git add -- public/data/quejas.json')
    // La carpeta puede no existir —git no guarda carpetas vacías— y `git add` con
    // una ruta que no casa con nada falla en seco, así que va con su guarda.
    expect(commit).toContain(
      'if [ -d public/data/quejas-photos ]; then git add -A -- public/data/quejas-photos; fi',
    )
  })

  it('no corre dos veces a la vez: dos /olvidar seguidos no se pisan el push', () => {
    // El bot lo lanza al confirmar cada /olvidar. Dos ejecuciones a la vez traerían
    // la misma instantánea y la segunda fallaría al empujar; en cola, la de detrás
    // trae la instantánea más nueva. Cancelar la que está en marcha dejaría un commit
    // a medias.
    const bloque = WORKFLOW.match(/^concurrency:\n((?:[ \t]+.*\n)+)/m)?.[1] ?? ''
    expect(bloque, 'pull-quejas.yml no declara concurrency').toMatch(/group:\s*pull-quejas\b/)
    expect(bloque).toMatch(/cancel-in-progress:\s*false/)
  })
})
