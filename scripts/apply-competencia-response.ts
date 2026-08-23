#!/usr/bin/env tsx
/**
 * competencia-reply — publicar la réplica de una persona nombrada.
 *
 *   npm run competencia-reply -- --oficial rafael-gomez-sanchez \
 *     --fecha 2026-09-01 --texto /ruta/al/texto.txt [--url https://…]
 *
 * `competencias.json` es curado y no lo escribe la automatización; ésta es la
 * única excepción, y por eso pasa por aquí en vez de por una edición directa:
 * el CLI revalida el snapshot ENTERO antes de escribir, así que una réplica no
 * puede colar un fichero inválido.
 *
 * La réplica se publica íntegra y sin editar. Este script no la resume.
 *
 * Se niega a registrar la réplica de alguien que no aparece en ninguna
 * asignación: si no lo hemos nombrado, no hay nada que replicar, y aceptarlo
 * publicaría un nombre nuevo por la puerta de atrás — justo lo que la lista
 * firmada existe para impedir.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { validarCompetencias, type Replica } from '../src/scraper/competencias'

const MAPA = resolve('public/data/competencias.json')

function arg(nombre: string): string | undefined {
  const i = process.argv.indexOf(`--${nombre}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

function main(): void {
  const oficial = arg('oficial')
  const fecha = arg('fecha')
  const rutaTexto = arg('texto')
  const url = arg('url')

  if (!oficial || !fecha || !rutaTexto) {
    process.stderr.write(
      'uso: competencia-reply -- --oficial <slug> --fecha <YYYY-MM-DD> --texto <ruta> [--url <url>]\n',
    )
    process.exit(1)
  }
  if (!existsSync(rutaTexto)) {
    process.stderr.write(`[competencia-reply] no existe ${rutaTexto}\n`)
    process.exit(1)
  }

  const snapshot = validarCompetencias(JSON.parse(readFileSync(MAPA, 'utf8')))
  const conocido = snapshot.asignaciones.some((a) => a.oficial === oficial)
  if (!conocido) {
    process.stderr.write(
      `[competencia-reply] «${oficial}» no aparece en ninguna asignación: no hay nada que replicar\n`,
    )
    process.exit(1)
  }

  const replica: Replica = {
    oficial,
    recibidaEl: fecha,
    texto: readFileSync(rutaTexto, 'utf8').trim(),
    ...(url ? { url } : {}),
  }
  const siguiente = { ...snapshot, replicas: [...snapshot.replicas, replica] }
  validarCompetencias(siguiente)
  writeFileSync(MAPA, JSON.stringify(siguiente, null, 2) + '\n')
  process.stdout.write(
    `[competencia-reply] réplica de ${oficial} publicada · ${siguiente.replicas.length} en total\n`,
  )
}

main()
