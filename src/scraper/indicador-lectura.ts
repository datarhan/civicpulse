/**
 * Cómo se lee cada número, en dos o tres frases.
 *
 * Una cifra sola miente por vecindad. «Percentil 88» junto a un euro por
 * habitante se lee como una nota; «147,25 € por punto de luz» se lee como una
 * subida cuando lo que pasó es que la entrega anterior venía incompleta. La
 * tarjeta necesita decir qué es el número, dónde queda y cómo se lee.
 *
 * POR QUÉ ESTO NO LO ESCRIBE UN MODELO
 *
 * El espacio de frases es cerrado: escalón × hay-pares × tramo de percentil ×
 * tendencia × motivo de bloqueo. Es una rejilla finita, y la parte con criterio
 * —que un coste por efectivo de policía es un precio y no un rendimiento— es
 * propiedad del ESCALÓN, no del valor: se escribe una vez y sirve para todos
 * los años y todos los servicios de ese tipo.
 *
 * Generarla con un modelo añadiría variación y superficie de alucinación sobre
 * las cifras que son el motivo entero de la página, y metería prosa automática
 * en un sitio cuya regla es que nada automático reescribe lo publicado. Esto,
 * en cambio, no puede desviarse del número que describe: sale de él.
 *
 * Módulo puro y sin estado. Las frases son datos, no plantillas con huecos que
 * alguien tenga que rellenar bien.
 */
import type { Indicador, Tier } from './indicadores'
import type { IndicadorMunicipal } from './indicadores-friccion'

export interface Lectura {
  /** Qué es el número. */
  que: string
  /** Dónde queda respecto a municipios comparables. `null` si no hay banda. */
  donde: string | null
  /** Cómo debe leerse. Depende del escalón, no del valor. */
  como: string
  /** Lo que puede torcer la lectura: entregas inverosímiles, celdas bloqueadas. */
  avisos: string[]
}

/**
 * Lo que cada escalón permite concluir, escrito una vez.
 *
 * Es la distinción de Hatry puesta en la lengua de un vecino, y es la frase que
 * impide que la tarjeta se lea como una calificación.
 */
const COMO_SE_LEE: Record<Tier, string> = {
  input:
    'Divide un gasto entre otro gasto, así que es un precio y no un rendimiento: un cuerpo mejor pagado sale «más caro» sin que eso diga nada de cómo funciona el servicio.',
  carga:
    'El divisor mide la demanda que el servicio atiende, no lo que consigue con ella: que haya más no significa que se gestione peor.',
  output:
    'Mide lo que el servicio entrega por cada euro. Sigue sin decir si el resultado es bueno: la fuente no publica ningún indicador de resultado con el que contrastarlo.',
  outcome: 'Mide el efecto sobre el municipio, no sólo lo que se produjo.',
}

const fmt = (v: number, unidad: string) =>
  `${v.toLocaleString('es-ES', {
    minimumFractionDigits: v >= 1000 ? 0 : 2,
    maximumFractionDigits: v >= 1000 ? 0 : 2,
  })} ${unidad}`

/**
 * Tramo del percentil, en palabras y sin ranking.
 *
 * El tramo central decía «en el grueso del grupo», que afirma TIPICIDAD a
 * partir de un PUESTO. Con bandas tan abiertas como las de esta fuente —la de
 * pavimentación va de 0,07 a 1,29 €/m², diecinueve veces de un cuartil a otro—
 * caer dentro del intercuartílico no significa parecerse a nadie. Y la misma
 * tarjeta avisaba dos líneas más abajo de que la cifra está a la mitad de la
 * mediana, así que el lector recibía las dos cosas a la vez. Lo cazó la
 * revisión de superficies.
 *
 * Ahora el tramo central dice lo único que el percentil sostiene: de qué lado
 * de la mediana cae. No promete tipicidad y no puede contradecir a la salvedad.
 */
function tramo(percentil: number): string {
  if (percentil <= 10) return 'por debajo de casi todos'
  if (percentil <= 25) return 'más bajo que tres de cada cuatro'
  if (percentil < 50) return 'por debajo de la mediana del grupo'
  if (percentil < 75) return 'por encima de la mediana del grupo'
  if (percentil < 90) return 'más alto que tres de cada cuatro'
  return 'por encima de casi todos'
}

export function leerIndicador(i: Indicador): Lectura {
  const avisos: string[] = []

  if (i.valor === null) {
    // Una tarjeta bloqueada también necesita lectura: el motivo ES el
    // contenido, y casi siempre dice algo sobre cómo rinde cuentas la casa.
    const motivo = i.numerador.motivo ?? i.denominador.motivo
    const que =
      motivo === 'concesion'
        ? 'No hay coste por unidad porque el servicio está concedido: lo paga el concesionario y lo recupera de la tarifa.'
        : motivo === 'cero-sin-declarar'
          ? 'No hay coste por unidad porque el ayuntamiento declaró un gasto real y dejó la magnitud física a cero.'
          : motivo === 'filas-duplicadas'
            ? 'No hay coste por unidad porque el ministerio publica más de un coste para este mismo servicio.'
            : motivo === 'atributo-ambiguo'
              ? 'No hay coste por unidad porque la magnitud viene declarada dos veces con valores distintos.'
              : 'No hay coste por unidad para este servicio en la entrega publicada.'
    return {
      que,
      donde: null,
      como: 'Es un hecho sobre la declaración del ayuntamiento, no un hueco de esta página.',
      avisos,
    }
  }

  const entrega = i.citas?.[0]?.entrega
  const que = `${fmt(i.valor, i.unidad)} en la entrega de ${entrega}.`

  let donde: string | null = null
  if (i.pares) {
    donde =
      `Frente a ${i.pares.n} municipios valencianos de tamaño parecido que prestan el servicio ` +
      `de la misma forma, queda ${tramo(i.pares.percentil)} (mediana: ${fmt(i.pares.mediana, i.unidad)}).`
  } else if (i.modoGestion === 'concesion') {
    donde = null
  } else {
    donde =
      'No hay comparación: no llegan a quince los municipios que prestan este servicio del mismo modo y declaran las dos cifras.'
  }

  const declarados = i.serie.filter((p) => p.estado === 'declarado')
  // La tendencia sólo se afirma entre entregas COMPROBADAS contra sus pares y
  // que pasaron la comprobación. Las primeras entregas de alumbrado no tienen
  // banda con la que contrastarse, y anclar ahí daba «sube un 1517 %» cuando lo
  // que cambió fue cómo se declara. Una tendencia sobre una cifra que nadie
  // pudo verificar es justo la afirmación que este motor no hace.
  const limpios = declarados.filter((p) => p.medianaPares !== undefined && !p.atipico)
  if (limpios.length >= 2) {
    const a = limpios[0]
    const b = limpios[limpios.length - 1]
    const cambio = a.valor! > 0 ? (b.valor! / a.valor! - 1) * 100 : 0
    if (Math.abs(cambio) >= 10) {
      avisos.push(
        `Entre ${a.anio} y ${b.anio} ${cambio > 0 ? 'sube' : 'baja'} un ` +
          `${Math.abs(Math.round(cambio))} %, de ${fmt(a.valor!, i.unidad)} a ${fmt(b.valor!, i.unidad)}.`,
      )
    }

    // La misma tendencia, medida contra los pares de cada año.
    //
    // El alumbrado sube un 1517 % entre 2014 y 2024 y eso NO es que se haya
    // encarecido: la mediana de sus pares apenas se mueve en esa década (128 →
    // 141 €/punto de luz) mientras Riba-roja declaraba entre 0,07 y 0,13 veces
    // esa mediana y sólo converge en 2023. Lo que cambió fue cuánto se declara,
    // no cuánto cuesta, y decir sólo el porcentaje absoluto lo cuenta al revés.
    const rel = (p: (typeof limpios)[number]) => p.valor! / p.medianaPares!
    const saltoRelativo = rel(b) / rel(a)
    if (saltoRelativo > 3 || saltoRelativo < 1 / 3) {
      const veces = (v: number) =>
        v.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      avisos.push(
        `Medido contra sus pares pasa de ${veces(rel(a))} a ${veces(rel(b))} veces la mediana, así ` +
          `que buena parte de ese cambio está en cuánto se declara y no en cuánto cuesta.`,
      )
    }
  }

  if (declarados.length >= 2 && limpios.length < 2) {
    avisos.push(
      'No se afirma tendencia: no hay dos entregas con municipios comparables suficientes para contrastarlas.',
    )
  }

  const atipicas = declarados.filter((p) => p.atipico).map((p) => p.anio)
  if (atipicas.length) {
    avisos.push(
      `${atipicas.length === 1 ? 'La entrega' : 'Las entregas'} de ${atipicas.join(', ')} ` +
        `${atipicas.length === 1 ? 'publica una cifra que no puede ser un coste' : 'publican cifras que no pueden ser un coste'}; ` +
        'se muestran porque son las oficiales.',
    )
  }

  return { que, donde, como: COMO_SE_LEE[i.tier], avisos }
}

const COMO_MUNICIPAL: Record<string, string> = {
  'periodo-medio-pago':
    'El plazo lo fija la ley, no esta página: superarlo obliga al ayuntamiento a publicar un plan de tesorería.',
  'gasto-por-habitante':
    'Es cuánto se dedica por vecino, no lo que se consigue: gastar más puede ser más servicio o menos eficiencia, y la cifra sola no distingue las dos cosas.',
  'licitador-unico':
    'Un único licitador no es irregular por sí mismo —hay mercados con un solo proveedor capaz—: mide cuánta concurrencia hubo.',
  'sin-publicidad-abierta':
    'El contrato menor es legal por debajo de los umbrales: esto no mide irregularidad, mide qué parte se resuelve sin concurrencia abierta.',
  'concentracion-proveedores':
    'Mide concentración del importe adjudicado en el periodo, no gasto anual: las concesiones se adjudican por todo su plazo de una vez.',
  'modificaciones-presupuestarias':
    'Las modificaciones son legales y a veces inevitables: lo que mide es cuánto se aleja el presupuesto ejecutado del que se debatió y aprobó.',
  'ejecucion-presupuestaria':
    'El divisor es el crédito definitivo, hinchado con modificaciones de última hora: buena parte de un porcentaje bajo es crédito que nunca pudo gastarse.',
}

export function leerIndicadorMunicipal(m: IndicadorMunicipal): Lectura {
  const avisos: string[] = []
  if (m.valor === null) {
    return {
      que: 'Sin datos suficientes para calcular este indicador.',
      donde: null,
      como: 'La fuente no publica las dos magnitudes que hacen falta.',
      avisos,
    }
  }

  const cifra =
    m.formato === 'porcentaje'
      ? `${(m.valor * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`
      : m.formato === 'dias'
        ? `${m.valor.toLocaleString('es-ES', { maximumFractionDigits: 1 })} días`
        : m.valor.toLocaleString('es-ES', {
            style: 'currency',
            currency: 'EUR',
            maximumFractionDigits: 0,
          })
  const que = `${cifra} en ${m.periodo}.`

  const donde = m.pares
    ? `Frente a ${m.pares.n.toLocaleString('es-ES')} municipios, queda ${tramo(m.pares.percentil)}.`
    : null

  if (m.referencia && m.valor > m.referencia.valor) {
    avisos.push(
      `Supera ${(m.valor / m.referencia.valor).toLocaleString('es-ES', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      })} veces el límite de ${m.referencia.etiqueta}.`,
    )
  }
  if (m.serie && m.serie.length >= 2) {
    const a = m.serie[0]
    const b = m.serie[m.serie.length - 1]
    if (a.valor > 0) {
      const cambio = (b.valor / a.valor - 1) * 100
      if (Math.abs(cambio) >= 10) {
        avisos.push(
          `Desde ${a.periodo} ${cambio > 0 ? 'sube' : 'baja'} un ${Math.abs(Math.round(cambio))} %.`,
        )
      }
    }
  }

  return {
    que,
    donde,
    como: COMO_MUNICIPAL[m.id] ?? 'Es una medida de proceso, no de coste ni de resultado.',
    avisos,
  }
}
