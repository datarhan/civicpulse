#!/usr/bin/env tsx
/**
 * check:competencias — ¿sigue el ayuntamiento diciendo lo que este mapa afirma?
 *
 *   npm run check:competencias
 *   npm run check:competencias -- --json
 *
 * `competencias.json` está congelado a propósito: `officials.json` se raspa
 * cada noche y derivar el nombre en render dejaría que un cron cambie qué
 * persona viva aparece junto a una cifra publicada. El precio de congelarlo es
 * que puede quedarse viejo, y eso es lo que esto vigila.
 *
 * Cuatro desenlaces, no dos, porque colapsar «no lo encontré» dentro de
 * «coincide» es el defecto que este repositorio ya pagó con `r?.findings ?? []`
 * — una comprobación que imprime su propio visto bueno sin haber comprobado
 * nada:
 *
 *   coincide            el cargo sigue literal en los portfolios de esa persona
 *   reformulado         está, con otra redacción. Aviso: la competencia no ha
 *                       cambiado de manos, pero alguien debe re-firmar
 *   desaparecido        esa persona ya no tiene ese cargo → sale 1
 *   oficial-inexistente el slug ya no está en officials.json → sale 1
 *
 * Y un SEGUNDO EJE, porque «¿sigue teniendo el cargo?» no es la única forma de
 * que una firma deje de valer. El 24-08-2026 esta guarda imprimió «22 de 22
 * coincide» mientras SIETE de esas filas no las pintaba nadie: `PanelMunicipal`
 * no tenía prop donde recibirlas y `Gestion.jsx` no cargaba el índice. Todas
 * conservaban su cargo, así que por este eje estaban impecables.
 *
 *   renderizado         alguna página la pinta, y esa página está cableada
 *   no-renderizado      hay página, pero la competencia no le llega → AVISA
 *   sin-pagina          ninguna página pinta esa clave → AVISA
 *
 * Los dos avisos NO salen 1, a propósito. Esto corre en `scrape-all.sh` y en
 * `cesel-entrega.yml`, y ahí el rojo detiene el despliegue de los DATOS; un
 * fallo de cableado del front no debe hacer eso. Quien reda por ello es
 * `tests/competencias-superficies.test.ts`, en CI. El recorrido lo comparten
 * los dos —`scripts/lib/competencias-superficies.ts`— para que no haya dos
 * copias de la misma pregunta, que es como una se queda vieja.
 *
 * Anti-hueco: si recorre cero asignaciones sale 1. Un «todo en orden» sobre un
 * fichero vacío es exactamente el gate que no mide nada.
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { validarCompetencias } from '../src/scraper/competencias'
import {
  cotejarSuperficie,
  leerFuentes,
  type Desenlace as DesenlaceSuperficie,
} from './lib/competencias-superficies'

const MAPA = resolve('public/data/competencias.json')
const OFICIALES = resolve('public/data/officials.json')
const PANEL = resolve('public/data/indicadores.json')

type Desenlace = 'coincide' | 'reformulado' | 'desaparecido' | 'oficial-inexistente'

interface Cotejo {
  clave: string
  oficial: string
  cargo: string
  desenlace: Desenlace
  detalle?: string
  /**
   * EJE APARTE, no un valor más de `desenlace`. Son dos preguntas distintas
   * —¿sigue teniendo el cargo? y ¿lo ve alguien?— y una fila puede fallar las
   * dos a la vez. Metidas en un solo campo, la segunda taparía a la primera y
   * volveríamos al defecto que esto viene a arreglar: un recuento que dice
   * menos de lo que sabe.
   */
  superficie: DesenlaceSuperficie
  detalleSuperficie?: string
}

/** Minúsculas, sin acentos y con espacios colapsados: para detectar reformulación. */
function normaliza(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function main(): void {
  const asJson = process.argv.includes('--json')
  for (const f of [MAPA, OFICIALES, PANEL]) {
    if (!existsSync(f)) {
      process.stderr.write(`[check-competencias] falta ${f}\n`)
      process.exit(1)
    }
  }

  const mapa = validarCompetencias(JSON.parse(readFileSync(MAPA, 'utf8')))
  const oficiales = JSON.parse(readFileSync(OFICIALES, 'utf8')) as {
    officials: Array<{ slug: string; name: string; portfolios?: string[] }>
  }
  const panel = JSON.parse(readFileSync(PANEL, 'utf8')) as {
    indicadores: Array<{ id: string }>
    municipales: Array<{ id: string }>
  }

  const porSlug = new Map(oficiales.officials.map((o) => [o.slug, o]))
  const fuentes = leerFuentes()
  const cotejos: Cotejo[] = []

  for (const a of mapa.asignaciones) {
    // Se calcula SIEMPRE, también para las filas que fallan el cotejo de
    // cargo: son dos preguntas independientes y saltarse la segunda porque la
    // primera ya falló es cómo se pierde la mitad del parte.
    const s = cotejarSuperficie(a.clave, panel, fuentes)
    const base = {
      clave: a.clave,
      oficial: a.oficial,
      cargo: a.cargo,
      superficie: s.desenlace,
      detalleSuperficie: s.detalle,
    }

    const o = porSlug.get(a.oficial)
    if (!o) {
      cotejos.push({
        ...base,
        desenlace: 'oficial-inexistente',
        detalle: 'el slug ya no está en officials.json',
      })
      continue
    }
    const carteras = o.portfolios ?? []
    if (carteras.includes(a.cargo)) {
      cotejos.push({ ...base, desenlace: 'coincide' })
      continue
    }
    const parecido = carteras.find((c) => normaliza(c) === normaliza(a.cargo))
    cotejos.push({
      ...base,
      desenlace: parecido ? 'reformulado' : 'desaparecido',
      detalle: parecido
        ? `ahora se escribe «${parecido}»`
        : `sus áreas hoy son: ${carteras.join(' · ') || '(ninguna)'}`,
    })
  }

  // Una clave con errata no se pintaría nunca y nadie lo notaría.
  const ids = new Set([
    ...panel.indicadores.map((i) => i.id),
    ...panel.municipales.map((m) => m.id),
  ])
  const clavesHuerfanas = [...mapa.asignaciones, ...mapa.sinAsignar]
    .map((x) => x.clave)
    .filter((c) => !ids.has(c))

  const cuenta = (d: Desenlace) => cotejos.filter((c) => c.desenlace === d).length
  const cuentaSup = (d: DesenlaceSuperficie) => cotejos.filter((c) => c.superficie === d).length
  const resumen = {
    recorridas: cotejos.length,
    coincide: cuenta('coincide'),
    reformulado: cuenta('reformulado'),
    desaparecido: cuenta('desaparecido'),
    'oficial-inexistente': cuenta('oficial-inexistente'),
    superficie: {
      renderizado: cuentaSup('renderizado'),
      'no-renderizado': cuentaSup('no-renderizado'),
      'sin-pagina': cuentaSup('sin-pagina'),
    },
    clavesHuerfanas,
  }

  if (asJson) {
    process.stdout.write(JSON.stringify({ resumen, cotejos }, null, 2) + '\n')
  } else {
    process.stdout.write(`competencias · ${resumen.recorridas} asignaciones recorridas\n`)
    process.stdout.write(
      `  cargo      · coincide ${resumen.coincide} · reformulado ${resumen.reformulado} · ` +
        `desaparecido ${resumen.desaparecido} · oficial-inexistente ${resumen['oficial-inexistente']}\n`,
    )
    process.stdout.write(
      `  superficie · renderizado ${resumen.superficie.renderizado} · ` +
        `no-renderizado ${resumen.superficie['no-renderizado']} · ` +
        `sin-pagina ${resumen.superficie['sin-pagina']}\n`,
    )
    for (const c of cotejos) {
      if (c.desenlace === 'coincide') continue
      process.stdout.write(
        `  [${c.desenlace}] ${c.clave} · ${c.oficial} · «${c.cargo}» — ${c.detalle}\n`,
      )
    }
    // AVISA, no bloquea: una fila firmada que no se pinta es un fallo de
    // cableado, no de datos, y esta guarda corre en la nocturna, cuyo rojo
    // detiene el despliegue de los datos. Quien reda por esto es
    // `tests/competencias-superficies.test.ts`, en CI.
    for (const c of cotejos) {
      if (c.superficie === 'renderizado') continue
      process.stdout.write(
        `  [${c.superficie}] ${c.clave} · «${c.cargo} · ${c.oficial}» firmado pero ` +
          `sin llegar a ningún lector — ${c.detalleSuperficie}\n`,
      )
    }
    for (const c of clavesHuerfanas) process.stdout.write(`  [clave-huerfana] ${c}\n`)
  }

  if (resumen.recorridas === 0) {
    process.stderr.write(
      '[check-competencias] cero asignaciones recorridas: no ha comprobado nada\n',
    )
    process.exit(1)
  }
  const rojo = resumen.desaparecido + resumen['oficial-inexistente'] + clavesHuerfanas.length > 0
  process.exit(rojo ? 1 : 0)
}

main()
