import { Card } from '../Primitives'
import { MARGEN_ANCLA } from '../SubnavSecciones'
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
 * Las cuatro cifras de arriba miden la RENDICIÓN DE CUENTAS, no el servicio, y
 * el pie lo dice. Aquí es donde este bloque roza la regla de no poner nota, así
 * que la roza con cuidado: son recuentos de lo que la fuente declara sobre sí
 * misma —entregas sin presentar, cifras sin remedir, casillas que no cruzan los
 * libros—, jamás una media de percentiles ni un 0-100. Un recuento de con qué
 * fidelidad se rinden cuentas no es una nota de cómo se gobierna, y el bloque
 * de dos columnas existe para que esa distinción no dependa de la buena fe del
 * lector.
 *
 * Todas las cifras salen del snapshot. Ninguna está escrita: si la entrega
 * siguiente remide un denominador, el 13 baja solo.
 */
export function EstadoRendicion({ data, firmados = 0, preguntas, sinAncla = false }) {
  const indicadores = data?.indicadores ?? []
  if (indicadores.length === 0) return null

  const p = particionPosiciones(indicadores)
  const conRatio = indicadores.filter((i) => i.valor !== null)
  const sinCociente = indicadores.length - conRatio.length
  const congelados = conRatio.filter((i) => i.declaracion?.denominador?.congelada)
  const medibles = conRatio.filter((i) => i.declaracion?.denominador).length
  const desde = congelados
    .map((i) => i.declaracion.denominador.desde)
    .filter((a) => typeof a === 'number')
  const rangoDesde = desde.length
    ? Math.min(...desde) === Math.max(...desde)
      ? `${Math.min(...desde)}`
      : `${Math.min(...desde)}-${Math.max(...desde)}`
    : null
  const inverosimiles = indicadores.reduce(
    (n, i) => n + (i.serie ?? []).filter((s) => s.atipico).length,
    0,
  )
  const sinRendir = data?.cobertura?.entregasNoPresentadas ?? []

  const cifras = [
    congelados.length > 0 && {
      href: '#sec-cobertura',
      valor: `${congelados.length} de ${medibles}`,
      etiqueta: rangoDesde
        ? `cantidades sin remedir desde ${rangoDesde}`
        : 'cantidades sin remedir',
    },
    sinRendir.length > 0 && {
      href: '#sec-cobertura',
      valor: sinRendir.join(' · '),
      etiqueta:
        sinRendir.length === 1
          ? 'la entrega que el ayuntamiento no presentó'
          : 'las entregas que el ayuntamiento no presentó',
    },
    inverosimiles > 0 && {
      href: '#sec-servicios',
      valor: String(inverosimiles),
      etiqueta: 'entregas publicadas que no pueden ser un coste',
    },
    sinCociente > 0 && {
      href: '#sec-servicios',
      valor: String(sinCociente),
      etiqueta: 'servicios cuyo coste no cruza los libros',
    },
  ].filter(Boolean)

  const bloque = preguntas?.bloques?.[0]
  const primera = bloque?.items?.[0]

  return (
    <Card
      id={sinAncla ? undefined : 'sec-lectura'}
      style={{ marginTop: sinAncla ? 0 : 16, scrollMarginTop: MARGEN_ANCLA }}
    >
      <p
        style={{
          margin: 0,
          fontSize: 'var(--fs-body)',
          color: 'var(--ink)',
          maxWidth: '70ch',
          lineHeight: 1.6,
        }}
      >
        La respuesta honesta a «¿va bien o mal?» tiene dos partes, y la segunda es la que manda:{' '}
        <strong>
          de los {p.situados} servicios comparables, {p.indistinguibles} no se distinguen de la
          mediana
        </strong>{' '}
        de municipios parecidos — y las {conRatio.length} divisiones se hacen entre una cantidad que
        nadie vuelve a medir, así que{' '}
        <strong>ninguna serie de esta página se puede leer como gestión.</strong>
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(auto-fit, minmax(160px, 1fr))`,
          gap: 10,
          marginTop: 18,
        }}
      >
        {cifras.map((c) => (
          <a
            key={c.etiqueta}
            href={c.href}
            style={{
              display: 'block',
              padding: '12px 14px',
              border: '1px solid var(--border)',
              borderLeft: '3px solid var(--warn)',
              borderRadius: 'var(--r-input)',
              color: 'inherit',
              textDecoration: 'none',
            }}
          >
            <span
              className="mono"
              style={{
                display: 'block',
                fontSize: 'var(--fs-card)',
                fontWeight: 600,
                letterSpacing: '-.02em',
              }}
            >
              {c.valor}
            </span>
            <span
              style={{
                display: 'block',
                marginTop: 4,
                fontSize: 'var(--fs-micro)',
                color: 'var(--ink50)',
                textTransform: 'uppercase',
                letterSpacing: '.05em',
                lineHeight: 1.35,
              }}
            >
              {c.etiqueta}
            </span>
          </a>
        ))}
      </div>

      <p style={{ margin: '8px 0 0', fontSize: 'var(--fs-aux)', color: 'var(--ink50)' }}>
        Estas {cifras.length === 4 ? 'cuatro' : cifras.length} cifras miden la{' '}
        <strong>rendición de cuentas</strong>, no el servicio. No hay nota global del ayuntamiento
        en esta página y no la va a haber: lo que se cuenta aquí es qué parte de sus propias cifras
        se puede usar.
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

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          marginTop: 20,
          border: '1px solid var(--border2)',
          borderRadius: 'var(--r-card)',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '16px 18px', background: 'var(--paper)' }}>
          <div
            className="mono"
            style={{
              fontSize: 'var(--fs-micro)',
              textTransform: 'uppercase',
              letterSpacing: '.07em',
              color: 'var(--civic-ink)',
            }}
          >
            Lo que estas cifras permiten concluir
          </div>
          <ul
            style={{
              margin: '10px 0 0',
              paddingLeft: 18,
              fontSize: 'var(--fs-aux)',
              color: 'var(--ink70)',
              lineHeight: 1.6,
            }}
          >
            <li style={{ marginBottom: 7 }}>
              Cuánto costó cada servicio en {data?.anioBase} y entre qué cantidad declarada se
              divide. Las dos celdas son del ministerio y están citadas.
            </li>
            <li style={{ marginBottom: 7 }}>
              De qué lado de la mediana de sus comparables cae, cuando la muestra da para afirmarlo:{' '}
              <strong>
                {p.abajo + p.arriba} de {p.situados}
              </strong>{' '}
              — {p.abajo} por debajo, {p.arriba} por encima.
            </li>
            <li>
              Cuántas veces la mediana es cada cifra. Esa magnitud sí es robusta, aunque el puesto
              exacto no lo sea.
            </li>
          </ul>
        </div>
        <div
          style={{
            padding: '16px 18px',
            background: 'var(--surf)',
            borderLeft: '1px solid var(--border2)',
          }}
        >
          <div
            className="mono"
            style={{
              fontSize: 'var(--fs-micro)',
              textTransform: 'uppercase',
              letterSpacing: '.07em',
              color: 'var(--warn-ink)',
            }}
          >
            Lo que no
          </div>
          <ul
            style={{
              margin: '10px 0 0',
              paddingLeft: 18,
              fontSize: 'var(--fs-aux)',
              color: 'var(--ink70)',
              lineHeight: 1.6,
            }}
          >
            <li style={{ marginBottom: 7 }}>
              Si el servicio está bien prestado. La fuente no publica un solo indicador de calidad:
              un coste bajo puede ser eficiencia o menos servicio.
            </li>
            <li style={{ marginBottom: 7 }}>
              Si mejora o empeora. Con el divisor congelado, el cociente se mueve por el coste y por
              la declaración a la vez, y no se pueden separar.
            </li>
            <li>
              Un puesto. {p.indistinguibles} de las {p.situados} posiciones no se distinguen del
              grupo, y una diferencia entre dos municipios con bandas solapadas no es un hecho.
            </li>
          </ul>
        </div>
      </div>

      {primera && (
        <div
          style={{
            marginTop: 16,
            padding: '14px 16px',
            border: '1px solid var(--border2)',
            borderRadius: 'var(--r-card)',
          }}
        >
          <div
            className="mono"
            style={{
              fontSize: 'var(--fs-micro)',
              textTransform: 'uppercase',
              letterSpacing: '.07em',
              color: 'var(--ink50)',
            }}
          >
            Y una pregunta registrada, con destinatario
          </div>
          <p
            style={{
              margin: '8px 0 0',
              fontSize: 'var(--fs-aux)',
              color: 'var(--ink)',
              maxWidth: '76ch',
              lineHeight: 1.6,
            }}
          >
            {primera.q}
          </p>
          <p style={{ margin: '6px 0 0', fontSize: 'var(--fs-aux)', color: 'var(--ink50)' }}>
            A {bloque.destinatario} · réplica abierta y se publicará íntegra ·{' '}
            <a href="#sec-preguntas" style={{ color: 'var(--civic)' }}>
              todas las preguntas del panel
            </a>
          </p>
        </div>
      )}
    </Card>
  )
}
