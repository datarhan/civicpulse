#!/usr/bin/env tsx
/**
 * check:officials-corrections — ¿se aplicó cada corrección del padrón, y sigue
 * haciendo falta?
 *
 *   npm run check:officials-corrections
 *   npm run check:officials-corrections -- --json
 *   npm run check:officials-corrections -- --offline   # sólo el eje 1
 *
 * `officials-corrections.json` corrige el padrón raspado con lo que el acta ya
 * acordó y la web del ayuntamiento aún no recoge. Una corrección tiene dos
 * maneras de dejar de valer, y son preguntas distintas, así que van en dos
 * ejes y no en una lista:
 *
 * EJE 1 — ¿está aplicada en el fichero publicado? (sin red, bloquea)
 *   aplicada       `officials.json` la refleja: el alta está entre los vigentes
 *                  con su marca, la baja está entre los cesados y no entre los
 *                  vigentes, y el fichero es un punto fijo de la mezcla
 *   no-aplicada    no la refleja — una nocturna corrió sin la capa, o alguien
 *                  editó el publicado a mano → sale 1
 *
 * EJE 2 — ¿la página viva del ayuntamiento sigue necesitándola? (con red)
 *   vigente        la página sigue diciendo lo que la corrección corrige
 *   absorbida      la página se puso al día → hay que RETIRAR la entrada, y se
 *                  dice en voz alta: una corrección que afirma una discrepancia
 *                  que ya no existe es prosa vieja sobre una persona con nombre
 *   contradicha    la página dice lo contrario de lo que la corrección afirma
 *                  (la cesada vuelve con áreas; el alta figura con otro partido)
 *                  → sale 1
 *   no-comprobado  la página no contestó (403, 5xx, red). NO es un desenlace de
 *                  la corrección sino un estado de la ejecución: se imprime
 *                  «NO COMPROBADO» y sale 0, porque una avería ajena no tiñe la
 *                  nocturna — y tampoco firma un visto bueno. Es su estado
 *                  normal desde el 02-09-2026.
 *
 * Y la FUENTE de cada entrada, con la misma tricotomía que `check:citations`:
 * `viva` / `sin-fuente` (la URL clasifica muerta → sale 1) / `no-verificable`.
 *
 * Anti-hueco: si recorre cero entradas sale 1. Plegar «no lo encontré» dentro
 * de «coincide» es el defecto que este repositorio ya pagó con `r?.findings ?? []`.
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseCorporacion } from '../src/scraper/corporacion'
import {
  composeOfficialsSnapshot,
  rawFromPublished,
  validateOfficialsCorrections,
  type OfficialsCorrections,
  type OfficialsSnapshot,
} from '../src/scraper/officials-corrections'
import { classifyUrl } from './lib/doc-fetch'
import { fetchLiveHtml, SOURCE_URL } from './scrape-officials'
import { CORRECTIONS_PUBLIC_PATH } from './apply-officials-correction'

const CORRECTIONS = resolve('public/data/officials-corrections.json')
const OFFICIALS = resolve('public/data/officials.json')

type Aplicacion = 'aplicada' | 'no-aplicada'
type Vigencia = 'vigente' | 'absorbida' | 'contradicha' | 'no-comprobado'
type Fuente = 'viva' | 'sin-fuente' | 'no-verificable' | 'no-comprobado'

interface Cotejo {
  tipo: 'baja' | 'alta'
  slug: string
  aplicacion: Aplicacion
  detalleAplicacion?: string
  vigencia: Vigencia
  detalleVigencia?: string
  fuente: Fuente
  detalleFuente?: string
}

interface Vivo {
  slugs: Map<string, { party: string; portfolios: string[] }>
}

function leer<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T
}

/** Eje 1: el publicado, tal cual, contra lo que la mezcla produciría. */
function cotejarAplicacion(
  c: OfficialsCorrections,
  published: OfficialsSnapshot,
): { porSlug: Map<string, { aplicacion: Aplicacion; detalle?: string }>; puntoFijo: boolean } {
  const porSlug = new Map<string, { aplicacion: Aplicacion; detalle?: string }>()
  const vigentes = new Map(published.officials.map((o) => [o.slug, o]))
  const cesados = new Map((published.formerOfficials ?? []).map((f) => [f.slug, f]))
  for (const b of c.bajas) {
    const f = cesados.get(b.slug)
    if (vigentes.has(b.slug))
      porSlug.set(b.slug, {
        aplicacion: 'no-aplicada',
        detalle: 'sigue entre los vigentes del fichero publicado',
      })
    else if (!f)
      porSlug.set(b.slug, { aplicacion: 'no-aplicada', detalle: 'no está entre los cesados' })
    else if (f.until !== b.until)
      porSlug.set(b.slug, {
        aplicacion: 'no-aplicada',
        detalle: `el cesado lleva until ${f.until}, la corrección dice ${b.until}`,
      })
    else porSlug.set(b.slug, { aplicacion: 'aplicada' })
  }
  for (const a of c.altas) {
    const o = vigentes.get(a.slug)
    if (!o)
      porSlug.set(a.slug, { aplicacion: 'no-aplicada', detalle: 'no está entre los vigentes' })
    else if (o.correccion?.tipo !== 'alta')
      porSlug.set(a.slug, {
        aplicacion: 'no-aplicada',
        detalle: 'está entre los vigentes pero sin la marca de corrección',
      })
    else porSlug.set(a.slug, { aplicacion: 'aplicada' })
  }
  // El publicado tiene que ser un punto fijo de la mezcla: si alguien editó una
  // fila a mano, ninguna entrada lo nota y esto sí.
  const recompuesto = composeOfficialsSnapshot(rawFromPublished(published), c, {
    generatedAt: published.generatedAt,
    source: published.source,
    correctionsFile: CORRECTIONS_PUBLIC_PATH,
  })
  const quieto = (s: OfficialsSnapshot) =>
    JSON.stringify({
      count: s.count,
      composition: s.composition,
      officials: s.officials,
      formerOfficials: s.formerOfficials,
    })
  return { porSlug, puntoFijo: quieto(recompuesto) === quieto(published) }
}

/** Eje 2: la página viva, si contesta. */
async function leerVivo(): Promise<Vivo | { error: string }> {
  try {
    const html = await fetchLiveHtml()
    const parsed = parseCorporacion(html, { baseUrl: 'https://www.ribarroja.es' })
    if (parsed.length === 0)
      return { error: 'la página contestó pero no se parseó ningún concejal' }
    return {
      slugs: new Map(parsed.map((o) => [o.slug, { party: o.party, portfolios: o.portfolios }])),
    }
  } catch (err) {
    return { error: (err as Error).message }
  }
}

function cotejarVigencia(
  c: OfficialsCorrections,
  vivo: Vivo,
): Map<string, { vigencia: Vigencia; detalle?: string }> {
  const out = new Map<string, { vigencia: Vigencia; detalle?: string }>()
  for (const b of c.bajas) {
    const v = vivo.slugs.get(b.slug)
    if (!v) out.set(b.slug, { vigencia: 'absorbida', detalle: 'la página ya no la lista' })
    else if (v.portfolios.length > 0)
      out.set(b.slug, {
        vigencia: 'contradicha',
        detalle: `la página la lista con áreas delegadas: ${v.portfolios.join(' · ')}`,
      })
    else out.set(b.slug, { vigencia: 'vigente', detalle: 'la página sigue listándola' })
  }
  for (const a of c.altas) {
    const v = vivo.slugs.get(a.slug)
    if (!v) out.set(a.slug, { vigencia: 'vigente', detalle: 'la página sigue sin listarlo' })
    else if (v.party !== a.party)
      out.set(a.slug, {
        vigencia: 'contradicha',
        detalle: `la página lo lista por ${v.party}, la corrección dice ${a.party}`,
      })
    else out.set(a.slug, { vigencia: 'absorbida', detalle: 'la página ya lo lista' })
  }
  return out
}

async function main(): Promise<void> {
  const asJson = process.argv.includes('--json')
  const offline = process.argv.includes('--offline')
  if (!existsSync(OFFICIALS)) {
    process.stderr.write(`[check-officials-corrections] falta ${OFFICIALS}\n`)
    process.exit(1)
  }
  if (!existsSync(CORRECTIONS)) {
    // Sin fichero no hay nada que vigilar, y se dice: no es un «todo en orden».
    process.stdout.write(
      'officials-corrections · sin fichero de correcciones: nada que comprobar (no es un visto bueno)\n',
    )
    process.exit(0)
  }
  const c = validateOfficialsCorrections(leer(CORRECTIONS))
  const published = leer<OfficialsSnapshot>(OFFICIALS)

  const { porSlug, puntoFijo } = cotejarAplicacion(c, published)
  const vivo = offline ? { error: '--offline' } : await leerVivo()
  const vigencias = 'slugs' in vivo ? cotejarVigencia(c, vivo) : null

  const urls = [...new Set([...c.bajas, ...c.altas].map((e) => e.source.url))]
  const fuentes = new Map<string, { fuente: Fuente; detalle?: string }>()
  for (const url of urls) {
    if (offline) {
      fuentes.set(url, { fuente: 'no-comprobado', detalle: '--offline' })
      continue
    }
    const v = await classifyUrl(url)
    fuentes.set(url, {
      fuente: v.state === 'alive' ? 'viva' : v.state === 'dead' ? 'sin-fuente' : 'no-verificable',
      detalle: v.state === 'alive' ? undefined : (v.reason ?? String(v.status ?? '')),
    })
  }

  const cotejos: Cotejo[] = [
    ...c.bajas.map((b) => ({ tipo: 'baja' as const, slug: b.slug, url: b.source.url })),
    ...c.altas.map((a) => ({ tipo: 'alta' as const, slug: a.slug, url: a.source.url })),
  ].map(({ tipo, slug, url }) => {
    const ap = porSlug.get(slug)!
    const vg = vigencias?.get(slug)
    const fu = fuentes.get(url)!
    return {
      tipo,
      slug,
      aplicacion: ap.aplicacion,
      detalleAplicacion: ap.detalle,
      vigencia: vg?.vigencia ?? 'no-comprobado',
      detalleVigencia: vg?.detalle ?? ('error' in vivo ? vivo.error : undefined),
      fuente: fu.fuente,
      detalleFuente: fu.detalle,
    }
  })

  const cuenta = <K extends keyof Cotejo>(k: K, v: Cotejo[K]) =>
    cotejos.filter((x) => x[k] === v).length
  const resumen = {
    recorridas: cotejos.length,
    puntoFijo,
    aplicacion: {
      aplicada: cuenta('aplicacion', 'aplicada'),
      'no-aplicada': cuenta('aplicacion', 'no-aplicada'),
    },
    vigencia: {
      vigente: cuenta('vigencia', 'vigente'),
      absorbida: cuenta('vigencia', 'absorbida'),
      contradicha: cuenta('vigencia', 'contradicha'),
      'no-comprobado': cuenta('vigencia', 'no-comprobado'),
    },
    fuente: {
      viva: cuenta('fuente', 'viva'),
      'sin-fuente': cuenta('fuente', 'sin-fuente'),
      'no-verificable': cuenta('fuente', 'no-verificable'),
      'no-comprobado': cuenta('fuente', 'no-comprobado'),
    },
    pagina: 'slugs' in vivo ? SOURCE_URL : `NO COMPROBADO · ${vivo.error}`,
  }

  if (asJson) {
    process.stdout.write(JSON.stringify({ resumen, cotejos }, null, 2) + '\n')
  } else {
    process.stdout.write(
      `officials-corrections · ${resumen.recorridas} corrección(es) recorrida(s)\n`,
    )
    process.stdout.write(
      `  aplicación · aplicada ${resumen.aplicacion.aplicada} · no-aplicada ${resumen.aplicacion['no-aplicada']}` +
        ` · publicado ${puntoFijo ? 'es' : 'NO es'} punto fijo de la mezcla\n`,
    )
    process.stdout.write(
      `  vigencia   · vigente ${resumen.vigencia.vigente} · absorbida ${resumen.vigencia.absorbida} · ` +
        `contradicha ${resumen.vigencia.contradicha} · no-comprobado ${resumen.vigencia['no-comprobado']}` +
        ('slugs' in vivo ? '' : ` — NO COMPROBADO: ${vivo.error}`) +
        '\n',
    )
    process.stdout.write(
      `  fuente     · viva ${resumen.fuente.viva} · sin-fuente ${resumen.fuente['sin-fuente']} · ` +
        `no-verificable ${resumen.fuente['no-verificable']} · no-comprobado ${resumen.fuente['no-comprobado']}\n`,
    )
    for (const x of cotejos) {
      if (x.aplicacion !== 'aplicada')
        process.stdout.write(
          `  [no-aplicada] ${x.tipo} ${x.slug} — ${x.detalleAplicacion}; recompón con ` +
            `npm run roster-correction -- --apply (o raspa)\n`,
        )
      if (x.vigencia === 'absorbida')
        process.stdout.write(
          `  [absorbida] ${x.tipo} ${x.slug} — ${x.detalleVigencia}: la corrección ya no corrige nada. ` +
            `RETÍRALA: npm run roster-correction -- --retirar ${x.slug}\n`,
        )
      if (x.vigencia === 'contradicha')
        process.stdout.write(`  [contradicha] ${x.tipo} ${x.slug} — ${x.detalleVigencia}\n`)
      if (x.fuente === 'sin-fuente' || x.fuente === 'no-verificable')
        process.stdout.write(`  [${x.fuente}] ${x.tipo} ${x.slug} — ${x.detalleFuente}\n`)
    }
    if (!puntoFijo)
      process.stdout.write(
        '  [no-aplicada] el fichero publicado no es lo que la mezcla produce: alguien lo editó a mano ' +
          'o corrió una nocturna sin la capa; recompón con npm run roster-correction -- --apply\n',
      )
  }

  if (resumen.recorridas === 0) {
    process.stderr.write(
      '[check-officials-corrections] cero correcciones recorridas: no ha comprobado nada\n',
    )
    process.exit(1)
  }
  const rojo =
    resumen.aplicacion['no-aplicada'] +
      resumen.vigencia.contradicha +
      resumen.fuente['sin-fuente'] >
      0 || !puntoFijo
  process.exit(rojo ? 1 : 0)
}

main().catch((err) => {
  process.stderr.write(`[check-officials-corrections] ${(err as Error).message}\n`)
  process.exit(1)
})
