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

/** Lo que la tarjeta ya enseña por su cuenta, alrededor de la lectura. */
export interface YaEnPantalla {
  /** La cifra en grande y su fórmula: numerador ÷ denominador · entrega. */
  cifra: boolean
  /** La banda de pares, con mediana, cuartiles y percentil escritos. */
  banda: boolean
}

/** Una lectura de la que se han descontado las frases redundantes. */
export interface LecturaVisible {
  que: string | null
  donde: string | null
  como: string
  avisos: string[]
}

/**
 * La misma lectura, sin lo que el lector ya tiene delante.
 *
 * Hoy sólo descuenta `donde`, y sólo cuando el llamante declara imprimirlo por
 * su cuenta. `que`, `como` y `avisos` NUNCA se descuentan: son lo que la
 * geometría no puede enseñar, y el motivo entero de que este bloque exista.
 *
 * HISTORIA, porque explica el único flag que ya no gobierna nada. Se midió
 * sobre la página publicada que «81.965» aparecía cuatro veces dentro de su
 * propia tarjeta, y «…que prestan el servicio de la misma forma» diez veces en
 * la página, una por tarjeta. Diez pantallas de las trece eran repetición, así
 * que se descontaron `que` y `donde` cuando la cifra y la banda ya estaban en
 * pantalla.
 *
 * Para `que` ese arreglo fue por el lado equivocado. La frase no sobraba por
 * estar el número en pantalla: sobraba por no decir nada que el número no
 * dijera («81.965 €/efectivo en la entrega de 2024.»). Callarla dejó la página
 * sin NINGUNA frase que explicara qué es el cociente, y así estuvo hasta que un
 * lector preguntó qué significaba «81.965 €/efectivo» y no halló respuesta.
 * Ahora `que` glosa el divisor —«52 efectivos» no dice nada; «los agentes y
 * demás personal en plantilla» sí— y marca el gasto como anual, de modo que ya
 * no hay nada que descontar. `cifra` se sigue aceptando porque describe la
 * pantalla con verdad, pero no suprime nada.
 *
 * `banda` significa «`donde` ya está impreso en la tarjeta», no «la banda está
 * desplegada» (va plegada en <details>). El contrato no cambia: descuenta lo
 * que el llamante declara tener en pantalla.
 */
export function lecturaVisible(lectura: Lectura, ya: YaEnPantalla): LecturaVisible {
  return {
    // `que` ya NO se descuenta, y el flag `cifra` deja de gobernarlo.
    //
    // Se descontaba porque la frase era la cifra otra vez con otro formato, y
    // entonces era correcto: tener «81.965 €/efectivo» cuatro veces en la misma
    // tarjeta empujaba hacia abajo lo que sí informaba. Pero el arreglo se hizo
    // por el lado equivocado. La frase no sobraba por estar el número en
    // pantalla: sobraba por no decir nada que el número no dijera. Al callarla
    // en vez de escribirla, la página se quedó SIN NINGUNA frase que explicara
    // qué es el cociente, y así estuvo hasta que un lector preguntó qué
    // significaba «81.965 €/efectivo» y no encontró la respuesta en la página.
    //
    // Ahora `que` glosa el divisor y marca el gasto como anual, o sea dice tres
    // cosas que ninguna cifra en cuerpo 30 puede decir. `donde` sí se sigue
    // descontando cuando la tarjeta lo imprime por su cuenta: ahí la
    // redundancia es real.
    que: lectura.que,
    donde: ya.banda ? null : lectura.donde,
    como: lectura.como,
    avisos: lectura.avisos,
  }
}

/** Una marca corta y siempre visible en la cabecera de la tarjeta. */
export interface ChipDeclaracion {
  texto: string
  /** Qué mitad del cociente se quedó parada. */
  mitad: 'denominador' | 'numerador' | 'ambas'
}

/**
 * La marca de «esta cifra descansa sobre una cantidad vieja», en tres palabras.
 *
 * La salvedad larga —que el ayuntamiento repite la cantidad desde tal año,
 * cuántas entregas seguidas, y cuántos comparables hacen lo mismo— sigue entera
 * en `indicador.caveats`, porque es el hallazgo que más importa de esta página y
 * no se toca. Lo que cambia es dónde: contada una vez arriba y desplegable en
 * cada tarjeta, en lugar de diez párrafos casi idénticos en fila.
 *
 * El año va DENTRO de la marca a propósito. Sin él la marca sería un adorno que
 * cada tarjeta repite igual, y con él sigue diciendo lo único que distingue a
 * una tarjeta de otra sin tener que abrir nada.
 */
export function chipDeclaracion(i: Indicador): ChipDeclaracion | null {
  const d = i.declaracion
  if (!d) return null
  const num = d.numerador.congelada
  const den = d.denominador.congelada
  if (!num && !den) return null
  // Con las dos paradas se toma la más antigua: es desde cuándo el cociente
  // entero dejó de remedirse.
  const desde = num && den ? Math.min(d.numerador.desde ?? 0, d.denominador.desde ?? 0) : null

  // «denominador de 2019» era la marca más visible de la tarjeta —va primera y
  // en tono de aviso— y estaba escrita en la única palabra del conjunto que un
  // vecino no tiene por qué conocer. Dice lo mismo sin pedir aritmética: lo que
  // se quedó parado es la CANTIDAD entre la que se divide, o el COSTE, o las
  // dos. El año sigue dentro, que es lo que distingue una tarjeta de otra.
  if (num && den) return { texto: `ni coste ni cantidad se remiden desde ${desde}`, mitad: 'ambas' }
  if (den)
    return { texto: `cantidad sin remedir desde ${d.denominador.desde}`, mitad: 'denominador' }
  return { texto: `coste sin actualizar desde ${d.numerador.desde}`, mitad: 'numerador' }
}

/**
 * Lo que cada escalón permite concluir, escrito una vez.
 *
 * Es la distinción de Hatry puesta en la lengua de un vecino, y es la frase que
 * impide que la tarjeta se lea como una calificación.
 */
const COMO_SE_LEE: Record<Tier, string> = {
  // Cada una EMPIEZA por lo que la cifra no es.
  //
  // Antes empezaban por lo que miden («Divide un gasto entre otro gasto…»), y
  // la advertencia llegaba en la segunda mitad de la frase. Puesta debajo del
  // gráfico y de la banda, como estaba, el lector ya había leído «queda más
  // alto que tres de cada cuatro» media pantalla antes y había sacado su
  // conclusión. La negación va primero y la frase va arriba, junto al número:
  // es el orden en el que se lee, no el orden en el que se deduce.
  input:
    'No es un sueldo ni una tarifa: es TODO el coste del servicio —personal, medios, instalaciones— repartido entre su propia plantilla. Divide un gasto entre otro gasto, así que es un precio y no un rendimiento: un cuerpo mejor pagado o mejor equipado sale «más caro» por cabeza sin que eso diga nada de cómo funciona el servicio.',
  carga:
    'No mide lo que el servicio consigue: el divisor es la demanda que le llega —lo que le toca atender—, no su logro. Que haya más no significa que se gestione peor, y que haya menos no significa que se gestione mejor.',
  output:
    'No mide la calidad de lo que se entrega: dice lo que costó cada unidad, no si estuvo bien hecha. La fuente no publica ningún indicador de resultado con el que contrastarlo.',
  outcome: 'Mide el efecto sobre el municipio, no sólo lo que se produjo.',
}

/**
 * El escalón en cinco palabras, para quien todavía no ha leído una ficha.
 *
 * `entrada` / `carga de trabajo` / `producto` son la distinción de Hatry, o sea
 * la columna vertebral de esta página, y llegaban al lector como una chapa
 * suelta al lado de «gestión directa»: se leían como una etiqueta arbitraria.
 * La frase larga está en `COMO_SE_LEE` y sale en cada tarjeta; esto es lo mismo
 * comprimido para la leyenda de arriba, donde todavía no hay ninguna tarjeta.
 *
 * `Record<Tier, string>` a propósito: si el enum gana un escalón, esto no
 * compila. Una leyenda que se queda sin una de sus entradas es peor que no
 * tenerla, porque las otras tres siguen aparentando que la lista está completa.
 */
export const GLOSA_TIER: Record<Tier, string> = {
  // La chapa ya dice «precio», así que la glosa no lo repite: dice por qué lo
  // es. Antes la chapa decía «entrada» y era la glosa quien tenía que cargar
  // con todo el significado.
  input: 'divide un gasto entre otro gasto, no mide rendimiento',
  carga: 'el divisor es la demanda que atiende',
  output: 'lo que el servicio entrega por euro',
  outcome: 'el efecto sobre el municipio',
}

const fmt = (v: number, unidad: string) =>
  `${v.toLocaleString('es-ES', {
    minimumFractionDigits: v >= 1000 ? 0 : 2,
    maximumFractionDigits: v >= 1000 ? 0 : 2,
  })} ${unidad}`

/** La misma escala de decimales, en euros a secas: 2,02 € y 81.965 €. */
const euros = (v: number) => fmt(v, '€')

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
  // La frase que dice QUÉ ES el número, y la razón entera de que este campo
  // exista. La redacción anterior era «81.965 €/efectivo en la entrega de
  // 2024.»: la misma cifra que ya estaba en cuerpo 30, con otro formato. Como
  // no añadía nada, `lecturaVisible` la suprimía por redundante — y con ella
  // desapareció de la página la única frase que podía contestar «¿qué
  // significa esto?». El lector lo dijo tal cual: «81.965 €/efectivo, ¿qué
  // quieren decir estos números?».
  //
  // Ahora nombra las dos cantidades que se dividen, glosa el divisor —«52
  // efectivos» no dice nada; «los agentes y demás personal en plantilla» sí— y
  // cierra con el cociente marcado como ANUAL. Lo último no es adorno: sin
  // «al año», 81.965 € junto a la palabra «efectivo» se lee como un sueldo.
  const que =
    `El ayuntamiento declaró ${euros(i.numerador.valor!)} de coste para este servicio en ` +
    `${entrega} y ${i.denominador.valor!.toLocaleString('es-ES')} ${i.divisor.plural} ` +
    `—${i.divisor.glosa}—: sale a ${euros(i.valor)} al año por cada ${i.divisor.singular}.`

  let donde: string | null = null
  if (i.pares) {
    donde =
      `Frente a ${i.pares.n} municipios valencianos de tamaño parecido que prestan el servicio ` +
      `de la misma forma, queda ${tramo(i.pares.percentil)} (mediana: ${fmt(i.pares.mediana, i.unidad)}).`
    // Si la banda plausible cruza la mediana, el puesto no da para afirmar
    // lado: decirlo es lo que separa un percentil de un ranking.
    const banda = i.pares.percentilBanda
    if (Array.isArray(banda) && banda[0] <= 50 && banda[1] >= 50) {
      avisos.push(
        `Con ${i.pares.n} comparables, la banda plausible del percentil (${banda[0]}–${banda[1]}) ` +
          `cruza la mediana: la posición no se distingue con seguridad de la del grupo.`,
      )
    }
  } else if (i.modoGestion === 'concesion') {
    donde = null
  } else {
    donde =
      'No hay comparación: no llegan a quince los municipios que prestan este servicio del mismo modo y declaran las dos cifras (reglas 4 y 5).'
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
    // En euros constantes cuando los hay: el gráfico de la misma tarjeta
    // dibuja términos reales, y una frase que dijera «sube un 29 %» sobre un
    // dibujo que sube un 5 % sería la página contradiciéndose a sí misma. La
    // frase dice en qué unidad habla; sin índice, cae a corrientes y lo dice.
    const enReales = typeof a.valorReal === 'number' && typeof b.valorReal === 'number'
    const va = enReales ? a.valorReal! : a.valor!
    const vb = enReales ? b.valorReal! : b.valor!
    const cambio = va > 0 ? (vb / va - 1) * 100 : 0
    if (Math.abs(cambio) >= 10) {
      avisos.push(
        `Entre ${a.anio} y ${b.anio} ${cambio > 0 ? 'sube' : 'baja'} un ` +
          `${Math.abs(Math.round(cambio))} % en euros ${enReales ? 'constantes' : 'corrientes'}, ` +
          `de ${fmt(va, i.unidad)} a ${fmt(vb, i.unidad)}.`,
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
