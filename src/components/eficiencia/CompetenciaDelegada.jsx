/**
 * Quién responde de este servicio — una línea, debajo de la lectura.
 *
 * ## Dónde va, y por qué ahí
 *
 * Debajo de `<Lectura>`, nunca en la cabecera junto a la cifra. El orden es el
 * argumento: la tarjeta ya coloca «esto es un precio y no un rendimiento»
 * pegado al número precisamente porque un lector saca su conclusión de lo
 * primero que lee. Poner un nombre propio ARRIBA, junto a «81.964,66
 * €/efectivo», construiría la frase que esta superficie no hace —«mira lo que
 * cuesta lo suyo»— antes de que llegue la advertencia que la desarma.
 *
 * ## Qué afirma
 *
 * Que el ayuntamiento tiene delegada esa área en esa persona. Es una
 * REPUBLICACIÓN de lo que el propio consistorio publica en su portal de
 * transparencia, y sirve para lo que sirve: saber a quién preguntar. No dice
 * que la cifra sea culpa de nadie, y el esquema del que sale no tiene ningún
 * campo donde quepa esa afirmación.
 *
 * ## `editorial` se marca, no se disimula
 *
 * Cuando el cargo nombra el servicio con las palabras del ayuntamiento
 * —«Áreas Industriales y Cementerio»— la línea va tal cual. Cuando el salto lo
 * damos nosotros —«Servicios públicos municipales» → recogida de residuos— el
 * lector tiene derecho a saberlo, así que se marca y la razón se puede abrir.
 * Un mapa que presentara sus dos clases con la misma tipografía segura estaría
 * escondiendo cuál de las dos firma quién.
 *
 * Sin asignación no se pinta nada: un hueco es honesto, y el "no consta" vive
 * en el fichero, no aquí.
 */
import { useT } from '../../i18n'

export function CompetenciaDelegada({ asignacion }) {
  const t = useT()
  if (!asignacion) return null
  const a = asignacion
  const esEditorial = a.confianza === 'editorial'

  return (
    <div
      style={{
        marginTop: 10,
        paddingTop: 8,
        borderTop: '1px dashed var(--border)',
        fontSize: 'var(--fs-aux)',
        color: 'var(--ink50)',
        lineHeight: 1.5,
      }}
    >
      <span
        className="mono"
        style={{
          fontSize: 'var(--fs-micro)',
          textTransform: 'uppercase',
          letterSpacing: '.06em',
        }}
      >
        {t('eficiencia.competencia.eyebrow')}
      </span>{' '}
      <span style={{ color: 'var(--ink70, var(--ink50))' }}>{a.cargo}</span>
      {' · '}
      <a href={`/cargos/${a.oficial}`} style={{ color: 'var(--civic)', fontWeight: 550 }}>
        {a.nombre}
      </a>
      {a.partido && <span> ({a.partido})</span>}
      {esEditorial && (
        <details style={{ marginTop: 4 }}>
          <summary
            style={{
              cursor: 'pointer',
              fontSize: 'var(--fs-micro)',
              color: 'var(--warn-ink)',
            }}
          >
            {t('eficiencia.competencia.editorial')}
          </summary>
          <p style={{ margin: '4px 0 0', maxWidth: '58ch' }}>{a.razon}</p>
        </details>
      )}
    </div>
  )
}
