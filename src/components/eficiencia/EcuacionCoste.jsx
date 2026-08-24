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

  const celda = (rotulo, valor, nota, tono) => (
    <span>
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

  const signo = (s) => (
    <span
      aria-hidden="true"
      className="mono"
      style={{ fontSize: 'var(--fs-card)', color: 'var(--ink50)' }}
    >
      {s}
    </span>
  )

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto 1fr auto auto',
        gap: 12,
        alignItems: 'center',
        marginTop: 18,
        padding: 16,
        background: 'var(--surf)',
        border: '1px solid var(--border2)',
        borderRadius: 'var(--r-card)',
      }}
    >
      {celda(
        `Coste declarado ${entrega ?? ''}`.trim(),
        `${i.numerador.valor.toLocaleString('es-ES', { maximumFractionDigits: 0 })} €`,
        'actualizado cada entrega',
      )}
      {signo('÷')}
      {celda(
        `${i.divisor.plural.charAt(0).toUpperCase()}${i.divisor.plural.slice(1)} declaradas`,
        `${i.denominador.valor.toLocaleString('es-ES')}`,
        congelada ? `la misma cifra desde ${desde}` : 'declarada en esta entrega',
        congelada ? 'var(--warn-ink)' : undefined,
      )}
      {signo('=')}
      <span style={{ textAlign: 'right' }}>
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
