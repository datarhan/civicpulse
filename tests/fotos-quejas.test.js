import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  fotosAPodar,
  fotosATraer,
  sinFotosFallidas,
  traeFotos,
  urlDeFoto,
} from '../scripts/fotos-quejas.mjs'

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

/**
 * Las fotos se anonimizan ahora en el servidor del bot y viven en su volumen. La
 * instantánea enlaza las que ya están anonimizadas, y el workflow las trae del bot
 * con el mismo token que `quejas.json`. Lo que hay que probar es lo que no debe
 * entrar en el repositorio público: una ruta que no es la de una foto de queja,
 * una respuesta que no es un JPEG aunque llegue con 200, y un enlace a una foto que
 * no se pudo traer, que la web pintaría como una imagen rota.
 */
const conFoto = (id) => ({
  service_request_id: id,
  photo: `/data/quejas-photos/${id.toLowerCase()}.jpg`,
})

describe('y trae las fotos que la instantánea enlaza y aún no están', () => {
  it('lista la foto enlazada que falta, y no la que ya está (el control)', () => {
    const instantanea = {
      stats: { total: 2 },
      items: [conFoto('Q-NUEVA001'), conFoto('Q-YAESTA01')],
    }
    expect(fotosATraer(instantanea, ['q-yaesta01.jpg'])).toEqual(['q-nueva001'])
  })

  it('ignora toda ruta que no sea /data/quejas-photos/q-….jpg, y la foto de otra queja', () => {
    const items = [
      { service_request_id: 'Q-RARA0001', photo: '/data/quejas-photos/../../bot.db' },
      { service_request_id: 'Q-RARA0002', photo: 'https://otro.sitio/q-rara0002.jpg' },
      { service_request_id: 'Q-RARA0003', photo: '/data/quejas-photos/q-otra0003.jpg' },
      { service_request_id: 'Q-SINFOTO1' },
    ]
    expect(fotosATraer({ stats: { total: 4 }, items }, [])).toEqual([])
  })

  it('una instantánea sin items es un error', () => {
    expect(() => fotosATraer({ stats: { total: 0 } }, [])).toThrow(/items/)
  })

  it('la URL de cada foto sale de la del export, y otra forma de URL es un error', () => {
    expect(urlDeFoto('https://munigraph-ribarroja.fly.dev/export/quejas.json', 'q-nueva001')).toBe(
      'https://munigraph-ribarroja.fly.dev/export/quejas-photos/q-nueva001.jpg',
    )
    expect(() => urlDeFoto('https://bot.test/otra-cosa', 'q-nueva001')).toThrow(/quejas\.json/)
  })

  it('guarda sólo lo que es de verdad un JPEG, pidiéndolo con el token en la cabecera', async () => {
    const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
    const escritas = new Map()
    const pedidas = []
    const fetchImpl = async (url, init) => {
      pedidas.push({ url, auth: new Headers(init?.headers).get('authorization') })
      if (url.endsWith('/q-buena001.jpg'))
        return new Response(JPEG, { status: 200, headers: { 'content-type': 'image/jpeg' } })
      if (url.endsWith('/q-html0001.jpg'))
        return new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } })
      if (url.endsWith('/q-falsa001.jpg'))
        return new Response('no soy un jpeg', {
          status: 200,
          headers: { 'content-type': 'image/jpeg' },
        })
      return new Response('not found', { status: 404 })
    }
    const r = await traeFotos(['q-buena001', 'q-html0001', 'q-falsa001', 'q-ida00001'], {
      exportUrl: 'https://bot.test/export/quejas.json',
      token: 'secreto',
      fetchImpl,
      escribe: (id, bytes) => escritas.set(id, bytes),
    })
    expect(r.traidas).toEqual(['q-buena001'])
    expect(r.fallidas.map((f) => f.id)).toEqual(['q-html0001', 'q-falsa001', 'q-ida00001'])
    expect([...escritas.keys()]).toEqual(['q-buena001'])
    expect(pedidas).toHaveLength(4)
    expect(pedidas.every((p) => p.auth === 'Bearer secreto')).toBe(true)
  })

  it('una foto que no se pudo traer deja de enlazarse: la web no pinta una imagen rota', () => {
    const instantanea = {
      stats: { total: 2 },
      items: [conFoto('Q-BUENA001'), conFoto('Q-IDA00001')],
    }
    const r = sinFotosFallidas(instantanea, ['q-ida00001'])
    expect(r.items[0].photo).toBe('/data/quejas-photos/q-buena001.jpg')
    expect('photo' in r.items[1]).toBe(false)
    expect(instantanea.items[1].photo, 'modificó la instantánea que recibió').toBeTruthy()
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
    // `git diff` no ve los ficheros nuevos: una foto recién traída no está en el
    // índice, y con sólo `git diff --quiet` el paso diría «no changes» y no la subiría.
    expect(commit).toContain(
      'git status --porcelain -- public/data/quejas.json public/data/quejas-photos',
    )
    expect(commit).not.toContain('git diff --quiet')
    expect(commit).toContain('git add -- public/data/quejas.json')
    // La carpeta puede no existir —git no guarda carpetas vacías— y `git add` con
    // una ruta que no casa con nada falla en seco, así que va con su guarda.
    expect(commit).toContain(
      'if [ -d public/data/quejas-photos ]; then git add -A -- public/data/quejas-photos; fi',
    )
  })

  it('el paso de las fotos lleva la URL y el token del export, para poder traerlas', () => {
    const corre = WORKFLOW.indexOf('node scripts/fotos-quejas.mjs')
    const paso = WORKFLOW.slice(WORKFLOW.lastIndexOf('- name:', corre), corre)
    expect(paso).toContain('EXPORT_URL: ${{ vars.BOT_EXPORT_URL }}')
    expect(paso).toContain('EXPORT_TOKEN: ${{ secrets.BOT_EXPORT_TOKEN }}')
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
