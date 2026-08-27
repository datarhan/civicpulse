#!/usr/bin/env tsx
/**
 * report:claim-coverage — ¿cuánto daría de sí construir un corpus nuevo?
 *
 *   npm run report:claim-coverage
 *   npm run report:claim-coverage -- --muestra 120
 *
 * NO construye ningún corpus. Lo dimensiona, que es lo que faltaba para poder
 * decidir.
 *
 * El motivo de que exista: 1.415 de las 2.011 afirmaciones numéricas se juzgan
 * con `checkedAgainst` vacío —el verificador no consultó nada— y la lectura
 * fácil es «hay 1.415 filas esperando un corpus». Al mirarlas, no: muchas no
 * son municipales ni son numéricas («assassinats en un sol dia», «Espanya en
 * 2004-2005 portarà aquesta iniciativa al Congrés»). Construir sobre la
 * etiqueta del tipo sería inferir desde el nombre del fichero, que es
 * exactamente el error que este repositorio ya se ha cobrado.
 *
 * Así que el informe tiene dos mitades y sólo una es automática:
 *
 *   · MECÁNICA — el cruce tipo × tema × (con corpus / sin corpus), y qué
 *     corpus se consultan hoy. Eso se puede contar.
 *   · A MANO — una muestra aleatoria ESTRATIFICADA y con semilla fija, para
 *     etiquetar una por una: ¿es comprobable en principio? El guion no
 *     clasifica eso. Que un modelo adivine la comprobabilidad es justo cómo un
 *     informe de dimensionado se convierte en una ficción, y el número que
 *     saldría de ahí es el que decidiría gastar semanas de trabajo.
 *
 * Lee el MONOLITO, no los trozos: la pregunta es sobre toda la tubería, no
 * sólo sobre lo que se publica. Por eso escribe en `editorial/`, que está
 * gitignorado — la muestra arrastra el literal de acusaciones que la puerta
 * editorial retiene, y ese texto no puede acabar bajo `public/`.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { esMarcaDePasada } from '../src/scraper/claim-verdicts'

const MONOLITO = resolve('public/data/pleno-claims-verified.json')
const SALIDA_DIR = resolve('editorial')
const SALIDA = join(SALIDA_DIR, 'cobertura-sizing.md')

/** Semilla fija: el informe tiene que reproducirse, o la muestra no es
 *  auditable. `Math.random()` haría que dos ejecuciones discrepen y nadie
 *  pueda comprobar el etiquetado de ayer. */
const SEMILLA = 20260827

/** LCG mínimo (Numerical Recipes). Determinista y suficiente para muestrear. */
function generador(semilla: number): () => number {
  let s = semilla >>> 0
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0
    return s / 4294967296
  }
}

interface Item {
  claim: { id?: string; type?: string; topic?: string; verbatim?: string; plenoDate?: string }
  verification: { verdict?: string; checkedAgainst?: unknown[] }
}

interface Casilla {
  total: number
  sinCorpus: number
  conCorpus: number
}

const casilla = (t: Record<string, Casilla>, k: string) =>
  (t[k] ??= { total: 0, sinCorpus: 0, conCorpus: 0 })

const pct = (n: number, d: number) => (d === 0 ? '—' : `${((100 * n) / d).toFixed(1)} %`)

function tabla(titulo: string, filas: Record<string, Casilla>): string {
  const orden = Object.entries(filas).sort((a, b) => b[1].sinCorpus - a[1].sinCorpus)
  const cabecera = `| ${titulo} | total | con corpus | **sin corpus** | % sin |\n| --- | ---: | ---: | ---: | ---: |`
  const cuerpo = orden
    .map(
      ([k, v]) =>
        `| ${k} | ${v.total} | ${v.conCorpus} | **${v.sinCorpus}** | ${pct(v.sinCorpus, v.total)} |`,
    )
    .join('\n')
  return `${cabecera}\n${cuerpo}`
}

function main(): void {
  if (!existsSync(MONOLITO)) {
    process.stderr.write(
      `[sizing] falta ${MONOLITO}. Corre \`npm run verify:pleno-claims -- --base-only\`.\n`,
    )
    process.exit(1)
  }
  const argMuestra = process.argv.indexOf('--muestra')
  const N_MUESTRA = argMuestra > -1 ? Number(process.argv[argMuestra + 1]) || 100 : 100

  const doc = JSON.parse(readFileSync(MONOLITO, 'utf8')) as { generatedAt: string; items: Item[] }
  const items = doc.items ?? []
  if (items.length === 0) {
    process.stderr.write('[sizing] el monolito no trae items: no hay nada que dimensionar\n')
    process.exit(1)
  }

  const porTipo: Record<string, Casilla> = {}
  const porTema: Record<string, Casilla> = {}
  const corpus: Record<string, number> = {}
  const huerfanas: Item[] = []

  for (const it of items) {
    const consultados = (it.verification?.checkedAgainst ?? []).filter(
      (c): c is string => typeof c === 'string',
    )
    const reales = consultados.filter((c) => !esMarcaDePasada(c))
    for (const c of consultados) corpus[c] = (corpus[c] ?? 0) + 1
    const vacio = consultados.length === 0
    if (vacio) huerfanas.push(it)
    for (const [t, k] of [
      [porTipo, it.claim?.type],
      [porTema, it.claim?.topic],
    ] as const) {
      if (typeof k !== 'string') continue
      const cel = casilla(t, k)
      cel.total += 1
      if (vacio) cel.sinCorpus += 1
      else cel.conCorpus += 1
    }
    void reales
  }

  // Corpus candidatos: instantáneas que el sitio ya publica y que el
  // verificador NO consulta. Es una lista DERIVADA, no escrita a mano — una
  // tabla a mano dentro de un informe contra el estancamiento se estanca ella
  // sola, que es el chiste que este repositorio ya ha contado dos veces.
  const consultadosReales = new Set(Object.keys(corpus).filter((c) => !esMarcaDePasada(c)))
  const publicadas = readdirSync(resolve('public/data'))
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''))
  const candidatos = publicadas.filter((n) => !consultadosReales.has(n))

  // Muestra ESTRATIFICADA por tipo: proporcional, con semilla, y sin que un
  // tipo grande se coma la muestra entera.
  const rnd = generador(SEMILLA)
  const porTipoHuerfanas: Record<string, Item[]> = {}
  for (const it of huerfanas) {
    const k = it.claim?.type ?? 'sin-tipo'
    ;(porTipoHuerfanas[k] ??= []).push(it)
  }
  const muestra: Item[] = []
  for (const [tipo, filas] of Object.entries(porTipoHuerfanas)) {
    const cuota = Math.max(1, Math.round((N_MUESTRA * filas.length) / huerfanas.length))
    const barajado = [...filas].sort(() => rnd() - 0.5)
    muestra.push(...barajado.slice(0, cuota))
    void tipo
  }

  const md = `# Dimensionado de la cobertura de comprobación

_Generado por \`npm run report:claim-coverage\` desde un monolito de
${doc.generatedAt}. Interno: vive en \`editorial/\`, que está gitignorado,
porque la muestra arrastra literales que la puerta editorial retiene._

**Este informe NO construye ningún corpus. Lo dimensiona.**

## 1 · Dónde está el hueco (mecánico)

De ${items.length} declaraciones, **${huerfanas.length}** se juzgaron sin
consultar nada (\`checkedAgainst\` vacío) — ${pct(huerfanas.length, items.length)}.

${tabla('tipo', porTipo)}

${tabla('tema', porTema)}

## 2 · Contra qué se coteja hoy

${Object.entries(corpus)
  .filter(([k]) => !esMarcaDePasada(k))
  .sort((a, b) => b[1] - a[1])
  .map(([k, n]) => `- \`${k}\` — ${n} consultas`)
  .join('\n')}

Marcas de pasada (no son fuentes, dicen cómo se llegó al veredicto):
${Object.entries(corpus)
  .filter(([k]) => esMarcaDePasada(k))
  .sort((a, b) => b[1] - a[1])
  .map(([k, n]) => `\`${k}\` ${n}`)
  .join(' · ')}

## 3 · Candidatos: publicamos esto y no lo consultamos

Derivado de \`public/data/*.json\` menos lo ya consultado. **No es una lista de
lo que hay que construir** — la mayoría no sirve como corpus de verificación.
Es dónde mirar.

${candidatos.map((c) => `- \`${c}\``).join('\n')}

## 4 · La parte que NO hace el guion: etiquetar a mano

La pregunta que decide todo —¿cuántas de esas ${huerfanas.length} son
comprobables *en principio*?— no la contesta un recuento, y un modelo
adivinándola convertiría este informe en una ficción. Abajo hay una muestra
aleatoria estratificada por tipo, con semilla fija (${SEMILLA}), para
etiquetar una a una:

- \`comprobable\` — existe un dato público que la confirmaría o la desmentiría
- \`no-municipal\` — habla de otra administración, de otro país o de historia
- \`no-numerica\` — el tipo está mal asignado; no hay cifra que comprobar
- \`infalsable\` — juicio, intención o retórica

Con la muestra etiquetada, la proporción por tipo multiplica el «sin corpus»
de la tabla 1 y da la estimación real, con su intervalo. Antes de eso, no hay
número que defender.

### Muestra (${muestra.length} filas)

| # | etiqueta ⟵ rellenar | tipo | tema | fecha | literal |
| ---: | --- | --- | --- | --- | --- |
${muestra
  .map(
    (it, i) =>
      `| ${i + 1} |  | ${it.claim?.type ?? '—'} | ${it.claim?.topic ?? '—'} | ${
        it.claim?.plenoDate ?? '—'
      } | ${(it.claim?.verbatim ?? '').replace(/\s+/g, ' ').replace(/\|/g, '\\|').slice(0, 180)} |`,
  )
  .join('\n')}
`

  writeFileSync(SALIDA, md)
  process.stdout.write(
    `[sizing] ${items.length} declaración(es) · ${huerfanas.length} sin corpus ` +
      `(${pct(huerfanas.length, items.length)}) · muestra de ${muestra.length} para etiquetar\n` +
      `[sizing] → ${SALIDA}\n` +
      `[sizing] el informe NO estima nada todavía: la estimación sale de etiquetar la muestra.\n`,
  )
}

main()
