/**
 * La división, escrita como división.
 *
 * Un lector preguntó, con estas palabras, «81.965 €/efectivo, ¿qué quieren
 * decir estos números?». La ficha lo contestaba en prosa, tres párrafos más
 * abajo. Aquí lo contesta la aritmética: coste declarado ÷ cantidad declarada =
 * coste unitario, con las tres cantidades a la vista y cada una con su fecha.
 *
 * El divisor va en ámbar cuando lleva entregas sin remedir, y es la razón de
 * que el bloque exista: si el numerador se actualiza cada año y el denominador
 * no, el cociente se mueve por una sola de sus dos mitades. Verlo al lado del
 * resultado es distinto de leerlo en una salvedad.
 */
export function EcuacionCoste({ indicador, formatea, entrega }) {
  const i = indicador
  const congelada = i.declaracion?.denominador?.congelada
  const desde = i.declaracion?.denominador?.desde

  const celda = (area, rotulo, valor, nota, tono) => (
    <span className={`cp-eq-${area}`}>
      <span
        className="mono"
        style={{
          display: 'block',
          fontSize: 'var(--fs-micro)',
          textTransform: 'uppercase',
          letterSpacing: '.06em',
          color: 'var(--ink50)',
        }}
      >
        {rotulo}
      </span>
      <span
        className="mono"
        style={{
          display: 'block',
          fontSize: 'var(--fs-head)',
          fontWeight: 500,
          marginTop: 3,
          color: tono ?? 'inherit',
        }}
      >
        {valor}
      </span>
      <span
        style={{
          display: 'block',
          fontSize: 'var(--fs-micro)',
          color: tono ?? 'var(--ink50)',
          marginTop: 2,
        }}
      >
        {nota}
      </span>
    </span>
  )

  const signo = (s, area) => (
    <span
      aria-hidden="true"
      className={`mono cp-eq-${area}`}
      style={{ fontSize: 'var(--fs-card)', color: 'var(--ink50)' }}
    >
      {s}
    </span>
  )

  return (
    <div className="cp-ecuacion">
      {celda(
        'num',
        `Coste declarado ${entrega ?? ''}`.trim(),
        `${i.numerador.valor.toLocaleString('es-ES', { maximumFractionDigits: 0 })} €`,
        'actualizado cada entrega',
      )}
      {signo('÷', 'div')}
      {/* El rótulo NO lleva participio, y no es por brevedad: decía «declaradas»
          en duro y de los ocho divisores del panel siete son masculinos —«52
          efectivos declaradas», «4.514 puntos de luz declaradas»—. El snapshot
          da singular y plural, no género, así que la concordancia no se puede
          derivar; se quita la palabra que la exige y el estado baja a la nota,
          que ya estaba escrita sin género. Mismo motivo en la nota de abajo. */}
      {celda(
        'den',
        `${i.divisor.plural.charAt(0).toUpperCase()}${i.divisor.plural.slice(1)}`,
        `${i.denominador.valor.toLocaleString('es-ES')}`,
        congelada ? `la misma cifra desde ${desde}` : 'según la declaración de esta entrega',
        congelada ? 'var(--warn-ink)' : undefined,
      )}
      {signo('=', 'eq')}
      <span className="cp-eq-res">
        <span
          className="mono"
          style={{
            display: 'block',
            fontSize: 'var(--fs-page)',
            fontWeight: 600,
            letterSpacing: '-.02em',
          }}
        >
          {formatea(i.valor)}
        </span>
        <span
          style={{
            display: 'block',
            fontSize: 'var(--fs-micro)',
            color: 'var(--ink50)',
            marginTop: 2,
          }}
        >
          al año, por cada {i.divisor.singular}
        </span>
      </span>
    </div>
  )
}
