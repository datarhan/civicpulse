/**
 * Quién es la empresa, con cada dato pegado a su anuncio.
 *
 * ## Por qué cada línea lleva su enlace
 *
 * El precedente de la casa es el bloque de `basuras`, que nombró a los dueños
 * de una contrata y citó el BORME anuncio a anuncio. Aquí se hace igual y por
 * el mismo motivo: la pregunta de quién es la empresa a la que un ayuntamiento
 * confía diecisiete años de un servicio esencial merece una respuesta
 * documentada, y una respuesta documentada es la que el lector puede ir a
 * comprobar sin fiarse de nosotros. Por eso el enlace va en cada dato y no en
 * una nota al pie.
 *
 * ## Los límites no son letra pequeña
 *
 * Se pintan con el mismo peso que los datos, no plegados. Una ficha societaria
 * dice cosas verdaderas sobre una empresa viva; lo que NO establece —quién está
 * detrás del socio único, qué hay antes de la ventana barrida— es parte de lo
 * que el lector necesita para calibrar el resto. Esconderlo detrás de un
 * desplegable sería publicarlo sin publicarlo.
 *
 * El componente no interpreta nada: pinta lo que el fichero firmado dice, y el
 * esquema no tiene ningún campo donde quepa un juicio.
 */

const SERIF = "'Fraunces', Georgia, serif"

function Dato({ etiqueta, dato }) {
  if (!dato) return null
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(110px, 150px) 1fr',
        gap: 10,
        padding: '7px 0',
        borderTop: '1px solid var(--border)',
        alignItems: 'baseline',
      }}
    >
      <span
        className="mono"
        style={{
          fontSize: 'var(--fs-micro)',
          textTransform: 'uppercase',
          letterSpacing: '.06em',
          color: 'var(--ink50)',
        }}
      >
        {etiqueta}
      </span>
      <span style={{ fontSize: 'var(--fs-meta)' }}>
        <strong>{dato.valor}</strong>{' '}
        <a
          href={dato.fuente.url}
          target="_blank"
          rel="noreferrer noopener"
          style={{ color: 'var(--civic)', fontSize: 'var(--fs-micro)' }}
          title={dato.fuente.cita}
        >
          {dato.fuente.referencia} ↗
        </a>
      </span>
    </div>
  )
}

export function FichaSociedad({ sociedad }) {
  if (!sociedad) return null
  const s = sociedad
  const hoja = s.hojaRegistral

  return (
    <figure
      style={{
        margin: '18px 0',
        padding: '16px 18px',
        background: 'var(--soft)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-card)',
      }}
    >
      <div
        className="mono"
        style={{
          fontSize: 'var(--fs-micro)',
          textTransform: 'uppercase',
          letterSpacing: '.08em',
          color: 'var(--ink50)',
          marginBottom: 8,
        }}
      >
        Quién es la empresa
      </div>
      <h3
        style={{
          fontFamily: SERIF,
          fontSize: 'var(--fs-head)',
          fontWeight: 600,
          margin: '0 0 4px',
          lineHeight: 1.2,
        }}
      >
        {s.denominacion}
      </h3>
      <p style={{ margin: '0 0 10px', fontSize: 'var(--fs-meta)', color: 'var(--ink70)' }}>
        {s.porQueAparece}
      </p>

      <div>
        <Dato etiqueta="CIF" dato={s.cif} />
        {hoja && (
          <Dato
            etiqueta="Registro"
            dato={{
              valor: `${hoja.registro} · hoja ${hoja.hoja}${hoja.tomo ? `, tomo ${hoja.tomo}` : ''}`,
              fuente: hoja.fuente,
            }}
          />
        )}
        <Dato etiqueta="Socio único" dato={s.socioUnico} />
        <Dato etiqueta="Preside" dato={s.presidencia} />
        <Dato etiqueta="Auditor" dato={s.auditor} />
      </div>

      {s.hechos?.length > 0 && (
        <ul
          style={{
            margin: '12px 0 0',
            paddingLeft: 18,
            fontSize: 'var(--fs-meta)',
            color: 'var(--ink70)',
            lineHeight: 1.55,
          }}
        >
          {s.hechos.map((h) => (
            <li key={h.fuente.referencia} style={{ marginBottom: 5 }}>
              {h.que}{' '}
              <a
                href={h.fuente.url}
                target="_blank"
                rel="noreferrer noopener"
                style={{ color: 'var(--civic)', fontSize: 'var(--fs-micro)' }}
                title={h.fuente.cita}
              >
                {h.fuente.referencia} ↗
              </a>
            </li>
          ))}
        </ul>
      )}

      <div
        style={{
          marginTop: 12,
          paddingTop: 10,
          borderTop: '1px solid var(--border)',
        }}
      >
        <div
          className="mono"
          style={{
            fontSize: 'var(--fs-micro)',
            textTransform: 'uppercase',
            letterSpacing: '.06em',
            color: 'var(--ink50)',
            marginBottom: 5,
          }}
        >
          Lo que esta ficha no establece
        </div>
        <ul
          style={{
            margin: 0,
            paddingLeft: 18,
            fontSize: 'var(--fs-aux)',
            color: 'var(--ink70)',
            lineHeight: 1.5,
          }}
        >
          {s.limites.map((l) => (
            <li key={l} style={{ marginBottom: 4 }}>
              {l}
            </li>
          ))}
        </ul>
      </div>
    </figure>
  )
}
