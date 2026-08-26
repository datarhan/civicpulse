import { MARGEN_ANCLA } from './anclas'
import { particionPosiciones } from '../../scraper/indicador-areas'

/**
 * Estado de la rendición — la respuesta corta, y la parte que manda.
 *
 * La página contestaba «¿cuánto cuesta y qué se obtiene?» con quince pantallas
 * y ninguna conclusión, y luego con una lectura rápida que contaba posiciones.
 * Contar posiciones era la mitad de la respuesta. La otra mitad, la que manda,
 * es que la mitad de esas posiciones no se distinguen y que las trece
 * divisiones se hacen entre una cantidad que nadie vuelve a medir: sin eso,
 * doce percentiles se leen como doce hechos.
 *
 * Este fichero exporta TRES piezas porque la revisión las repartió por la
 * página en vez de apilarlas en un bloque:
 *
 *   · `RespuestaCorta` — la frase de dos partes, que ahora es el lede del H1 y
 *     no un párrafo dentro de una tarjeta dentro de una pestaña. Era el
 *     hallazgo crítico del panel: el H1 preguntaba y la respuesta vivía detrás
 *     de la primera de seis pestañas, así que quien hacía scroll leía un
 *     submenú.
 *   · `EstadoRendicion` — los cuatro recuentos, al lado del titular.
 *   · `LoQuePermite` — «lo que permite concluir / lo que no», que baja DETRÁS
 *     de la tabla. Eran unas 480 palabras de método delante de las cifras que
 *     califican: correctas, y nadie las leía. Detrás del libro, y a una línea
 *     por viñeta, sí.
 *
 * Las cuatro cifras miden la RENDICIÓN DE CUENTAS, no el servicio, y el pie lo
 * dice. Aquí es donde este bloque roza la regla de no poner nota, así que la
 * roza con cuidado: son recuentos de lo que la fuente declara sobre sí misma
 * —entregas sin presentar, cifras sin remedir, casillas que no cruzan los
 * libros—, jamás una media de percentiles ni un 0-100. Un recuento de con qué
 * fidelidad se rinden cuentas no es una nota de cómo se gobierna, y
 * `LoQuePermite` existe para que esa distinción no dependa de la buena fe del
 * lector.
 *
 * Todas las cifras salen del snapshot. Ninguna está escrita: si la entrega
 * siguiente remide un denominador, el 13 baja solo.
 */
function recuentos(data) {
  const indicadores = data?.indicadores ?? []
  const conRatio = indicadores.filter((i) => i.valor !== null)
  const congelados = conRatio.filter((i) => i.declaracion?.denominador?.congelada)
  const desde = congelados
    .map((i) => i.declaracion.denominador.desde)
    .filter((a) => typeof a === 'number')
  return {
    indicadores,
    p: particionPosiciones(indicadores),
    conRatio,
    sinCociente: indicadores.length - conRatio.length,
    congelados,
    medibles: conRatio.filter((i) => i.declaracion?.denominador).length,
    rangoDesde: desde.length
      ? Math.min(...desde) === Math.max(...desde)
        ? `${Math.min(...desde)}`
        : `${Math.min(...desde)}-${Math.max(...desde)}`
      : null,
    inverosimiles: indicadores.reduce(
      (n, i) => n + (i.serie ?? []).filter((s) => s.atipico).length,
      0,
    ),
    sinRendir: data?.cobertura?.entregasNoPresentadas ?? [],
  }
}

/** La respuesta corta, con su segunda mitad primero. Va bajo el H1. */
export function RespuestaCorta({ data }) {
  const r = recuentos(data)
  if (r.indicadores.length === 0) return null
  return (
    <p
      style={{
        margin: '16px 0 0',
        fontSize: 'var(--fs-head)',
        color: 'var(--ink)',
        maxWidth: '60ch',
        lineHeight: 1.5,
        textWrap: 'pretty',
      }}
    >
      La respuesta corta tiene dos partes y manda la segunda: de los {r.p.situados} servicios
      comparables, <strong>{r.p.indistinguibles} no se distinguen de la mediana</strong> de
      municipios valencianos parecidos — y las {r.conRatio.length} divisiones se hacen entre una
      cantidad que nadie vuelve a medir, así que{' '}
      <strong>ninguna serie de esta página se puede leer como gestión.</strong>
    </p>
  )
}

/**
 * Los cuatro recuentos sobre la rendición, en la columna de al lado del
 * titular. Cada uno enlaza al sitio de la página donde se sostiene.
 */
export function EstadoRendicion({ data, firmados = 0, sinAncla = false }) {
  const r = recuentos(data)
  if (r.indicadores.length === 0) return null

  const cifras = [
    r.congelados.length > 0 && {
      href: '#sec-declaracion',
      valor: `${r.congelados.length} de ${r.medibles}`,
      etiqueta: r.rangoDesde
        ? `cantidades sin remedir desde ${r.rangoDesde}`
        : 'cantidades sin remedir',
    },
    r.inverosimiles > 0 && {
      href: '#sec-servicios',
      valor: String(r.inverosimiles),
      etiqueta: 'entregas publicadas que no pueden ser un coste',
    },
    r.sinCociente > 0 && {
      href: '#sec-servicios',
      valor: String(r.sinCociente),
      etiqueta: 'servicios cuyo coste no cruza los libros',
    },
    r.sinRendir.length > 0 && {
      href: '#sec-entregas',
      valor: r.sinRendir.join(' · '),
      etiqueta:
        r.sinRendir.length === 1
          ? 'la entrega que el ayuntamiento no presentó'
          : 'las entregas que el ayuntamiento no presentó',
      // Un AÑO no es una cantidad, y en la rejilla anterior 2020 salía en el
      // mismo mono grande que un 13 y un 7: un año en cifra grande se lee como
      // recuento. Va en pastilla, que es como se escribe una etiqueta.
      comoEtiqueta: true,
    },
  ].filter(Boolean)

  return (
    <div
      id={sinAncla ? undefined : 'sec-lectura'}
      className="cp-card"
      style={{
        marginTop: sinAncla ? 0 : 16,
        scrollMarginTop: MARGEN_ANCLA,
        borderLeft: '3px solid var(--warn)',
      }}
    >
      <div
        className="mono"
        style={{
          fontSize: 'var(--fs-micro)',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '.1em',
          color: 'var(--warn-ink)',
        }}
      >
        Estado de la rendición
      </div>

      <div style={{ marginTop: 12 }}>
        {cifras.map((c, n) => (
          <a
            key={c.etiqueta}
            href={c.href}
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              gap: 12,
              padding: '10px 0',
              borderTop: n === 0 ? undefined : '1px solid var(--border2)',
              color: 'inherit',
              textDecoration: 'none',
            }}
          >
            <span style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink50)', lineHeight: 1.35 }}>
              {c.etiqueta}
            </span>
            <span
              className="mono"
              style={
                c.comoEtiqueta
                  ? {
                      flex: 'none',
                      whiteSpace: 'nowrap',
                      fontSize: 'var(--fs-meta)',
                      fontWeight: 600,
                      color: 'var(--ink70)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--r-pill)',
                      padding: '2px 9px',
                    }
                  : {
                      flex: 'none',
                      whiteSpace: 'nowrap',
                      fontSize: 'var(--fs-head)',
                      fontWeight: 600,
                      letterSpacing: '-.02em',
                    }
              }
            >
              {c.comoEtiqueta ? `año ${c.valor}` : c.valor}
            </span>
          </a>
        ))}
      </div>

      <p style={{ margin: '12px 0 0', fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>
        {cifras.length === 4 ? 'Cuatro' : cifras.length} recuentos sobre la{' '}
        <strong>rendición de cuentas</strong>, no sobre el servicio.
        {firmados > 0 && (
          <>
            {' '}
            <a href="#hallazgos" style={{ color: 'var(--civic)' }}>
              {firmados === 1 ? '1 ficha firmada' : `${firmados} fichas firmadas`} sobre este panel
            </a>
            .
          </>
        )}
      </p>
    </div>
  )
}

/** Lo que las cifras permiten concluir y lo que no. Va DETRÁS del libro. */
export function LoQuePermite({ data }) {
  const r = recuentos(data)
  if (r.indicadores.length === 0) return null
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-card)',
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '18px 20px', background: 'var(--paper)' }}>
        <div
          className="mono"
          style={{
            fontSize: 'var(--fs-micro)',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '.07em',
            color: 'var(--civic-ink)',
          }}
        >
          Lo que estas cifras permiten concluir
        </div>
        <ul
          style={{
            margin: '11px 0 0',
            paddingLeft: 17,
            fontSize: 'var(--fs-aux)',
            color: 'var(--ink70)',
            lineHeight: 1.55,
          }}
        >
          <li style={{ marginBottom: 6 }}>
            Cuánto costó cada servicio en {data?.anioBase} y entre qué cantidad se divide. Las dos
            celdas son del ministerio.
          </li>
          <li style={{ marginBottom: 6 }}>
            De qué lado de la mediana cae, cuando la muestra da para afirmarlo:{' '}
            <strong>
              {r.p.abajo + r.p.arriba} de {r.p.situados}
            </strong>{' '}
            — {r.p.abajo} por debajo, {r.p.arriba} por encima.
          </li>
          <li>
            Cuántas veces la mediana es cada cifra. Esa magnitud sí es robusta, aunque el puesto
            exacto no lo sea.
          </li>
        </ul>
      </div>
      <div
        style={{
          padding: '18px 20px',
          background: 'var(--surf)',
          borderLeft: '1px solid var(--border)',
        }}
      >
        <div
          className="mono"
          style={{
            fontSize: 'var(--fs-micro)',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '.07em',
            color: 'var(--warn-ink)',
          }}
        >
          Lo que no
        </div>
        <ul
          style={{
            margin: '11px 0 0',
            paddingLeft: 17,
            fontSize: 'var(--fs-aux)',
            color: 'var(--ink70)',
            lineHeight: 1.55,
          }}
        >
          <li style={{ marginBottom: 6 }}>
            Si el servicio está bien prestado: la fuente no publica un solo indicador de calidad.
          </li>
          <li style={{ marginBottom: 6 }}>
            Si mejora o empeora: con el divisor congelado, coste y declaración se mueven juntos.
          </li>
          <li>
            Un puesto: {r.p.indistinguibles} de las {r.p.situados} posiciones tienen bandas
            solapadas con el grupo.
          </li>
        </ul>
      </div>
    </div>
  )
}
