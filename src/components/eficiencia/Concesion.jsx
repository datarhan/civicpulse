/**
 * Quién cobra el servicio cuya celda está vacía.
 *
 * Las dos fichas del agua llevan años en blanco con un motivo correcto —«está
 * concedido»— que a un lector le suena a que falta un dato. No falta: el coste
 * no cruza los libros del ayuntamiento porque lo cobra el concesionario
 * directamente del recibo. Decirlo sin decir a quién ni por cuánto deja la
 * ficha a medias, y precisamente en los dos servicios que llegan a todas las
 * casas del municipio.
 *
 * Los datos salen del registro, curados contra la ficha de PLACSP que se
 * enlaza — no de `tenders.json`, que trae este mismo expediente dos veces con
 * estados que se contradicen. Ver `ServicioDef.concesion`.
 *
 * Son cifras de la ADJUDICACIÓN, que es un hecho fechado y quieto. Nada de
 * estado vivo aquí: un «pendiente de formalizar» se quedaría falso en cuanto
 * se formalice, y esta página no tiene forma de enterarse.
 */
const eur = (v) =>
  v.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

const anio = (iso) => iso.slice(0, 4)

/**
 * Cuántos años dura, contados de las dos fechas y no escritos a mano.
 *
 * «Diecisiete años» es la cifra que hace entendible un importe de ocho dígitos,
 * y es justo la clase de número que alguien teclea una vez y se queda viejo en
 * cuanto el registro cambia una fecha. Sale de restar.
 */
const aniosDePlazo = (desdeIso, hastaIso) =>
  Math.round(
    (new Date(hastaIso).getTime() - new Date(desdeIso).getTime()) / (365.2425 * 24 * 3600 * 1000),
  )

export function Concesion({ concesion }) {
  if (!concesion) return null
  const c = concesion

  return (
    <div
      style={{
        marginTop: 10,
        paddingLeft: 10,
        borderLeft: '3px solid var(--warn)',
        fontSize: 'var(--fs-aux)',
        color: 'var(--ink70, var(--ink50))',
        lineHeight: 1.55,
      }}
    >
      <p style={{ margin: 0 }}>
        <strong>Lo presta {c.adjudicataria}</strong>, con un contrato de concesión adjudicado el{' '}
        <span className="mono">
          {new Date(c.adjudicadaEl).toLocaleDateString('es-ES', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </span>{' '}
        por <span className="mono">{eur(c.importe)}</span> y vigente hasta{' '}
        <span className="mono">{anio(c.hasta)}</span>. Concurrieron{' '}
        <span className="mono">{c.ofertas}</span> ofertas.
      </p>
      <p style={{ margin: '6px 0 0' }}>{c.nota}</p>
      {/* Que en una concesión paga el vecino por la tarifa ya lo dicen las dos
          frases de encima, así que aquí NO se repite: lo único que falta y
          ninguna cifra dice sola es qué clase de importe es ése. */}
      <p style={{ margin: '6px 0 0', fontSize: 'var(--fs-micro)' }}>
        El importe es el valor estimado del contrato por todo su plazo —
        <span className="mono">{aniosDePlazo(c.adjudicadaEl, c.hasta)}</span> años—, no un gasto
        anual.{' '}
        <a href={c.url} style={{ color: 'var(--civic)' }} target="_blank" rel="noreferrer noopener">
          Expediente en la Plataforma de Contratación ↗
        </a>
      </p>
    </div>
  )
}
