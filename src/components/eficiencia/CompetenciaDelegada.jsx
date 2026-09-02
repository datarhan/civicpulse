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
import { RetratoCargo } from './RetratoCargo'

export function CompetenciaDelegada({ asignacion, conFoto = false, foto = null, fuente = null }) {
  const t = useT()
  if (!asignacion) return null
  const a = asignacion
  const esEditorial = a.confianza === 'editorial'

  // Con retrato, la línea suelta se convierte en la tarjeta de la maqueta: cara,
  // nombre enlazado, cargo y partido. Es la forma que la ficha necesita y que
  // /gestion no —allí la competencia es una línea al pie de una tarjeta de
  // indicador, sin sitio ni motivo para un retrato—, así que va tras una prop.
  //
  // El retrato NO se publica cuando el cargo ha pedido retirarlo: `fotoRetirada`
  // llega ya resuelta en `foto === null`. La rama sin foto no se salta, pinta
  // iniciales — la promesa de /aviso-legal es que se va la FOTO y se queda el
  // registro.
  if (conFoto) {
    return (
      <div style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <RetratoCargo foto={foto} nombre={a.nombre} />
          <div style={{ minWidth: 0 }}>
            <a
              href={`/cargos/${a.oficial}`}
              style={{
                fontSize: 'var(--fs-body)',
                fontWeight: 600,
                lineHeight: 1.3,
                display: 'block',
                color: 'var(--civic)',
              }}
            >
              {a.nombre}
            </a>
            <div style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink70)', marginTop: 2 }}>
              {a.cargo}
            </div>
            <div
              className="mono"
              style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginTop: 2 }}
            >
              {a.partido ? `${a.partido} · ` : ''}
              {t('eficiencia.competencia.eyebrow')}
            </div>
          </div>
        </div>

        <p
          style={{
            margin: '12px 0 0',
            paddingTop: 10,
            borderTop: '1px solid var(--border2)',
            fontSize: 'var(--fs-micro)',
            lineHeight: 1.55,
            color: 'var(--ink50)',
          }}
        >
          {esEditorial ? (
            <>
              El salto del área al servicio lo damos nosotros, no el ayuntamiento con sus palabras.
              Sirve para saber <strong>a quién preguntar</strong>: no dice que la cifra sea de
              nadie.
            </>
          ) : (
            <>
              El cargo nombra este servicio con las palabras del propio ayuntamiento, así que la
              línea va tal cual. Sirve para saber <strong>a quién preguntar</strong>: no dice que la
              cifra sea de nadie.
            </>
          )}
        </p>

        {esEditorial && a.razon && (
          <details style={{ marginTop: 6 }}>
            <summary
              style={{
                cursor: 'pointer',
                fontSize: 'var(--fs-micro)',
                color: 'var(--warn-ink)',
              }}
            >
              {t('eficiencia.competencia.editorial')}
            </summary>
            <p
              style={{
                margin: '4px 0 0',
                fontSize: 'var(--fs-micro)',
                color: 'var(--ink50)',
                lineHeight: 1.55,
              }}
            >
              {a.razon}
            </p>
          </details>
        )}

        {/* La procedencia, entera del fichero curado: qué decreto lo delega,
            dónde se publicó y cuándo lo firmamos nosotros. Sin esto la tarjeta
            sería una atribución sin papeles. */}
        {fuente?.decreto && (
          <p
            style={{
              margin: '8px 0 0',
              fontSize: 'var(--fs-micro)',
              lineHeight: 1.5,
              color: 'var(--ink50)',
            }}
          >
            Republicado del{' '}
            <a
              href={fuente.decreto.url}
              target="_blank"
              rel="noreferrer noopener"
              style={{ color: 'var(--civic)' }}
            >
              decreto de delegación de áreas ↗
            </a>
            {fuente.decreto.expediente
              ? ` · ${fuente.decreto.expediente.split('·')[0].trim()}`
              : ''}
            {fuente.decreto.fecha ? `, de ${fuente.decreto.fecha}` : ''}
            {/* «firmado el 2026-08-23» iba pegado al anuncio del BOP de 2023, y
                un decreto no se publica tres años antes de firmarse: la fecha
                del decreto es `fuente.decreto.fecha` y ésta es la de QUIEN
                curó la atribución. Dos fechas de dos cosas distintas puestas
                seguidas, la segunda sin sujeto. Lo señaló la revisión lectora
                del 2026-09-02. */}
            {a.firmadoEl ? ` · atribución firmada el ${a.firmadoEl}` : ''}
          </p>
        )}
      </div>
    )
  }

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
