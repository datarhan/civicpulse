#!/usr/bin/env tsx
/**
 * La opinión del editor de /eficiencia — el único camino de escritura de
 * `public/data/opiniones-editor.json`.
 *
 *   npm run opinion -- init
 *   npm run opinion -- publicar --de editorial/opiniones/<id>.json --confirmo-firma "<Nombre Apellido>"
 *   npm run opinion -- replica <id> --autor "<quien>" --texto-de <fichero> [--url <url>]
 *   npm run opinion -- corregir <id> --de <fichero con {titulo, cuerpo}> --motivo "<por qué>"
 *   npm run opinion -- retirar <id> --motivo "<por qué>"
 *   npm run opinion -- validar
 *
 * El borrador vive en `editorial/` (no se versiona, y `check:editorial` se
 * niega a verlo preparado para commit): una opinión que nombra a una persona
 * viva no entra en el repositorio público hasta que la firma alguien. Publicar
 * exige `--confirmo-firma` con el MISMO nombre que firma el borrador: publica
 * quien firma, no quien ejecuta el comando.
 *
 * Las reglas no viven aquí sino en `src/scraper/opinion-editor.ts`, puras y
 * probadas; este fichero sólo lee y escribe. Ver también `check:opiniones`.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  corregirOpinion,
  opinionesVacias,
  publicarOpinion,
  replicarOpinion,
  retirarOpinion,
  validarOpinionesSnapshot,
  type OpinionesSnapshot,
} from '../src/scraper/opinion-editor'
import { rechazarOpcionesDesconocidas } from '../src/scraper/opciones-cli'
import { nombresVisibles } from '../src/scraper/competencias'

const FICHERO = resolve('public/data/opiniones-editor.json')
const COMPETENCIAS = resolve('public/data/competencias.json')

function falla(msg: string, code = 1): never {
  process.stderr.write(`[opinion] ${msg}\n`)
  process.exit(code)
}

function opcion(nombre: string): string | undefined {
  const argv = process.argv.slice(2)
  const i = argv.indexOf(nombre)
  return i >= 0 ? argv[i + 1] : undefined
}

function posicionales(): string[] {
  const argv = process.argv.slice(2)
  const out: string[] = []
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      i++
      continue
    }
    out.push(argv[i])
  }
  return out
}

const hoy = () => new Date().toISOString().slice(0, 10)

function leer(): OpinionesSnapshot {
  if (!existsSync(FICHERO))
    falla('no existe opiniones-editor.json: ejecuta `npm run opinion -- init`')
  return validarOpinionesSnapshot(readFileSync(FICHERO, 'utf8'))
}

function escribir(s: OpinionesSnapshot): void {
  // Se valida otra vez justo antes de escribir: lo que llega al disco es lo
  // que el validador aceptó, no lo que el comando creyó construir.
  validarOpinionesSnapshot(JSON.stringify(s))
  writeFileSync(FICHERO, JSON.stringify(s, null, 2) + '\n')
}

function main(): void {
  rechazarOpcionesDesconocidas('opinion', {
    conValor: ['--de', '--confirmo-firma', '--autor', '--texto-de', '--url', '--motivo'],
  })
  const [orden, id] = posicionales()
  try {
    switch (orden) {
      case 'init': {
        if (existsSync(FICHERO)) falla('opiniones-editor.json ya existe; no se sobrescribe')
        writeFileSync(FICHERO, JSON.stringify(opinionesVacias(hoy()), null, 2) + '\n')
        process.stdout.write('[opinion] creado public/data/opiniones-editor.json, vacío\n')
        return
      }
      case 'validar': {
        const s = leer()
        process.stdout.write(
          `[opinion] válido: ${s.items.length} publicada(s), ${s.retiradas.length} retirada(s)\n`,
        )
        return
      }
      case 'publicar': {
        const de = opcion('--de')
        const firma = opcion('--confirmo-firma')
        if (!de || !firma)
          falla('uso: publicar --de <borrador.json> --confirmo-firma "<Nombre Apellido>"', 2)
        const comp = JSON.parse(readFileSync(COMPETENCIAS, 'utf8'))
        const borrador = JSON.parse(readFileSync(resolve(de), 'utf8'))
        // La misma ventana que apaga los nombres en la página (`npm run freeze:set`).
        const promesas = JSON.parse(readFileSync(resolve('public/data/promises.json'), 'utf8'))
        const nombresOn = nombresVisibles(promesas.frozenUntil ?? null, hoy())
        const s = publicarOpinion(leer(), borrador, firma, hoy(), comp, nombresOn)
        escribir(s)
        process.stdout.write(`[opinion] publicada «${borrador.id}», firmada por ${firma}\n`)
        return
      }
      case 'replica': {
        const autor = opcion('--autor')
        const textoDe = opcion('--texto-de')
        if (!id || !autor || !textoDe)
          falla('uso: replica <id> --autor "<quien>" --texto-de <fichero> [--url <url>]', 2)
        // Íntegra y verbatim: se lee de un fichero para que nadie la teclee
        // resumida en la línea de órdenes.
        const texto = readFileSync(resolve(textoDe), 'utf8').trim()
        const url = opcion('--url')
        escribir(
          replicarOpinion(
            leer(),
            id,
            { fecha: hoy(), autor, texto, ...(url ? { url } : {}) },
            hoy(),
          ),
        )
        process.stdout.write(`[opinion] réplica de ${autor} añadida a «${id}»\n`)
        return
      }
      case 'corregir': {
        const de = opcion('--de')
        const motivo = opcion('--motivo')
        if (!id || !de || !motivo)
          falla('uso: corregir <id> --de <fichero {titulo, cuerpo}> --motivo "<por qué>"', 2)
        const nuevo = JSON.parse(readFileSync(resolve(de), 'utf8'))
        escribir(corregirOpinion(leer(), id, nuevo, motivo, hoy()))
        process.stdout.write(
          `[opinion] «${id}» corregida; el texto anterior queda en su registro\n`,
        )
        return
      }
      case 'retirar': {
        const motivo = opcion('--motivo')
        if (!id || !motivo) falla('uso: retirar <id> --motivo "<por qué>"', 2)
        escribir(retirarOpinion(leer(), id, motivo, hoy()))
        process.stdout.write(`[opinion] «${id}» retirada, con su motivo\n`)
        return
      }
      default:
        falla('órdenes: init · validar · publicar · replica · corregir · retirar', 2)
    }
  } catch (e) {
    falla((e as Error).message)
  }
}

main()
