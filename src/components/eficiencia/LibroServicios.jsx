import { Fragment, useMemo, useState } from 'react'
import { FilaServicio } from './FilaServicio'
import { LeyendaPosicion } from './LeyendaPosicion'
import { estiloLibro } from './libro.css.js'
import { enTerminosReales } from './SerieServicio'
import { dominioComun } from './multiples'
import {
  posicionServicio,
  razonMediana,
  particionPosiciones,
  agruparPorArea,
  fraseParticion,
} from '../../scraper/indicador-areas'
import { MARGEN_ANCLA } from '../SubnavSecciones'
import { chipDeclaracion } from '../../scraper/indicador-lectura'

/**
 * Las columnas, y cuál se puede ordenar.
 *
 * `responde` NO lleva `clave`, así que no ordena. Ordenar por titular
 * reagruparía la página por persona, y la línea que CLAUDE.md traza no está en
 * nombrar sino en agrupar: «grouping by cargo would make the page a scoreboard
 * of people, which is a stronger claim than “this is who answers”». Una columna
 * que dice quién contesta, en orden funcional, es la afirmación débil que sí
 * se sostiene; ordenar por ella la convierte en la fuerte.
 */
const COLUMNAS = [
  { id: 'servicio', rotulo: 'Servicio', clave: (i) => i.etiqueta, tipo: 'texto' },
  {
    id: 'coste',
    rotulo: 'Coste',
    clave: (i) => i.numerador.valor ?? -1,
    num: true,
    conEntrega: true,
  },
  { id: 'unidad', rotulo: 'Por unidad', clave: (i) => i.valor ?? -1, num: true },
  { id: 'posicion', rotulo: 'Posición entre comparables', clave: (i) => i.pares?.percentil ?? -1 },
  { id: 'razon', rotulo: '× mediana', clave: (i) => razonMediana(i) ?? -1, num: true },
  { id: 'decada', rotulo: 'Década' },
  { id: 'decir', rotulo: 'Qué se puede decir' },
  { id: 'responde', rotulo: 'Quién responde' },
]

/**
 * La frase que comparten todas las filas cuando comparten mitad congelada.
 * Se escribe aquí y no en el chip porque es la versión de TABLA —una vez, en
 * plural— y el chip es la de FILA. Las dos salen del mismo campo `mitad`.
 */
const FRASE_MITAD = {
  denominador: 'dividen entre una cantidad que el ayuntamiento no vuelve a medir',
  numerador: 'llevan un coste que el ayuntamiento no vuelve a actualizar',
  ambas: 'arrastran un coste y una cantidad que el ayuntamiento no vuelve a medir',
}

const FILTROS = [
  { id: 'todos', rotulo: (n) => `Los ${n.total}`, pasa: () => true },
  {
    id: 'distinguen',
    rotulo: (n) => `Con posición que se distingue · ${n.distinguen}`,
    pasa: (i) => ['arriba', 'abajo'].includes(posicionServicio(i)),
  },
  {
    id: 'congelados',
    rotulo: (n) => `Sin remedir · ${n.congelados}`,
    pasa: (i) => Boolean(chipDeclaracion(i)),
  },
  {
    id: 'sin-cociente',
    rotulo: (n) => `Sin cociente · ${n.sinCociente}`,
    pasa: (i) => i.valor === null,
  },
]

/**
 * El libro de servicios — los quince en una pantalla, con una sola geometría.
 *
 * Sustituye a trece tarjetas de nueve partes cada una, a la franja de
 * posiciones y a la rejilla de mini-series. Las tres decían cosas verdaderas y
 * ninguna dejaba comparar: la única vista donde los trece servicios cabían
 * juntos eran dos tarjetas de resumen, y las fichas repetían el mismo andamio
 * trece veces.
 *
 * Lo que NO cambia, porque es el contrato de la página: no hay nota global, no
 * hay clasificación, no se promedian percentiles y la posición no se colorea
 * nunca. Un coste unitario alto es un precio, no un suspenso. El ámbar sigue
 * reservado a hechos sobre la DECLARACIÓN.
 *
 * Las dos filas sin cociente —agua y alcantarillado— van al pie y dentro de la
 * misma tabla, no en una sección aparte: que el coste de un servicio concedido
 * no cruce los libros del ayuntamiento es información sobre ese servicio, y
 * sacarla de la tabla la dejaría pareciendo completa.
 */
export function LibroServicios({
  indicadores = [],
  formateaCon,
  competencias,
  conNombres,
  entrega,
}) {
  const [orden, setOrden] = useState({ col: 'coste', dir: 'desc' })
  const [filtro, setFiltro] = useState('todos')
  // Por área funcional del propio retorno del ministerio, nunca por concejalía:
  // agrupar por cargo convertiría la página en un marcador de personas, que es
  // una afirmación más fuerte que «esto es quien contesta».
  const [porArea, setPorArea] = useState(false)

  const p = particionPosiciones(indicadores)
  const cuentas = {
    total: indicadores.length,
    distinguen: p.abajo + p.arriba,
    congelados: indicadores.filter((i) => chipDeclaracion(i)).length,
    sinCociente: indicadores.filter((i) => i.valor === null).length,
  }

  const totalCoste = indicadores
    .filter((i) => i.valor !== null)
    .reduce((s, i) => s + (i.numerador.valor ?? 0), 0)

  // El ámbar de la declaración se imprimía fila a fila, y en esta entrega
  // trece de las trece con cociente dicen EXACTAMENTE lo mismo: «cantidad sin
  // remedir desde 2019». Repetida quince veces una advertencia deja de ser una
  // advertencia y pasa a ser el fondo de la tabla — costaba dos líneas por
  // fila y no distinguía ninguna de ninguna.
  //
  // Cuando el hecho es de TODAS, sube a una banda sobre la tabla, visible y no
  // en un hover (§16: ninguna información existe sólo al pasar el ratón). En
  // cuanto una entrega traiga dos motivos distintos —o alguna fila se
  // remida—, `comun` se cae solo y los chips vuelven a la fila. Derivado, no
  // escrito a mano: es la misma disciplina que PanelMunicipal usa para su
  // lista de indicadores comparados.
  const conChip = indicadores.filter((i) => chipDeclaracion(i))
  const conCociente = indicadores.filter((i) => i.valor !== null)
  // Se agrupa por `mitad` —el campo estructurado del chip—, NO por su texto.
  // El texto lleva el año dentro y en esta entrega doce filas dicen 2019 y una
  // dice 2018: comparando cadenas la banda no se levantaba nunca y las trece
  // repeticiones seguían ahí. Lo que comparten es la frase; lo que las
  // distingue es el año, y el año se queda en la fila.
  const mitades = new Set(conChip.map((i) => chipDeclaracion(i).mitad))
  const mitadComun =
    conChip.length === conCociente.length && conCociente.length > 1 && mitades.size === 1
      ? [...mitades][0]
      : null

  const x = useMemo(() => {
    const listas = indicadores.map(
      (i) => enTerminosReales((i.serie ?? []).filter((q) => q.estado === 'declarado')).puntos,
    )
    return dominioComun(listas) ?? { x0: 0, x1: 1 }
  }, [indicadores])

  const filas = useMemo(() => {
    const activo = FILTROS.find((f) => f.id === filtro) ?? FILTROS[0]
    const col = COLUMNAS.find((c) => c.id === orden.col)
    const vistos = indicadores.filter(activo.pasa)
    if (!col?.clave) return vistos
    const signo = orden.dir === 'asc' ? 1 : -1
    return [...vistos].sort((a, b) => {
      const va = col.clave(a)
      const vb = col.clave(b)
      if (col.tipo === 'texto') return signo * String(va).localeCompare(String(vb), 'es')
      return signo * (va - vb)
    })
  }, [indicadores, filtro, orden])

  if (indicadores.length === 0) return null

  const ordenar = (id) =>
    setOrden((o) =>
      o.col === id ? { col: id, dir: o.dir === 'desc' ? 'asc' : 'desc' } : { col: id, dir: 'desc' },
    )

  const ariaSort = (id) =>
    orden.col !== id ? 'none' : orden.dir === 'asc' ? 'ascending' : 'descending'

  const anchoTabla = conNombres ? COLUMNAS.length : COLUMNAS.length - 1

  // Derivado de las filas que se están viendo, no de la longitud del fichero:
  // con un filtro puesto, «9 de 15» sería falso.
  const editoriales = filas.filter((i) => competencias?.get(i.id)?.confianza === 'editorial').length

  const pinta = (i) => (
    <FilaServicio
      key={i.id}
      indicador={i}
      formatea={formateaCon(i.unidad)}
      competencia={competencias?.get(i.id)}
      x0={x.x0}
      x1={x.x1}
      conNombres={conNombres}
      chipHoisted={Boolean(mitadComun)}
    />
  )

  return (
    <div className="cp-libro-wrap">
      <style>{estiloLibro}</style>

      <div className="cp-libro-filtros">
        <span className="mono cp-libro-filtros-rotulo">Ver</span>
        {FILTROS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`cp-chip${filtro === f.id ? ' cp-chip-on' : ''}`}
            aria-pressed={filtro === f.id}
            onClick={() => setFiltro(f.id)}
          >
            {f.rotulo(cuentas)}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <button
          type="button"
          className={`cp-chip${porArea ? ' cp-chip-on' : ''}`}
          aria-pressed={porArea}
          onClick={() => setPorArea((v) => !v)}
        >
          Agrupar por área
        </button>
      </div>

      <LeyendaPosicion />

      {mitadComun && (
        <p className="cp-libro-comun">
          <span className="cp-punto-warn" aria-hidden="true" />
          <span>
            Las {conCociente.length} filas con cociente {FRASE_MITAD[mitadComun]}. Por eso ninguna
            serie de esta tabla se puede leer como gestión: la última columna dice desde qué entrega
            en cada caso.
          </span>
        </p>
      )}

      <div className="cp-libro-scroll">
        <table className="cp-libro">
          <caption className="cp-libro-caption">
            Los {cuentas.total} servicios del panel, ordenados por{' '}
            {COLUMNAS.find((c) => c.id === orden.col)?.rotulo.toLowerCase()}{' '}
            {orden.dir === 'desc' ? 'de mayor a menor' : 'de menor a mayor'}. Cada fila abre su
            ficha. Las series van en euros constantes de {entrega}, deflactadas con el IPC general
            del INE; la fila que no puede ir así lo dice.
          </caption>
          <thead>
            <tr>
              {COLUMNAS.filter((c) => c.id !== 'responde' || conNombres).map((c) => (
                <th
                  key={c.id}
                  className={`cp-c-${c.id}`}
                  scope="col"
                  aria-sort={c.clave ? ariaSort(c.id) : undefined}
                >
                  {c.clave ? (
                    <button type="button" className="cp-orden" onClick={() => ordenar(c.id)}>
                      {c.conEntrega && entrega ? `${c.rotulo} ${entrega}` : c.rotulo}
                      <span
                        aria-hidden="true"
                        className={orden.col === c.id ? 'cp-orden-activa' : 'cp-orden-inerte'}
                      >
                        {orden.col === c.id ? (orden.dir === 'desc' ? ' ↓' : ' ↑') : ' ↕'}
                      </span>
                    </button>
                  ) : (
                    c.rotulo
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {porArea
              ? agruparPorArea(filas).map((g) => (
                  <Fragment key={g.area}>
                    <tr className="cp-grupo">
                      <th
                        id={`g-${g.area}`}
                        colSpan={anchoTabla}
                        scope="colgroup"
                        style={{ scrollMarginTop: MARGEN_ANCLA }}
                      >
                        {g.etiqueta}
                        {fraseParticion(g.particion) && (
                          <span className="cp-grupo-frase">{fraseParticion(g.particion)}.</span>
                        )}
                      </th>
                    </tr>
                    {g.indicadores.map(pinta)}
                  </Fragment>
                ))
              : filas.map(pinta)}
            {/* Agrupadas, las filas sin cociente no tienen área que las acoja:
                `agruparPorArea` sólo reparte las que tienen cociente, a
                propósito. Van al pie, que es donde van también sin agrupar. */}
            {porArea && filas.filter((i) => i.valor === null).map(pinta)}
          </tbody>
        </table>
      </div>

      {/* El total, y sobre todo lo que NO es. Sin esta frase, 17 millones
          debajo de una tabla municipal se leen como el presupuesto del
          ayuntamiento; son sólo los servicios que tienen cociente. */}
      <p
        style={{
          marginTop: 12,
          fontSize: 'var(--fs-aux)',
          color: 'var(--ink50)',
          maxWidth: '86ch',
        }}
      >
        Los {cuentas.total - cuentas.sinCociente} servicios con cociente declaran{' '}
        <strong className="mono">
          {totalCoste.toLocaleString('es-ES', {
            style: 'currency',
            currency: 'EUR',
            maximumFractionDigits: 0,
          })}
        </strong>{' '}
        de coste efectivo en la entrega de {entrega}. No es el gasto del ayuntamiento: son estos{' '}
        {cuentas.total - cuentas.sinCociente}. La posición no se colorea —un coste unitario alto es
        un precio, no un suspenso—. Por qué no hay nota global, en la{' '}
        <a href="/metodologia#eficiencia" style={{ color: 'var(--civic)' }}>
          metodología
        </a>
        .
      </p>

      {/* La leyenda del asterisco. Va aquí, visible y debajo de su tabla: §16
          es explícito —«ninguna información existe sólo al pasar el ratón»— y
          una marca sin leyenda sería exactamente eso. Se pinta sólo si hay
          alguna fila marcada, y el recuento sale de las filas. */}
      {conNombres && editoriales > 0 && (
        <p className="cp-libro-leyenda mono">
          <span aria-hidden="true">*</span> atribución nuestra en {editoriales} de{' '}
          {filas.filter((i) => competencias?.get(i.id)).length}: el reparto de esa competencia lo
          hicimos nosotros, no el portal de transparencia. El motivo, en la ficha del servicio.
        </p>
      )}

      {filas.length === 0 && (
        <p style={{ fontSize: 'var(--fs-aux)', color: 'var(--ink50)' }}>
          Ningún servicio cumple ese filtro en esta entrega.
        </p>
      )}
    </div>
  )
}
