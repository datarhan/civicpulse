#!/usr/bin/env tsx
/**
 * CLI de curador: el registro de solicitudes de acceso a la información.
 *
 *   npm run solicitud -- add --clase informe-tecnico \
 *     --titulo "Los informes técnicos citados en las sesiones de 2026" \
 *     --fecha 2026-09-12 --registro REG-2026-004512
 *   npm run solicitud -- responder <id> --fecha 2026-10-05 --sentido parcial [--url …]
 *   npm run solicitud -- reclamar  <id> --fecha 2026-11-02 [--organo consell-cv] [--expediente …]
 *   npm run solicitud -- list
 *   npm run solicitud -- borrador [--clase informe-tecnico]   # redacta el escrito
 *
 * El registro es CURADO: lo escribe una persona porque una persona presentó el
 * escrito y una persona leyó la respuesta. No hay `--auto` ni lo habrá; que una
 * máquina rellenara esto sería inventar un hecho sobre una administración.
 *
 * El validador corre en cada escritura Y en cada lectura —defensa en
 * profundidad— y rechaza una clase que no sea pedible: de `contrato` y
 * `presupuesto` ya tenemos corpus, así que pedirlos sería pedir lo publicado y
 * debilitar las cuatro peticiones que sí hacen falta.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  validarRegistroSolicitudes,
  estadoDeSolicitud,
  frasePublica,
  ORGANOS_RECLAMACION,
  SENTIDOS_RESPUESTA,
  type RegistroSolicitudes,
  type SolicitudAcceso,
} from '../src/scraper/solicitud-acceso'
import { CLASES_PEDIBLES, type ClasePedible } from '../src/scraper/clase-documental'
import { generarBorradores } from './lib/solicitud-borrador'

const RUTA = resolve('public/data/solicitudes-acceso.json')

function flag(n: string): string | null {
  const i = process.argv.indexOf(`--${n}`)
  return i > -1 ? (process.argv[i + 1] ?? null) : null
}
const bail = (m: string): never => {
  process.stderr.write(`[solicitud] ${m}\n`)
  process.exit(2)
}

function cargar(): RegistroSolicitudes {
  const r = JSON.parse(readFileSync(RUTA, 'utf8')) as RegistroSolicitudes
  validarRegistroSolicitudes(r, CLASES_PEDIBLES)
  return r
}

function guardar(r: RegistroSolicitudes): void {
  validarRegistroSolicitudes(r, CLASES_PEDIBLES)
  r.generatedAt = new Date().toISOString()
  writeFileSync(RUTA, JSON.stringify(r, null, 2) + '\n')
}

function main(): void {
  const cmd = process.argv[2]
  const reg = cargar()
  const hoy = new Date().toISOString().slice(0, 10)

  if (cmd === 'borrador') {
    // Redactar NO es registrar. La carta sale a `editorial/` y el registro
    // sigue vacío: presentarla exige identificarse en la sede con certificado o
    // Cl@ve, que es un acto de una persona con su identidad civil.
    const pedida = flag('clase')
    if (pedida && !CLASES_PEDIBLES.includes(pedida as ClasePedible)) {
      bail(`«${pedida}» no es una clase pedible. Son: ${CLASES_PEDIBLES.join(', ')}`)
    }
    generarBorradores(pedida ? [pedida as ClasePedible] : CLASES_PEDIBLES)
    return
  }

  if (cmd === 'list' || !cmd) {
    process.stdout.write(`[solicitud] ${reg.items.length} solicitud(es)\n`)
    for (const s of reg.items) {
      process.stdout.write(`  ${s.id} · ${s.clase} · ${estadoDeSolicitud(s, hoy)}\n`)
      process.stdout.write(`    ${frasePublica(s, hoy)}\n`)
    }
    if (reg.items.length === 0) {
      process.stdout.write(
        '  (vacío: aún no se ha pedido nada. La página lo pinta como sin-solicitar,\n' +
          '   que NO es lo mismo que estar esperando respuesta.)\n',
      )
    }
    return
  }

  if (cmd === 'add') {
    const clase = flag('clase') ?? bail(`--clase, una de: ${CLASES_PEDIBLES.join(', ')}`)
    const titulo = flag('titulo') ?? bail('--titulo "qué se pidió" (≥20 car.)')
    const fecha = flag('fecha') ?? bail('--fecha YYYY-MM-DD (la de presentación)')
    const registro = flag('registro') ?? bail('--registro <nº de la sede electrónica>')
    const s: SolicitudAcceso = {
      id: `solicitud-${fecha.slice(0, 7)}-${clase}`,
      clase,
      titulo,
      presentadaEl: fecha,
      registro,
      respuesta: null,
      reclamacion: null,
    }
    reg.items.push(s)
    guardar(reg)
    process.stdout.write(`[solicitud] añadida ${s.id} · ${estadoDeSolicitud(s, hoy)}\n`)
    process.stdout.write(`  ${frasePublica(s, hoy)}\n`)
    return
  }

  const id = process.argv[3]
  const s = reg.items.find((x) => x.id === id)
  if (!s) bail(`no existe «${id}». Usa \`list\`.`)

  if (cmd === 'responder') {
    const fecha = flag('fecha') ?? bail('--fecha YYYY-MM-DD')
    const sentido = flag('sentido') ?? bail(`--sentido, uno de: ${SENTIDOS_RESPUESTA.join(', ')}`)
    const url = flag('url')
    s!.respuesta = { fecha, sentido: sentido as never, ...(url ? { url } : {}) }
    guardar(reg)
    process.stdout.write(
      `[solicitud] ${id} → ${estadoDeSolicitud(s!, hoy)}\n  ${frasePublica(s!, hoy)}\n`,
    )
    return
  }

  if (cmd === 'reclamar') {
    const fecha = flag('fecha') ?? bail('--fecha YYYY-MM-DD')
    // Por defecto el Consell: es el competente para un ayuntamiento valenciano.
    // El CTBG estatal no los lleva — 0 de 11.003 resoluciones casan con este.
    const organo = (flag('organo') ?? 'consell-cv') as (typeof ORGANOS_RECLAMACION)[number]
    const expediente = flag('expediente')
    s!.reclamacion = { fecha, organo, ...(expediente ? { expediente } : {}) }
    guardar(reg)
    process.stdout.write(
      `[solicitud] ${id} → ${estadoDeSolicitud(s!, hoy)}\n  ${frasePublica(s!, hoy)}\n`,
    )
    return
  }

  bail(`comando «${cmd}» desconocido. Usa: add | responder | reclamar | list`)
}

/**
 * El validador escribe mensajes pensados para quien está delante —«de contrato
 * y presupuesto ya tenemos corpus»— y sin esto salían enterrados en un volcado
 * de pila de Node. Un CLI de curador que contesta con un stack trace es un CLI
 * que se deja de usar.
 */
try {
  main()
} catch (e) {
  process.stderr.write(`${(e as Error).message}\n`)
  process.exit(1)
}
