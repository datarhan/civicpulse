/**
 * monitor-health-cron.sh con dos que lo llaman (paso 0.4, 22-11-2026): el cron
 * de las 11:00 y el agente que lo lanza cuando la tubería de plenos termina. Lo
 * que se pide: que no corran dos a la vez, que el de las 11:00 espere a una
 * tubería VIVA y no a un cerrojo huérfano, y que el lanzado por la tubería no se
 * espere a sí mismo.
 *
 * El script de verdad, en un arenero donde `npm run` llega a un stub que apunta
 * qué corrió.
 */
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

const SCRIPT = resolve('scripts/monitor-health-cron.sh')
const cajas: string[] = []
const vivos: ChildProcess[] = []
afterAll(() => {
  for (const p of vivos) p.kill('SIGKILL')
  for (const c of cajas) rmSync(c, { recursive: true, force: true })
})

function arenero(): string {
  const dir = mkdtempSync(join(tmpdir(), 'monitor-cron-'))
  cajas.push(dir)
  mkdirSync(join(dir, 'scripts'), { recursive: true })
  copyFileSync(SCRIPT, join(dir, 'scripts/monitor-health-cron.sh'))
  writeFileSync(
    join(dir, 'scripts/stub.sh'),
    '#!/bin/bash\necho "$1" >> .corridas\n[ -n "${STUB_ESPERA:-}" ] && sleep "$STUB_ESPERA"\nexit 0\n',
  )
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({
      name: 'arenero',
      private: true,
      scripts: {
        'colas:rehacer': 'bash scripts/stub.sh colas:rehacer',
        'monitor:health': 'bash scripts/stub.sh monitor:health',
      },
    }),
  )
  return dir
}

function correr(dir: string, env: Record<string, string> = {}) {
  const out = execFileSync('/bin/bash', ['scripts/monitor-health-cron.sh'], {
    cwd: dir,
    encoding: 'utf8',
    env: { PATH: process.env.PATH!, HOME: dir, ...env },
  })
  return { out, corridas: leerCorridas(dir) }
}
const leerCorridas = (dir: string) =>
  existsSync(join(dir, '.corridas'))
    ? readFileSync(join(dir, '.corridas'), 'utf8').split('\n').filter(Boolean)
    : []

/** Un proceso cuya línea de órdenes dice hallazgos-pipeline.sh, como la de verdad. */
function tuberiaViva(): ChildProcess {
  // Dos órdenes: con una sola, bash hace exec y la línea pasa a ser «sleep 60».
  const p = spawn('/bin/bash', ['-c', 'sleep 60; true', 'scripts/hallazgos-pipeline.sh'], {
    stdio: 'ignore',
  })
  vivos.push(p)
  return p
}

function cerrojoDeTuberia(dir: string, pid: number | string) {
  mkdirSync(join(dir, 'scripts/.hallazgos-pipeline.lock'), { recursive: true })
  writeFileSync(join(dir, 'scripts/.hallazgos-pipeline.lock/pid'), `${pid}\n`)
}

describe('monitor-health-cron.sh · quién lo llama y cuándo', () => {
  it('sin nada en marcha, rehace las colas y corre el parte, y suelta su cerrojo', () => {
    const dir = arenero()
    const r = correr(dir)
    expect(r.corridas).toEqual(['colas:rehacer', 'monitor:health'])
    expect(existsSync(join(dir, 'scripts/.monitor-health.lock'))).toBe(false)
  })

  it('con otro parte en curso (cerrojo reciente), se va sin correr nada', () => {
    const dir = arenero()
    mkdirSync(join(dir, 'scripts/.monitor-health.lock'))
    const r = correr(dir)
    expect(r.out).toContain('ya hay un parte en curso')
    expect(r.corridas).toEqual([])
    // Y el cerrojo ajeno sigue ahí: no es suyo.
    expect(existsSync(join(dir, 'scripts/.monitor-health.lock'))).toBe(true)
  })

  it('un cerrojo de hace más de una hora es de un parte muerto: lo toma', () => {
    const dir = arenero()
    const lk = join(dir, 'scripts/.monitor-health.lock')
    mkdirSync(lk)
    const viejo = new Date(Date.now() - 2 * 3_600_000)
    utimesSync(lk, viejo, viejo)
    const r = correr(dir)
    expect(r.out).toContain('lo tomo')
    expect(r.corridas).toEqual(['colas:rehacer', 'monitor:health'])
  })

  it('un cerrojo con el pid de un parte muerto se toma en el acto, aunque sea reciente', () => {
    const dir = arenero()
    const lk = join(dir, 'scripts/.monitor-health.lock')
    mkdirSync(lk)
    const muerto = execFileSync('/bin/bash', ['-c', 'echo $$'], { encoding: 'utf8' }).trim()
    writeFileSync(join(lk, 'pid'), `${muerto}\n`)
    const r = correr(dir)
    expect(r.out).toContain('lo tomo')
    expect(r.corridas).toEqual(['colas:rehacer', 'monitor:health'])
    expect(existsSync(lk)).toBe(false)
  })

  it('dos a la vez: sólo uno corre el parte', async () => {
    const dir = arenero()
    const env = { PATH: process.env.PATH!, HOME: dir, STUB_ESPERA: '2' }
    const primero = spawn('/bin/bash', ['scripts/monitor-health-cron.sh'], {
      cwd: dir,
      env,
      stdio: 'ignore',
    })
    // Hasta que el primero tenga el cerrojo.
    for (let i = 0; i < 100 && !existsSync(join(dir, 'scripts/.monitor-health.lock')); i++)
      await new Promise((r) => setTimeout(r, 50))
    const segundo = correr(dir, { STUB_ESPERA: '0' })
    expect(segundo.out).toContain('ya hay un parte en curso')
    await new Promise((r) => primero.on('exit', r))
    expect(leerCorridas(dir).filter((c) => c === 'monitor:health')).toHaveLength(1)
  }, 30_000)

  it('el de las 11:00 espera a una tubería viva con su pid en el cerrojo', () => {
    const dir = arenero()
    const p = tuberiaViva()
    cerrojoDeTuberia(dir, p.pid!)
    const r = correr(dir)
    expect(r.out).toContain('la tubería de plenos está corriendo')
    expect(r.corridas).toEqual([])
  })

  it('un cerrojo de tubería cuyo pid ya no vive es de una pasada muerta: el parte sale', () => {
    const dir = arenero()
    const muerto = spawn('/bin/bash', ['-c', 'exit 0'])
    const pid = muerto.pid!
    return new Promise<void>((ok) =>
      muerto.on('exit', () => {
        cerrojoDeTuberia(dir, pid)
        const r = correr(dir)
        expect(r.out).not.toContain('está corriendo')
        expect(r.corridas).toEqual(['colas:rehacer', 'monitor:health'])
        ok()
      }),
    )
  })

  it('un pid vivo que no es la tubería tampoco la tiene en marcha', () => {
    const dir = arenero()
    const otro = spawn('/bin/bash', ['-c', 'sleep 60'], { stdio: 'ignore' })
    vivos.push(otro)
    cerrojoDeTuberia(dir, otro.pid!)
    expect(correr(dir).corridas).toEqual(['colas:rehacer', 'monitor:health'])
  })

  it('el que lanza la marca de la tubería no se espera a sí mismo', () => {
    const dir = arenero()
    const p = tuberiaViva()
    cerrojoDeTuberia(dir, p.pid!)
    const r = correr(dir, { PARTE_ORIGEN: 'hallazgos-pipeline' })
    expect(r.out).toContain('lanzado por hallazgos-pipeline')
    expect(r.corridas).toEqual(['colas:rehacer', 'monitor:health'])
  })
})
