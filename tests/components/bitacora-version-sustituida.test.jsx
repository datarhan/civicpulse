/**
 * La bitácora rotulaba «Texto vigente» la versión que puso CADA fila, también
 * cuando una fila posterior del mismo campo la había vuelto a cambiar.
 *
 * El rótulo existe desde el 16-09-2026 (bitacora-texto-superado.test.jsx) para
 * que el rastreador, el lector de pantalla, el copia-pega y la revisión lectora
 * sepan qué versión rige sin ver los estilos. Y les decía la equivocada: una
 * ficha con siete filas de `summary` imprimía siete «Texto vigente» con siete
 * sumarios distintos, y sólo el último es el que la ficha publica. Es la misma
 * contradicción que la revisión del 16-09-2026 leyó dentro de la bitácora, ahora
 * con el rótulo afirmándola.
 *
 * Medido el 04-10-2026 sobre la copia servida: en /hallazgos, 50 de las 195
 * filas que imprimían «Texto vigente» enseñaban un título o un sumario que otra
 * fila posterior había sustituido, en 26 de las 40 fichas —entre ellas versiones
 * que eran huellas, «sumario · sha256:…», rotuladas como el texto que rige—; en
 * /eficiencia, 9 de 12; en /laboratorio/agentes, 1 de 9.
 *
 * El oráculo de estas pruebas es lo que la ficha publica HOY —su `summary`, su
 * `titulo`, el cuerpo de su sección—, no el orden de las filas: una versión que
 * la ficha ya no publica no es la vigente, la calcule quien la calcule. Y qué
 * fila la sustituyó lo dice el contenido —la fila que la retiró lleva ese mismo
 * texto como `original`—, no el nombre del campo.
 *
 * Todo se afirma sobre `textContent`, que es lo que leen esos cuatro lectores,
 * también con el `<details>` cerrado.
 */
import { describe, expect, it, beforeEach, afterAll, afterEach } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import {
  BitacoraCorrecciones,
  ROTULO_TEXTO_SUSTITUIDO,
  ROTULO_TEXTO_VIGENTE,
} from '../../src/components/BitacoraCorrecciones'
import { HallazgosEficiencia } from '../../src/components/eficiencia/HallazgosEficiencia'
import { lineaDeMedicion } from '../../src/scraper/eficiencia-finding'
import { CorrectionLog, inicioVentana } from '../../src/pages/AgenteReporte'
import { FindingDetailCard } from '../../src/pages/Hallazgos'
import { MARCA_GRUPO_RETENIDO } from '../../src/lib/grupo-retenido'
import { invalidateSnapshots } from '../../src/lib/snapshot-store'
import { copiaServidaDeHallazgos } from '../../publication-denylist.js'

const ROOT = join(__dirname, '..', '..')
const leer = (rel) => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'))
const PROVENANCE = leer('public/data/finding-quote-provenance.json')
/** Lo que sirve el sitio: sin los literales retenidos ni las versiones de un escaño. */
const SERVIDA = copiaServidaDeHallazgos(
  leer('public/data/pleno-findings.json'),
  PROVENANCE,
  leer('public/data/officials.json'),
).snapshot

const realFetch = globalThis.fetch
beforeEach(() => {
  globalThis.fetch = async (url) => {
    if (String(url).endsWith('/data/finding-quote-provenance.json')) {
      return new Response(JSON.stringify(PROVENANCE), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    return new Response('not found', { status: 404 })
  }
  invalidateSnapshots()
})
afterEach(() => cleanup())
afterAll(() => {
  globalThis.fetch = realFetch
  invalidateSnapshots()
})

const norm = (s) => String(s).replace(/\s+/g, ' ').trim()
/** Lo que lee quien no ve los estilos. */
const plano = (nodo) => norm(nodo.textContent)
const dia = (iso) => String(iso).slice(0, 10)
/** El rótulo de una versión sustituida, con el día de la fila que la sustituyó. */
const sustituidoEl = (fecha) => `${ROTULO_TEXTO_SUSTITUIDO}, sustituido el ${fecha}:`
const SUSTITUIDO_RE = new RegExp(`${ROTULO_TEXTO_SUSTITUIDO}, sustituido el \\d{4}-\\d{2}-\\d{2}:`)

/** ¿Enseña la bitácora lo que puso la fila? (un grupo de un escaño o un literal retenido, no) */
const seVe = (c) => !c.literalRetenido && c.corrected !== MARCA_GRUPO_RETENIDO

/** Una fila por `<li>`, en el orden de la bitácora (el componente suelto, sin más listas). */
const filas = (container) => [...container.querySelectorAll('ol > li')]
/** Lo mismo dentro de una ficha entera, que tiene otras listas además de la bitácora. */
const filasDeLaBitacora = (container) => {
  const bitacora = [...container.querySelectorAll('details')].find((d) =>
    d.querySelector('summary')?.textContent.startsWith('Bitácora de correcciones'),
  )
  return bitacora ? filas(bitacora) : []
}

describe('la regla, sobre filas escritas a mano', () => {
  const fila = (field, original, corrected, correctedAt) => ({
    field,
    original,
    corrected,
    correctedAt,
    reason: 'Motivo de prueba con la longitud mínima que pide el validador.',
    editor: 'civicpulse-curator',
  })

  it('la fila que otra posterior vuelve a cambiar dice cuándo; la última sigue vigente', () => {
    const lis = filas(
      render(
        <BitacoraCorrecciones
          correcciones={[
            fila('summary', 'Uno.', 'Dos.', '2026-08-01T10:00:00.000Z'),
            fila('summary', 'Dos.', 'Tres.', '2026-09-30T05:45:00.000Z'),
          ]}
        />,
      ).container,
    )
    expect(plano(lis[0])).toContain(
      'Texto que puso esta corrección, sustituido el 2026-09-30: Dos.',
    )
    expect(plano(lis[0])).not.toContain(ROTULO_TEXTO_VIGENTE)
    expect(plano(lis[1])).toContain(`${ROTULO_TEXTO_VIGENTE}: Tres.`)
  })

  it('un campo distinto no sustituye a otro', () => {
    const lis = filas(
      render(
        <BitacoraCorrecciones
          correcciones={[
            fila('title', 'Título viejo', 'Título nuevo', '2026-08-01T10:00:00.000Z'),
            fila('summary', 'Sumario viejo.', 'Sumario nuevo.', '2026-08-02T10:00:00.000Z'),
          ]}
        />,
      ).container,
    )
    expect(plano(lis[0])).toContain(`${ROTULO_TEXTO_VIGENTE}: Título nuevo`)
    expect(plano(lis[1])).toContain(`${ROTULO_TEXTO_VIGENTE}: Sumario nuevo.`)
  })

  it('un campo con posición no se juzga por el nombre: retirar una cita renumera las demás', () => {
    // `quote.1.text` de la fila 2 es la cita que antes era la 2, no la de la fila 0.
    const lis = filas(
      render(
        <BitacoraCorrecciones
          correcciones={[
            fila('quote.1.text', 'cita a', 'cita b', '2026-08-01T10:00:00.000Z'),
            fila('quote.0', 'cita · sha256:0123456789ab', 'retirada del hallazgo', '2026-08-02'),
            fila('quote.1.text', 'cita c', 'cita d', '2026-08-03T10:00:00.000Z'),
          ]}
        />,
      ).container,
    )
    expect(plano(lis[0])).toContain(`${ROTULO_TEXTO_VIGENTE}: cita b`)
    expect(plano(lis[2])).toContain(`${ROTULO_TEXTO_VIGENTE}: cita d`)
    // Y la cabecera dice qué cita de la ficha es hoy, contando desde 1 como ella.
    expect(plano(lis[0])).toMatch(/^quote\.1\.text \(cita 1\) · 2026-08-01/)
    expect(plano(lis[1])).toMatch(/^quote\.0 \(la cita que retiró esta corrección\) ·/)
    expect(plano(lis[2])).toMatch(/^quote\.1\.text \(cita 2\) · 2026-08-03/)
  })

  it('la misma cita, seguida por las retiradas, sí se sustituye', () => {
    const lis = filas(
      render(
        <BitacoraCorrecciones
          correcciones={[
            fila('quote.2.text', 'cita a', 'cita b', '2026-08-01T10:00:00.000Z'),
            fila('quote.0', 'cita · sha256:0123456789ab', 'retirada del hallazgo', '2026-08-02'),
            fila('quote.1.text', 'cita b', 'cita c', '2026-08-03T10:00:00.000Z'),
          ]}
        />,
      ).container,
    )
    expect(plano(lis[0])).toContain(`${sustituidoEl('2026-08-03')} cita b`)
    expect(plano(lis[0])).not.toContain(ROTULO_TEXTO_VIGENTE)
    expect(plano(lis[0])).toMatch(/^quote\.2\.text \(cita 2\) ·/)
    expect(plano(lis[2])).toContain(`${ROTULO_TEXTO_VIGENTE}: cita c`)
  })

  it('una cita retirada después: lo que puso no es vigente, y la cabecera lo dice', () => {
    const lis = filas(
      render(
        <BitacoraCorrecciones
          correcciones={[
            fila('quote.1.text', 'cita a', 'cita b', '2026-08-01T10:00:00.000Z'),
            fila('quote.1', 'cita · sha256:0123456789ab', 'retirada del hallazgo', '2026-08-02'),
          ]}
        />,
      ).container,
    )
    expect(plano(lis[0])).toContain(
      'Texto que puso esta corrección; la cita se retiró el 2026-08-02: cita b',
    )
    expect(plano(lis[0])).not.toContain(ROTULO_TEXTO_VIGENTE)
    expect(plano(lis[0])).toMatch(/^quote\.1\.text \(cita retirada después\) ·/)
  })
})

describe('/hallazgos: el título y el sumario, sobre la copia servida', () => {
  const CAMPOS = ['title', 'summary']
  /** ¿Se enseña la versión que puso la fila? (un grupo de un escaño o un literal retenido, no) */
  const seEnsena = (c) => !c.literalRetenido && c.corrected !== MARCA_GRUPO_RETENIDO
  const conBitacora = SERVIDA.items.filter((f) => f.corrections?.length)

  /**
   * Filas cuya versión puesta se enseña y que la ficha ya no publica, con la que
   * la sustituyó: la primera posterior que lleva ese texto como retirado.
   */
  const sustituidas = conBitacora.flatMap((f) =>
    f.corrections.flatMap((c, i) =>
      CAMPOS.includes(c.field) && seEnsena(c) && c.corrected !== f[c.field]
        ? [{ f, c, i, por: f.corrections.slice(i + 1).find((d) => d.original === c.corrected) }]
        : [],
    ),
  )

  it('la copia servida trae versiones que la ficha ya no publica (si no, esto no mide nada)', () => {
    expect(sustituidas.length).toBeGreaterThan(0)
    // Y de las tres formas que imprime la bitácora: prosa, huella y la fila de
    // un grupo de un escaño que sí enseña lo que puso. Sin la tercera, la rama
    // de FilaGrupoRetenido no la mediría nadie.
    expect(sustituidas.some(({ c }) => /sha256:/.test(c.corrected))).toBe(true)
    expect(sustituidas.some(({ c }) => c.grupoRetenido)).toBe(true)
    expect(sustituidas.some(({ c }) => !c.grupoRetenido && !/sha256:/.test(c.corrected))).toBe(true)
    // Premisa del oráculo: cada una la retiró una fila posterior.
    expect(sustituidas.filter((s) => !s.por).map(({ f, i }) => `${f.id} · fila ${i}`)).toEqual([])
  })

  it('ninguna fila rotula «Texto vigente» un título o un sumario que la ficha ya no publica', () => {
    const mal = []
    for (const f of conBitacora) {
      const lis = filas(render(<BitacoraCorrecciones correcciones={f.corrections} />).container)
      expect(lis.length, `${f.id}: no se pintó una fila por corrección`).toBe(f.corrections.length)
      for (const { c, i } of sustituidas.filter((s) => s.f === f)) {
        if (plano(lis[i]).includes(ROTULO_TEXTO_VIGENTE))
          mal.push(`${f.id} · fila ${i} · ${c.field}`)
      }
      cleanup()
    }
    expect(mal).toEqual([])
  })

  it('cada una dice que la sustituyeron, cuándo, y se sigue leyendo entera', () => {
    for (const f of conBitacora) {
      const lis = filas(render(<BitacoraCorrecciones correcciones={f.corrections} />).container)
      for (const { c, i, por } of sustituidas.filter((s) => s.f === f)) {
        expect(plano(lis[i]), `${f.id} · fila ${i}`).toContain(
          `${sustituidoEl(dia(por.correctedAt))} ${norm(c.corrected)}`,
        )
      }
      cleanup()
    }
  })

  it('el título y el sumario que la ficha publica hoy siguen rotulados «Texto vigente»', () => {
    let medidas = 0
    for (const f of conBitacora) {
      const lis = filas(render(<BitacoraCorrecciones correcciones={f.corrections} />).container)
      for (const campo of CAMPOS) {
        const i = f.corrections.findLastIndex((c) => c.field === campo)
        if (i < 0 || !seEnsena(f.corrections[i])) continue
        // Premisa: la última fila del campo puso lo que la ficha publica. Si no,
        // el «vigente» de esa fila mentiría por otra causa.
        expect(f.corrections[i].corrected, `${f.id} · ${campo}`).toBe(f[campo])
        expect(plano(lis[i])).toContain(`${ROTULO_TEXTO_VIGENTE}: ${norm(f[campo])}`)
        expect(plano(lis[i])).not.toMatch(SUSTITUIDO_RE)
        medidas += 1
      }
      cleanup()
    }
    expect(medidas).toBeGreaterThan(0)
  })

  it('una versión que no se enseña no se rotula ni vigente ni sustituida', () => {
    // La regla de #214 sigue en pie: lo que nombraba a un grupo de un escaño no
    // se reproduce, y un rótulo sin su texto diría de él algo que no se enseña.
    let medidas = 0
    for (const f of conBitacora) {
      const lis = filas(render(<BitacoraCorrecciones correcciones={f.corrections} />).container)
      f.corrections.forEach((c, i) => {
        if (!c.grupoRetenido || c.corrected !== MARCA_GRUPO_RETENIDO) return
        medidas += 1
        expect(plano(lis[i])).not.toContain(ROTULO_TEXTO_VIGENTE)
        expect(plano(lis[i])).not.toContain(ROTULO_TEXTO_SUSTITUIDO)
      })
      cleanup()
    }
    expect(medidas).toBeGreaterThan(0)
  })

  it('f-2026-04-20-cit-947479, leída a mano: las huellas y el sumario de hoy', () => {
    // Seis filas de `summary`; las dos primeras son huellas de un sumario
    // reescrito con --redact, que la bitácora llamaba «Texto vigente». La sexta,
    // la [9], dice «sin atribuir» donde decía «sin grupo identificado» (bloque
    // «sin atribuir, opcional, +3» de pleno-findings-published.test.ts).
    const f = SERVIDA.items.find((x) => x.id === 'f-2026-04-20-cit-947479')
    expect(f, 'la ficha ya no está publicada: elige otra').toBeTruthy()
    const lis = filas(render(<BitacoraCorrecciones correcciones={f.corrections} />).container)
    expect(plano(lis[0])).toContain(
      'Texto que puso esta corrección, sustituido el 2026-08-09: sumario · sha256:91b93c33fb60',
    )
    expect(plano(lis[1])).toContain(
      'Texto que puso esta corrección, sustituido el 2026-08-11: sumario · sha256:28b511117b82',
    )
    expect(plano(lis[9])).toContain(`Texto vigente: ${norm(f.summary)}`)
  })

  it('la ficha de /hallazgos la monta igual, no sólo el componente suelto', async () => {
    // La de más filas sustituidas a la vista: así una regresión en la página no
    // se esconde detrás de una ficha con una sola.
    const cuenta = new Map()
    for (const { f } of sustituidas) cuenta.set(f, (cuenta.get(f) ?? 0) + 1)
    const [f, n] = [...cuenta].sort((a, b) => b[1] - a[1])[0]
    expect(n).toBeGreaterThan(1)

    const { container } = render(<FindingDetailCard f={f} permalink={`#${f.id}`} />)
    await waitFor(() => expect(filasDeLaBitacora(container).length).toBe(f.corrections.length))
    const lis = filasDeLaBitacora(container)
    for (const { c, i, por } of sustituidas.filter((s) => s.f === f)) {
      expect(plano(lis[i]), `fila ${i} · ${c.field}`).not.toContain(ROTULO_TEXTO_VIGENTE)
      expect(plano(lis[i])).toContain(sustituidoEl(dia(por.correctedAt)))
    }
  })
})

describe('/eficiencia: el título, el cuerpo y la medición de la ficha', () => {
  const EF = leer('public/data/eficiencia-findings.json')
  // La medición se registra en la bitácora como una línea; su forma la
  // exporta eficiencia-finding.ts (`lineaDeMedicion`), la misma que escribe el
  // CLI. Estaba copiada aquí a mano y se separó en cuanto la línea ganó el
  // percentil.
  const vigenteDe = (ficha, campo) =>
    campo === 'medicion' ? lineaDeMedicion(ficha.medicion) : ficha[campo]
  /** Un texto tal y como lo pinta la bitácora: sin asteriscos de negrita. */
  const comoSeLee = (texto) => norm(String(texto).replace(/\*\*/g, ''))

  const conBitacora = EF.items.filter((f) => f.corrections?.length)
  /** Los párrafos de la bitácora de una ficha, uno por corrección. */
  const parrafos = (container, ficha) =>
    [...container.querySelectorAll('details p')].filter((p) =>
      ficha.corrections.some((c) => plano(p).includes(norm(c.reason))),
    )

  it('la última fila de cada campo puso lo que la ficha publica (premisa del oráculo)', () => {
    let campos = 0
    for (const f of conBitacora) {
      for (const campo of new Set(f.corrections.map((c) => c.field))) {
        const ultima = f.corrections.findLast((c) => c.field === campo)
        expect(ultima.corrected, `${f.id} · ${campo}`).toBe(vigenteDe(f, campo))
        campos += 1
      }
    }
    expect(campos).toBeGreaterThan(0)
  })

  it('ninguna fila rotula «Texto vigente» lo que la ficha ya no publica, y dice cuándo se sustituyó', () => {
    let medidas = 0
    const mal = []
    for (const f of conBitacora) {
      const { container } = render(<HallazgosEficiencia data={{ ...EF, items: [f] }} />)
      const ps = parrafos(container, f)
      expect(ps.length, `${f.id}: no se pintó un párrafo por corrección`).toBe(f.corrections.length)
      f.corrections.forEach((c, i) => {
        const t = plano(ps[i])
        if (c.corrected === vigenteDe(f, c.field)) {
          expect(t).toContain(`${ROTULO_TEXTO_VIGENTE}: ${comoSeLee(c.corrected)}`)
          return
        }
        medidas += 1
        if (t.includes(ROTULO_TEXTO_VIGENTE)) mal.push(`${f.id} · fila ${i} · ${c.field}`)
        const rotulo = SUSTITUIDO_RE.exec(t)
        expect(rotulo, `${f.id} · fila ${i}: no dice que la sustituyeron`).toBeTruthy()
        expect(
          t
            .slice(rotulo.index + rotulo[0].length)
            .trim()
            .startsWith(comoSeLee(c.corrected)),
        ).toBe(true)
        // Sustituida después de ponerla, no antes.
        expect(rotulo[0].slice(-11, -1) >= dia(c.correctedAt)).toBe(true)
      })
      cleanup()
    }
    expect(medidas, 'ninguna fila sustituida: esto no mide nada').toBeGreaterThan(0)
    expect(mal).toEqual([])
  })
})

describe('/laboratorio/agentes: el cuerpo de una sección del informe', () => {
  const DIR = 'public/data/journalist-reports'
  const informes = readdirSync(join(ROOT, DIR)).map((n) => leer(`${DIR}/${n}`))
  const SECCION = /^narrative\.(.+)\.bodyMarkdown$/
  /** El cuerpo que el informe publica hoy en la sección que nombra el campo. */
  const vigenteDe = (informe, campo) =>
    informe.sections.find((s) => s.kind === 'narrative' && s.payload?.heading === campo)?.payload
      ?.bodyMarkdown
  /**
   * El comienzo de la ventana tal y como la pinta el registro: sin asteriscos
   * de negrita, y «…» cuando la ventana arranca donde las dos versiones se
   * separan (`inicioVentana`) en vez de en el carácter 0. Esta prueba mide el
   * RÓTULO; qué trozo enseña la ventana lo mide journalist-correction-log.
   */
  const comienzo = (texto, c) =>
    inicioVentana(c.original, c.corrected) > 0
      ? '…'
      : norm(String(texto).replace(/\*\*/g, '')).slice(0, 60)

  it('ninguna fila rotula «Texto vigente» un cuerpo que el informe ya no publica', () => {
    let medidas = 0
    const mal = []
    for (const r of informes.filter((x) => x.corrections?.length)) {
      const lis = filas(render(<CorrectionLog corrections={r.corrections} />).container)
      r.corrections.forEach((c, i) => {
        const seccion = SECCION.exec(c.field)?.[1]
        const vigente = seccion && vigenteDe(r, seccion)
        if (vigente === undefined || vigente === null) return
        const t = plano(lis[i])
        if (c.corrected === vigente) {
          expect(t).toContain(`${ROTULO_TEXTO_VIGENTE}: ${comienzo(c.corrected, c)}`)
          return
        }
        medidas += 1
        if (t.includes(ROTULO_TEXTO_VIGENTE)) mal.push(`${r.id} · fila ${i} · ${c.field}`)
        const por = r.corrections.slice(i + 1).find((d) => d.original === c.corrected)
        expect(por, `${r.id} · fila ${i}: ninguna fila posterior la retiró`).toBeTruthy()
        expect(t).toContain(`${sustituidoEl(dia(por.correctedAt))} ${comienzo(c.corrected, c)}`)
      })
      cleanup()
    }
    expect(medidas, 'ninguna fila sustituida: esto no mide nada').toBeGreaterThan(0)
    expect(mal).toEqual([])
  })
})

describe('los campos de una cita, seguidos por las retiradas', () => {
  /**
   * `quote.1.text` no dice qué cita es: retirar la cita 0 renumera las demás.
   * Hasta el 14-10-2026 el componente las dejaba fuera de la regla y rotulaba
   * «vigente» lo que pusieron, y aquí había una alarma que se pondría roja el día
   * que una quedara sin efecto. Ese día llegó: la cita 2 de 5238db, re-anclada el
   * 10-08, se acortó para dejar de nombrar a un grupo de un escaño. Ahora el
   * componente las sigue (src/lib/posicion-en-bitacora.js), y esto lo compara con
   * un oráculo escrito aparte: reproducir el registro como lo escribe la CLI —cada
   * retirada `quote.N` con el índice que tenía la cita en ese momento, de mayor a
   * menor (bloque REMOVAL de src/scraper/pleno-finding.ts)— y mirar qué texto
   * publica HOY la ficha.
   */
  const RETIRADA = /^(quote|crossChecked)\.(\d+)$/
  const DE_UNA = /^(quote|crossChecked)\.(\d+)\.(.+)$/

  /** La fila posterior que deja sin efecto lo que puso la fila `i`, y la cita de hoy. */
  function sinEfectoPor(cs, i) {
    const m = DE_UNA.exec(cs[i].field)
    if (!m) return { por: null, renumerada: false, hoy: null }
    const [, coleccion, , resto] = m
    let k = Number(m[2])
    let renumerada = false
    let por = null
    for (const d of cs.slice(i + 1)) {
      const r = RETIRADA.exec(d.field)
      if (r && r[1] === coleccion) {
        const j = Number(r[2])
        if (j === k) return { por: por ?? d, renumerada, hoy: null }
        if (j < k) {
          k -= 1
          renumerada = true
        }
      } else if (!por && d.field === `${coleccion}.${k}.${resto}`) por = d
    }
    return { por, renumerada, hoy: k }
  }

  const deCita = SERVIDA.items.flatMap((f) =>
    (f.corrections ?? []).flatMap((c, i) =>
      /^quote\.\d+\./.test(c.field) ? [{ f, c, i, ...sinEfectoPor(f.corrections, i) }] : [],
    ),
  )

  it('el oráculo reproduce el registro: renumera, y el texto de la última fila es el de la ficha', () => {
    expect(deCita.length).toBeGreaterThan(0)
    expect(deCita.some((x) => x.renumerada)).toBe(true)
    expect(deCita.some((x) => x.por)).toBe(true)
    // Premisa: cada fila de texto que nada dejó sin efecto puso lo que la ficha publica.
    const mal = deCita
      .filter((x) => !x.por && x.hoy !== null && /\.text$/.test(x.c.field) && seVe(x.c))
      .filter((x) => x.f.quotes[x.hoy]?.text !== x.c.corrected)
      .map((x) => `${x.f.id} · fila ${x.i}`)
    expect(mal).toEqual([])
  })

  it('la bitácora rotula cada fila de cita como el oráculo, y numera la cita como la ficha', () => {
    const mal = []
    for (const f of new Set(deCita.map((x) => x.f))) {
      const lis = filas(render(<BitacoraCorrecciones correcciones={f.corrections} />).container)
      for (const x of deCita.filter((y) => y.f === f)) {
        const t = plano(lis[x.i])
        const cabecera =
          x.hoy === null
            ? `${x.c.field} (cita retirada después) ·`
            : `${x.c.field} (cita ${x.hoy + 1}) ·`
        if (!t.startsWith(cabecera)) mal.push(`${f.id} · fila ${x.i}: cabecera «${t.slice(0, 60)}»`)
        if (!seVe(x.c)) continue
        if (x.por && t.includes(ROTULO_TEXTO_VIGENTE))
          mal.push(`${f.id} · fila ${x.i}: «vigente» sin serlo`)
        if (!x.por && !t.includes(`${ROTULO_TEXTO_VIGENTE}: ${norm(x.c.corrected)}`))
          mal.push(`${f.id} · fila ${x.i}: no rotula vigente lo que rige`)
      }
      cleanup()
    }
    expect(mal).toEqual([])
  })

  it('ningún campo con posición de un informe del agente se vuelve a cambiar después', () => {
    const DIR = 'public/data/journalist-reports'
    const conPosicion = (campo) => /\[\d+\]|\.\d+(\.|$)/.test(campo)
    let medidas = 0
    const repetidos = []
    for (const r of readdirSync(join(ROOT, DIR)).map((n) => leer(`${DIR}/${n}`))) {
      const cs = r.corrections ?? []
      cs.forEach((c, i) => {
        if (!conPosicion(c.field)) return
        medidas += 1
        if (cs.slice(i + 1).some((d) => d.field === c.field)) repetidos.push(`${r.id} · ${c.field}`)
      })
    }
    expect(medidas).toBeGreaterThan(0)
    expect(repetidos).toEqual([])
  })
})
