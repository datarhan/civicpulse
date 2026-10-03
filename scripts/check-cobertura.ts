#!/usr/bin/env tsx
/**
 * check:cobertura — ¿la tabla de cobertura sigue siendo lo que producen los
 * trozos servidos?
 *
 *   npm run check:cobertura
 *   npm run check:cobertura -- --json
 *
 * Hermana de `check:dea`, y por su mismo motivo: el manifiesto congela una
 * tabla cruzada, y el que la diga no prueba que sea verdad. Aquí se rehace
 * desde los ficheros que el lector se descarga y se compara.
 *
 * Comprueba tres cosas, que son las tres reglas de esta superficie:
 *
 *   1. **Se reproduce.** El cruce del manifiesto sale de los trozos, fila a
 *      fila. Si el chunker cambia y nadie rederiva, la página publica una
 *      cobertura que ya no es la suya.
 *   2. **El universo cuadra.** La suma del cruce tiene que ser exactamente el
 *      total de items publicados. Un denominador que no cuadra convierte un
 *      porcentaje en un adorno.
 *   3. **Hay algo que medir.** Un cruce vacío daría un 100 % perfecto y una
 *      guarda verde. Se exige que «con corpus» y «sin corpus» tengan filas: un
 *      desglose degenerado es una casilla con otro nombre. La tercera, «no
 *      consta», puede quedarse a cero con todo en orden —que las pasadas
 *      dejen anotado contra qué cotejaron es lo deseable—, así que no se exige:
 *      se imprime.
 *
 * Anti-hueco: imprime cuántas comprobaciones hizo. Un «todo en orden» de un
 * gate que no evaluó nada es la suite verde que no medía nada.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import {
  CASILLA_DE_DESENLACE,
  resumirSinDatos,
  desenlaceDeCotejo,
  esMarcaDePasada,
  clasificarProcedencia,
  type ResumenSinDatos,
} from '../src/scraper/claim-verdicts'

const DIR = resolve('public/data/pleno-claims')
const INDEX = join(DIR, 'index.json')

type Casilla = { total: number } & ResumenSinDatos

/** Los campos de una casilla, del mismo `Record` que la llena. */
const CAMPOS = ['total', ...Object.values(CASILLA_DE_DESENLACE)] as const

interface Item {
  claim?: { type?: string; topic?: string }
  verification?: {
    verdict?: string
    checkedAgainst?: unknown[]
    derivedBy?: unknown[]
    source?: string
  }
}

const problemas: string[] = []
let comprobaciones = 0
const fail = (m: string) => problemas.push(m)

function main(): void {
  const asJson = process.argv.includes('--json')

  if (!existsSync(INDEX)) {
    process.stderr.write(`[check-cobertura] falta ${INDEX} — corre npm run chunk-pleno-claims\n`)
    process.exit(1)
  }
  const manifest = JSON.parse(readFileSync(INDEX, 'utf8')) as {
    totals?: {
      items?: number
      byVerdict?: Record<string, number>
      cobertura?: {
        porTipo: Record<string, Casilla>
        porTema: Record<string, Casilla>
        corpus: Record<string, number>
      }
      sinDatosPorque?: ResumenSinDatos
    }
  }
  const totals = manifest.totals
  const cob = totals?.cobertura
  if (!cob) {
    process.stderr.write(
      '[check-cobertura] el manifiesto no trae `totals.cobertura`: /laboratorio/cobertura no ' +
        'tendría nada que medir. Corre npm run chunk-pleno-claims.\n',
    )
    process.exit(1)
  }

  // Rehacer el cruce desde los trozos SERVIDOS, no desde el monolito: es lo
  // que el lector recibe, ya pasado por la puerta editorial.
  const items: Item[] = readdirSync(DIR)
    .filter((f) => f.endsWith('.json') && f !== 'index.json')
    .flatMap((f) => (JSON.parse(readFileSync(join(DIR, f), 'utf8')) as { items: Item[] }).items)

  if (items.length === 0) {
    process.stderr.write(
      '[check-cobertura] no leí un solo item de los trozos: no estoy comprobando nada, que no ' +
        'es lo mismo que estar todo bien\n',
    )
    process.exit(1)
  }

  const rehecho = { porTipo: {}, porTema: {}, corpus: {} } as {
    porTipo: Record<string, Casilla>
    porTema: Record<string, Casilla>
    corpus: Record<string, number>
  }
  const casilla = (t: Record<string, Casilla>, k: string) =>
    (t[k] ??= { total: 0, sinCorpus: 0, comprobadoSinHallar: 0, noConsta: 0 })

  for (const it of items) {
    const listados = it.verification?.checkedAgainst ?? []
    for (const c of listados) {
      if (typeof c === 'string') rehecho.corpus[c] = (rehecho.corpus[c] ?? 0) + 1
    }
    const campo = CASILLA_DE_DESENLACE[desenlaceDeCotejo(it.verification)]
    for (const [tabla, clave] of [
      [rehecho.porTipo, it.claim?.type],
      [rehecho.porTema, it.claim?.topic],
    ] as const) {
      if (typeof clave !== 'string') continue
      const cel = casilla(tabla, clave)
      cel.total += 1
      cel[campo] += 1
    }
  }

  // 1 · se reproduce
  for (const eje of ['porTipo', 'porTema'] as const) {
    const publicado = cob[eje]
    const nuestro = rehecho[eje]
    const claves = new Set([...Object.keys(publicado), ...Object.keys(nuestro)])
    for (const k of claves) {
      comprobaciones += 1
      const a = publicado[k]
      const b = nuestro[k]
      if (!a || !b) {
        fail(`${eje}.${k}: está en ${a ? 'el manifiesto' : 'los trozos'} y no en el otro`)
        continue
      }
      for (const campo of CAMPOS) {
        if (a[campo] !== b[campo]) {
          fail(`${eje}.${k}.${campo}: manifiesto ${a[campo]} · trozos ${b[campo]}`)
        }
      }
    }
  }
  for (const k of new Set([...Object.keys(cob.corpus), ...Object.keys(rehecho.corpus)])) {
    comprobaciones += 1
    if (cob.corpus[k] !== rehecho.corpus[k]) {
      fail(`corpus.${k}: manifiesto ${cob.corpus[k] ?? '—'} · trozos ${rehecho.corpus[k] ?? '—'}`)
    }
  }

  // 2 · el universo cuadra
  comprobaciones += 1
  const sumaTipo = Object.values(cob.porTipo).reduce((a, v) => a + v.total, 0)
  if (totals?.items != null && sumaTipo !== totals.items) {
    fail(`la suma de porTipo (${sumaTipo}) no es el total publicado (${totals.items})`)
  }
  // Y cada celda reparte su total entero: sin esto, una casilla que faltara
  // del manifiesto —la de «no consta», en uno escrito por un chunker viejo—
  // se leería como un cero y el resto seguiría cuadrando contra los trozos.
  for (const eje of ['porTipo', 'porTema'] as const) {
    for (const [k, c] of Object.entries(cob[eje])) {
      comprobaciones += 1
      const partes = c.sinCorpus + c.comprobadoSinHallar + c.noConsta
      if (partes !== c.total)
        fail(`${eje}.${k}: sus tres casillas suman ${partes} y su total es ${c.total}`)
    }
  }
  comprobaciones += 1
  const desglose = totals?.sinDatosPorque
  const sinDatos = totals?.byVerdict?.['sin-datos']
  const sumaDesglose = desglose
    ? desglose.sinCorpus + desglose.comprobadoSinHallar + desglose.noConsta
    : null
  if (desglose && sinDatos != null && sumaDesglose !== sinDatos) {
    fail(`sinDatosPorque suma ${sumaDesglose} y sin-datos es ${sinDatos}`)
  }
  comprobaciones += 1
  const rehechoDesglose = resumirSinDatos(items.map((i) => i.verification ?? {}))
  if (
    desglose &&
    Object.values(CASILLA_DE_DESENLACE).some((campo) => rehechoDesglose[campo] !== desglose[campo])
  ) {
    fail(
      `sinDatosPorque no se reproduce: manifiesto ${JSON.stringify(desglose)} · ` +
        `trozos ${JSON.stringify(rehechoDesglose)}`,
    )
  }

  // 2.bis · nada sin clasificar
  //
  // La lista es blanca: un nombre no declarado NO cuenta como corpus, así que
  // la cifra se queda corta —el lado seguro— pero se queda corta EN SILENCIO si
  // nadie lo dice. Aquí se dice, y sale 1: o es un corpus y se declara en
  // CORPUS_IDS, o es una pasada y se declara en PASADAS.
  comprobaciones += 1
  const desconocidos = new Set<string>()
  for (const it of items) {
    for (const d of clasificarProcedencia(it.verification?.checkedAgainst).desconocidos) {
      desconocidos.add(d)
    }
  }
  if (desconocidos.size > 0) {
    fail(
      `procedencia sin clasificar: ${[...desconocidos].join(', ')} — decláralo en CORPUS_IDS ` +
        'o en PASADAS (claim-verdicts.ts). Mientras tanto no cuenta como corpus.',
    )
  }

  // 3 · hay algo que medir
  //
  // Y que lo que se cuenta como evidencia SEA evidencia: si sólo quedaran
  // marcas de pasada —verdict-engine y compañía—, la página diría «cotejadas
  // contra algún corpus» sin que hubiera un solo corpus detrás.
  comprobaciones += 1
  const nombresDeCorpus = Object.keys(cob.corpus).filter((k) => !esMarcaDePasada(k))
  if (nombresDeCorpus.length === 0) {
    fail(
      'no queda ni un corpus de datos: todo lo consultado son marcas de pasada, que dicen cómo ' +
        'se llegó al veredicto y no contra qué se comprobó',
    )
  }
  comprobaciones += 1
  const totalSinCorpus = Object.values(cob.porTipo).reduce((a, v) => a + v.sinCorpus, 0)
  const totalConCorpus = Object.values(cob.porTipo).reduce((a, v) => a + v.comprobadoSinHallar, 0)
  const totalNoConsta = Object.values(cob.porTipo).reduce((a, v) => a + v.noConsta, 0)
  if (totalSinCorpus === 0 || totalConCorpus === 0) {
    fail(
      'el desglose es degenerado (todo en una casilla): la página pintaría una cobertura ' +
        'perfecta o nula sin haber medido nada',
    )
  }

  if (asJson) {
    process.stdout.write(
      JSON.stringify({ comprobaciones, problemas, items: items.length }, null, 2) + '\n',
    )
    process.exit(problemas.length ? 1 : 0)
  }

  process.stdout.write(
    `[check-cobertura] ${comprobaciones} comprobación(es) sobre ${items.length} declaración(es) ` +
      `servida(s) · ${totalConCorpus} con corpus · ${totalSinCorpus} sin · ` +
      `${totalNoConsta} sin constancia de lo consultado\n`,
  )
  for (const p of problemas) process.stderr.write(`  ✗ ${p}\n`)
  if (problemas.length) {
    process.stderr.write(
      `[check-cobertura] ${problemas.length} problema(s). Si el chunker cambió, rederiva con ` +
        '`npm run chunk-pleno-claims`.\n',
    )
    process.exit(1)
  }
}

main()
