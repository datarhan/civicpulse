import { useT } from '../../i18n'

/**
 * Se pinta justo debajo de la barra de un desglose que un curador corrigió.
 *
 * Una corrección, a diferencia de una retirada, deja la barra publicada: el
 * desglose sigue ahí, ahora citado a la fuente que lo sostiene (el acta). Pero
 * el lector tiene derecho a saber que lo que ve no es lo que este sitio
 * publicó al principio, así que la nota dice que se corrigió, cuándo y por qué.
 *
 * Nunca repite el desglose anterior: ese queda en el registro `corrections[]`
 * de /data/pleno-votes.json, con quién lo corrigió y de dónde salía. Pintarlo
 * aquí pondría dos recuentos de los mismos grupos uno junto al otro, y el
 * equivocado se leería como un dato más.
 *
 * El borde es continuo (el de la retirada es discontinuo): el desglose está
 * publicado, no retirado.
 */
export function VoteBreakdownCorrected({ correction }) {
  const t = useT()
  if (!correction) return null
  const { reason, correctedAt } = correction
  const day = typeof correctedAt === 'string' ? correctedAt.slice(0, 10) : null
  return (
    <div
      data-desglose-corregido
      style={{
        marginTop: 8,
        padding: '8px 10px',
        borderRadius: 'var(--r-input)',
        border: '1px solid var(--border2)',
        background: 'var(--soft)',
      }}
    >
      <div
        className="mono"
        style={{
          fontSize: 'var(--fs-micro)',
          letterSpacing: 0.3,
          color: 'var(--ink50)',
          marginBottom: 3,
        }}
      >
        {t('plenoDetail.voto.desgloseCorregido')}
        {day ? ` · ${day}` : ''}
      </div>
      <div style={{ fontSize: 'var(--fs-aux)', color: 'var(--ink70)', lineHeight: 1.45 }}>
        {reason}
      </div>
    </div>
  )
}
