/**
 * El sorteo del conjunto de oro de la atribución (paso 1.1). Lo que se pide: que
 * sea reproducible con su semilla fija, que reparta entre sesiones sin mirar
 * quién habla, que la hoja sea ciega, que una hoja tocada o rellena con una
 * errata no pase por buena, y que un sorteo hecho no se pueda rehacer.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { poblacionEnDisco } from '../scripts/oro-atribucion'
import { wilsonLowerBound } from '../src/scraper/automation-policy'
import {
  BARRA,
  barraInalcanzable,
  pasaLaBarra,
  PUNTUADAS_OBJETIVO,
  celda,
  COLUMNAS_HOJA,
  enlaceAlSegundo,
  ETIQUETAS_ESCUCHA,
  hms,
  hojaOro,
  leerHojaOro,
  PALABRAS_MIN,
  palabras,
  PRIMERA_TANDA,
  SEGUNDA_TANDA,
  sortearOro,
  tandaDe,
  TAMANO_LISTA,
  type Candidata,
} from '../src/scraper/oro-atribucion'
import { SPEAKER_GROUPS } from '../src/scraper/pleno-votes'

const linea = (plenoId: string, i: number, texto?: string): Candidata => ({
  plenoId,
  fecha: '2026-01-01',
  turnoId: `${plenoId}@${i * 10}`,
  texto: texto ?? `frase número ${i} de ${plenoId} con ocho palabras`,
  desde: i * 10,
  hasta: i * 10 + 5,
  video: `https://www.youtube.com/watch?v=${plenoId}`,
})
// Una sesión muy larga y cuatro cortas: la larga no puede comerse la muestra.
const POBLACION = [
  ...Array.from({ length: 900 }, (_, i) => linea('larga', i)),
  ...['a', 'b', 'c', 'd'].flatMap((s) => Array.from({ length: 80 }, (_, i) => linea(s, i))),
]

describe('sortearOro', () => {
  it('300 en orden: 40 en la tanda 1, 60 en la 2, y el resto en bloques de reserva de 50', () => {
    const { elegidas } = sortearOro(POBLACION)
    expect(elegidas).toHaveLength(TAMANO_LISTA)
    expect(elegidas.map((e) => e.n)).toEqual(Array.from({ length: 300 }, (_, i) => i + 1))
    const cuenta = (t: number) => elegidas.filter((e) => e.tanda === t).length
    expect([cuenta(1), cuenta(2), cuenta(3), cuenta(4), cuenta(5), cuenta(6)]).toEqual([
      PRIMERA_TANDA,
      SEGUNDA_TANDA,
      50,
      50,
      50,
      50,
    ])
    expect([40, 41, 100, 101, 150, 151].map(tandaDe)).toEqual([1, 2, 2, 3, 3, 4])
  })

  it('reparte por turnos entre sesiones: la larga no se come la muestra', () => {
    const { elegidas } = sortearOro(POBLACION)
    // Cinco sesiones por turnos: 20 de cada en las primeras 100.
    expect(elegidas.slice(0, 100).filter((e) => e.plenoId === 'larga')).toHaveLength(20)
    expect(new Set(elegidas.filter((e) => e.tanda === 1).map((e) => e.plenoId)).size).toBe(5)
  })

  it('misma población, misma muestra con la semilla fija; da igual el orden de lectura', () => {
    const a = sortearOro(POBLACION).elegidas.map((e) => e.turnoId)
    expect(sortearOro([...POBLACION].reverse()).elegidas.map((e) => e.turnoId)).toEqual(a)
    expect(sortearOro(POBLACION, 8).elegidas.map((e) => e.turnoId)).not.toEqual(a)
  })

  it('una frase repetida en una sesión (bucle del transcriptor) es una sola escucha', () => {
    const bucle = Array.from({ length: 50 }, (_, i) =>
      linea('x', i, 'muchas gracias señor alcalde por la palabra hoy'),
    )
    const r = sortearOro([...bucle, ...POBLACION])
    expect(r.repetidas).toBe(49)
    expect(r.elegidas.filter((e) => e.plenoId === 'x')).toHaveLength(1)
  })
})

describe('la regla de la barra', () => {
  it('el mínimo de puntuadas para pasar es el que dice la cabecera, y es el mínimo', () => {
    for (const [errores, minimo] of [
      [0, 73],
      [1, 110],
      [2, 142],
      [3, 173],
      [4, 202],
    ]) {
      expect(pasaLaBarra(errores, minimo), `${errores} en ${minimo}`).toBe(true)
      expect(pasaLaBarra(errores, minimo - 1), `${errores} en ${minimo - 1}`).toBe(false)
    }
    // Lo que la decisión 4.2 daba por bueno no lo era: 99 de 100 no pasa.
    expect(wilsonLowerBound(99, 100)).toBeLessThan(BARRA)
    expect(pasaLaBarra(0, 0)).toBe(false)
  })

  it('el veredicto es en 150 puntuadas: ahí admite dos errores, y tres ya lo descartan', () => {
    expect(PUNTUADAS_OBJETIVO).toBe(150)
    expect(barraInalcanzable(2, 40, 260)).toBe(false)
    expect(barraInalcanzable(3, 40, 260)).toBe(true)
    // Con la lista acabándose antes de 150, cuenta lo que haya.
    expect(barraInalcanzable(0, 60, 13)).toBe(false)
    expect(barraInalcanzable(0, 60, 12)).toBe(true)
    expect(barraInalcanzable(1, 72, 0)).toBe(true)
  })
})

describe('la hoja', () => {
  const { elegidas } = sortearOro(POBLACION)
  const { tsv, huellas } = hojaOro(elegidas, ['cabecera'])

  it('lleva las columnas en orden y una huella por fila', () => {
    const cab = tsv.split('\n').find((l) => l.startsWith('n\t'))!
    expect(cab.split('\t')).toEqual([...COLUMNAS_HOJA])
    expect(huellas).toHaveLength(300)
    expect(new Set(huellas).size).toBe(300)
  })

  it('el enlace arranca cinco segundos antes, nunca antes del cero, y la hora va como en YouTube', () => {
    expect(enlaceAlSegundo('https://www.youtube.com/watch?v=x', 3236.3)).toBe(
      'https://www.youtube.com/watch?v=x&t=3231s',
    )
    expect(enlaceAlSegundo('https://youtu.be/x', 2)).toBe('https://youtu.be/x?t=0s')
    expect(hms(8199.9)).toBe('2:16:39')
    expect(hms(59)).toBe('0:00:59')
  })

  it('una frase que una hoja de cálculo tomaría por fórmula o por comilla lleva un espacio delante', () => {
    expect(celda('=SUMA(A1)')).toBe(' =SUMA(A1)')
    expect(celda('-10 euros menos')).toBe(' -10 euros menos')
    expect(celda('"entre comillas" dijo')).toBe(' "entre comillas" dijo')
    expect(celda('con\ttabulador\ny salto')).toBe('con tabulador y salto')
  })

  it('las etiquetas son los grupos de SPEAKER_GROUPS más cuatro que no lo son', () => {
    expect(ETIQUETAS_ESCUCHA.slice(0, SPEAKER_GROUPS.length)).toEqual([...SPEAKER_GROUPS])
    expect(ETIQUETAS_ESCUCHA.slice(SPEAKER_GROUPS.length)).toEqual([
      'no-concejal',
      'varias-voces',
      'no-distingo',
      'nadie-habla',
    ])
  })

  it('recién sorteada se lee entera, sin errores, toda pendiente, con las mismas huellas', () => {
    const { filas, errores } = leerHojaOro(tsv)
    expect(errores).toEqual([])
    expect(filas).toHaveLength(300)
    expect(filas.every((f) => f.escuchado === null)).toBe(true)
    expect(filas.map((f) => f.huella)).toEqual(huellas)
  })

  const rellena = (t: string, n: number, cambios: Record<string, string>) =>
    t
      .split('\n')
      .map((l) =>
        l.startsWith(`${n}\t`)
          ? l
              .split('\t')
              .map((c, i) => cambios[COLUMNAS_HOJA[i]] ?? c)
              .join('\t')
          : l,
      )
      .join('\n')

  it('una errata es un error, no una respuesta; y sin oyente o sin fecha, también', () => {
    let t = rellena(tsv, 1, { escuchado: 'PSOE', oyente: 'S.', fecha_escucha: '2026-12-10' })
    t = rellena(t, 2, { escuchado: 'psoe', oyente: 'S.', fecha_escucha: '2026-12-10' })
    t = rellena(t, 3, { escuchado: 'PP', fecha_escucha: '2026-12-10' })
    t = rellena(t, 4, { escuchado: 'PP', oyente: 'S.' })
    const { filas, errores } = leerHojaOro(t)
    expect(filas[0].escuchado).toBe('PSOE')
    expect(filas[1].escuchado).toBeNull()
    expect(errores).toEqual([
      'fila 2: «psoe» no es una etiqueta válida',
      'fila 3: etiquetada sin oyente',
      'fila 4: etiquetada sin fecha_escucha AAAA-MM-DD',
    ])
  })

  it('sobrevive a una hoja de cálculo: BOM, CRLF, tilde descompuesta y columnas reordenadas', () => {
    const t = rellena(tsv, 1, {
      escuchado: 'Compromís',
      oyente: 'S.',
      fecha_escucha: '2026-12-10',
    })
    const lineas = t.split('\n').filter(Boolean)
    // Mueve «escuchado» al final de cada fila de datos y de la cabecera.
    const mover = (l: string) => {
      if (l.startsWith('#')) return l
      const c = l.split('\t')
      const [x] = c.splice(COLUMNAS_HOJA.indexOf('escuchado'), 1)
      return [...c, x].join('\t')
    }
    const excel = String.fromCharCode(0xfeff) + lineas.map(mover).join('\r\n') + '\r\n'
    const { filas, errores } = leerHojaOro(excel)
    expect(errores).toEqual([])
    expect(filas[0].escuchado).toBe('Compromís')
    expect(filas.map((f) => f.huella)).toEqual(huellas)
  })

  it('una frase que empieza como fórmula verifica igual con o sin el espacio delante', () => {
    const f = hojaOro(
      sortearOro([linea('z', 1, '=10 euros más que el año pasado dijo él')]).elegidas,
      [],
    )
    const [esperada] = f.huellas
    expect(f.tsv).toContain('\t =10 euros')
    expect(leerHojaOro(f.tsv).filas[0].huella).toBe(esperada)
    expect(leerHojaOro(f.tsv.replace('\t =10 euros', '\t=10 euros')).filas[0].huella).toBe(esperada)
  })

  it('una hoja de cálculo que entrecomilla, quita el «.0» o añade una fila vacía no la rompe', () => {
    const lineas = tsv.split('\n')
    const i = lineas.findIndex((l) => l.startsWith('3\t'))
    const c = lineas[i].split('\t')
    c[COLUMNAS_HOJA.indexOf('frase')] = `"${c[COLUMNAS_HOJA.indexOf('frase')]}"`
    c[COLUMNAS_HOJA.indexOf('desde_s')] = String(Number(c[COLUMNAS_HOJA.indexOf('desde_s')]))
    lineas[i] = c.join('\t')
    const t = lineas.join('\n') + '\t'.repeat(COLUMNAS_HOJA.length - 1) + '\n'
    const { filas, errores } = leerHojaOro(t)
    expect(errores).toEqual([])
    expect(filas).toHaveLength(300)
    expect(filas.map((f) => f.huella)).toEqual(huellas)
  })

  it('una columna congelada tocada cambia la huella de la fila', () => {
    expect(leerHojaOro(rellena(tsv, 5, { frase: 'otra frase' })).filas[4].huella).not.toBe(
      huellas[4],
    )
    expect(leerHojaOro(rellena(tsv, 5, { tanda: '2' })).filas[4].huella).not.toBe(huellas[4])
  })

  it('una hoja sin las columnas que se leen no valida', () => {
    expect(leerHojaOro('a\tb\n1\t2\n').errores[0]).toMatch(/falta la columna/)
  })
})

describe('sobre el repositorio de verdad', () => {
  const { candidatas, fuera } = poblacionEnDisco()

  it('la población sale de sesiones de audio con vídeo, y alcanza para la lista', () => {
    expect(candidatas.length).toBeGreaterThan(TAMANO_LISTA * 10)
    const sesiones = new Set(candidatas.map((c) => c.plenoId))
    expect(sesiones.size).toBeGreaterThanOrEqual(5)
    expect(fuera.acta.length, 'sin ninguna de acta, lo de abajo no prueba nada').toBeGreaterThan(0)
    for (const id of fuera.acta) expect(sesiones.has(id)).toBe(false)
    expect(candidatas.every((c) => palabras(c.texto) >= PALABRAS_MIN)).toBe(true)
    expect(candidatas.every((c) => /^https:\/\//.test(c.video))).toBe(true)
  })

  it('es ciega: ninguna frase lleva la etiqueta del diarizador', () => {
    expect(candidatas.some((c) => /SPEAKER_\d+|\(UNKNOWN\)/.test(c.texto))).toBe(false)
    const { tsv } = hojaOro(sortearOro(candidatas).elegidas, [])
    expect(tsv).not.toMatch(/SPEAKER_\d+|speakerGroup/)
  })

  it('cada línea se nombra por el segundo de su línea en la transcripción', () => {
    const muestra = [
      candidatas[0],
      candidatas[Math.floor(candidatas.length / 2)],
      candidatas.at(-1)!,
    ]
    for (const c of muestra) {
      expect(c.turnoId.startsWith(`${c.plenoId}@${c.desde}`)).toBe(true)
      const l = readFileSync(`public/data/pleno-transcripts/${c.plenoId}.txt`, 'utf8')
        .split('\n')
        .find((x) => x.startsWith(`[${c.desde} → ${c.hasta}]`) && x.includes(c.texto))
      expect(l, c.turnoId).toBeTruthy()
    }
    expect(new Set(candidatas.map((c) => c.turnoId)).size).toBe(candidatas.length)
  })
})

// Cada prueba lanza el CLI de verdad (tsx); en la CI, varios segundos cada una.
describe('el CLI: congelar y comprobar', { timeout: 180_000 }, () => {
  const cajas: string[] = []
  afterAll(() => cajas.forEach((c) => rmSync(c, { recursive: true, force: true })))
  const caja = () => {
    const d = mkdtempSync(join(tmpdir(), 'oro-'))
    cajas.push(d)
    return d
  }
  const TSX = resolve('node_modules/.bin/tsx')
  // --ensayo: en una prueba el módulo puede estar sin comitear; el sorteo de
  // verdad lo exige comiteado (abajo).
  const correr = (dir: string, sello: string, ...extra: string[]) =>
    spawnSync(
      TSX,
      ['scripts/oro-atribucion.ts', '--dir', dir, '--sello', sello, '--ensayo', ...extra],
      {
        encoding: 'utf8',
        timeout: 120_000,
      },
    )

  const dir = caja()
  const sello = join(dir, 'sello.json')
  const r1 = correr(dir, sello)

  it('sortea, escribe hoja, manifiesto y sello, y la hoja recién hecha comprueba limpia', () => {
    expect(r1.status, r1.stderr).toBe(0)
    for (const f of ['hoja-oro.tsv', 'manifiesto.json']) expect(existsSync(join(dir, f))).toBe(true)
    expect(existsSync(sello)).toBe(true)
    const ok = correr(dir, sello, '--comprobar')
    expect(ok.status, ok.stdout).toBe(0)
    expect(ok.stdout).toMatch(/300 fila\(s\) · 0 escuchada\(s\) · 0 error\(es\)/)
  })

  it('no se vuelve a sortear: ni en el mismo sitio, ni con el sello ya puesto', () => {
    const otra = correr(dir, sello)
    expect(otra.status).toBe(1)
    expect(otra.stderr).toMatch(/un sorteo hecho no se rehace/)
    expect(correr(caja(), sello).status).toBe(1)
  })

  it('una hoja con una fila tocada, o un sello que no es el suyo, no comprueba', () => {
    const hoja = join(dir, 'hoja-oro.tsv')
    const bien = readFileSync(hoja, 'utf8')
    const lineas = bien.split('\n')
    const i = lineas.findIndex((l) => l.startsWith('7\t'))
    const c = lineas[i].split('\t')
    c[COLUMNAS_HOJA.indexOf('desde_s')] = '1.0'
    lineas[i] = c.join('\t')
    writeFileSync(hoja, lineas.join('\n'))
    const mal = correr(dir, sello, '--comprobar')
    expect(mal.status).toBe(1)
    expect(mal.stdout).toMatch(/la fila 7 no es la sorteada/)
    writeFileSync(hoja, bien)
    const s = JSON.parse(readFileSync(sello, 'utf8'))
    writeFileSync(sello, JSON.stringify({ ...s, huellaLista: 'otra' }))
    expect(correr(dir, sello, '--comprobar').stdout).toMatch(/no es el del sello/)
  })

  it('sin --ensayo, se niega si las fuentes del sorteo no están comiteadas tal cual', () => {
    const sucio = spawnSync(
      'git',
      ['status', '--porcelain', '--', 'src/scraper/oro-atribucion.ts', 'scripts/oro-atribucion.ts'],
      { encoding: 'utf8' },
    ).stdout
    const d = caja()
    const r = spawnSync(
      TSX,
      ['scripts/oro-atribucion.ts', '--dir', d, '--sello', join(d, 's.json')],
      {
        encoding: 'utf8',
        timeout: 120_000,
      },
    )
    if (sucio.trim()) {
      expect(r.status).toBe(1)
      expect(r.stderr).toMatch(/fuentes del sorteo sin comitear/)
      expect(existsSync(join(d, 'hoja-oro.tsv'))).toBe(false)
    } else {
      // Comiteado: sortea. Lo que se prueba es que no se niega sin motivo.
      expect(r.status, r.stderr).toBe(0)
    }
    // Comiteadas (en CI), corre un sorteo entero: decenas de segundos.
  }, 180_000)

  it('se niega a escribir bajo public/', () => {
    const r = correr(resolve('public/data/oro-prueba'), join(caja(), 's.json'))
    expect(r.status).toBe(1)
    expect(r.stderr).toMatch(/está bajo public\//)
    expect(existsSync('public/data/oro-prueba')).toBe(false)
  })
})
