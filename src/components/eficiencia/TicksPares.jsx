import { EjePercentil } from './EjePercentil'

/**
 * Los comparables, uno por raya, y Riba-roja donde le toca.
 *
 * Las rayas van por PUESTO y no por valor. Es la misma decisión que la escala
 * fija del eje, a otra altura: ordenadas por valor, el municipio que declara
 * 924 €/m² amontonaría las otras cuarenta contra el borde izquierdo y la ficha
 * volvería a enseñar un extremo en lugar de un reparto. Los cinco cuantiles del
 * pie dan la traducción a euros, que es donde el extremo sí debe verse.
 *
 * LOS EXTREMOS NO SE ROTULAN COMO SUELO Y TECHO. Decían «p0» y «p100», y en
 * policía local eso ponía 831,03 €/efectivo como el suelo del reparto — una
 * cifra que no puede ser el coste anual de un agente. El rótulo del percentil
 * le daba a un dato dudoso la autoridad de un cuantil. Ahora dicen lo único que
 * de ellos consta: es el MÍNIMO y el MÁXIMO declarados, y el pie avisa de que
 * los extremos de una distribución declarada no son un rango de referencia.
 *
 * Lo que este componente NO hace, y es deliberado: llamar inverosímil a la
 * cifra de otro ayuntamiento. Esa sería una valoración nuestra sobre la
 * declaración de un tercero, y aquí no hay con qué sostenerla — `atipico`
 * existe en el snapshot pero mide la serie PROPIA de un municipio contra la
 * mediana de su grupo (`ATIPICO_FACTOR`, indicadores.ts), no a los miembros del
 * grupo entre sí. Marcar a los pares pide extender el cálculo en
 * `compute-indicadores.ts` y publicar la marca; inventarse aquí un umbral sería
 * la nota global por la puerta de atrás. Se dice lo que consta y se enlaza a
 * las reglas de filtrado, que es donde vive lo que sí se descarta y por qué.
 */
export function TicksPares({ indicador, formatea }) {
  const p = indicador.pares
  if (!p) return null
  const cruza =
    Array.isArray(p.percentilBanda) && p.percentilBanda[0] <= 50 && p.percentilBanda[1] >= 50
  const razon = indicador.valor / p.mediana
  const valores = (p.miembros ?? []).map((m) => m.valor)
  const extremos = { min: Math.min(...valores), max: Math.max(...valores) }

  return (
    <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border2)' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <span
          className="mono"
          style={{
            fontSize: 'var(--fs-micro)',
            textTransform: 'uppercase',
            letterSpacing: '.07em',
            color: 'var(--ink50)',
          }}
        >
          Dónde queda entre los {p.n} comparables
        </span>
        <span className="mono" style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink70)' }}>
          {p.percentil} de cada 100 pagan menos · ×
          {razon.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} la
          mediana
        </span>
      </div>

      <div style={{ marginTop: 12 }}>
        <EjePercentil
          percentil={p.percentil}
          banda={p.percentilBanda}
          ticks={p.n}
          variante="detallada"
          etiqueta={`Riba-roja ${formatea(indicador.valor)}`}
          descripcion={`Percentil ${p.percentil} entre ${p.n} municipios comparables; mediana del grupo ${formatea(p.mediana)}`}
        />
      </div>

      <div
        className="mono cp-cuantiles"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 8,
          fontSize: 'var(--fs-micro)',
          color: 'var(--ink50)',
          marginTop: 2,
        }}
      >
        {/* Cinco rótulos, no tres. Con `space-between` y tres, «p25» aterriza
            en el 0 % del eje y «p75» en el 100 %: la escala diría una cosa y
            sus etiquetas otra, que es exactamente el defecto que este rediseño
            vino a arreglar una altura más arriba. Con los cinco cuantiles cada
            uno cae donde de verdad está.

            Los dos de los bordes ya no llevan «p0» y «p100»: el cuantil de un
            extremo es el propio extremo, y rotularlo como percentil le prestaba
            la autoridad de un estadístico a un dato suelto. */}
        <span>mín. declarado · {formatea(extremos.min)}</span>
        <span className="cp-cuantil-medio">p25 · {formatea(p.p25)}</span>
        <span>mediana · {formatea(p.mediana)}</span>
        <span className="cp-cuantil-medio">p75 · {formatea(p.p75)}</span>
        <span>máx. declarado · {formatea(extremos.max)}</span>
      </div>

      <p
        style={{
          margin: '10px 0 0',
          fontSize: 'var(--fs-aux)',
          color: 'var(--ink70)',
          lineHeight: 1.6,
        }}
      >
        Cada raya es un municipio valenciano de 15.000 a 40.000 habitantes que presta el servicio
        del mismo modo y declara las dos cifras. Van ordenados por puesto, no por valor, para que la
        escala no la fije el extremo del grupo.{' '}
        {Array.isArray(p.percentilBanda) && (
          <>
            La barra es la <strong>banda plausible del percentil</strong> ({p.percentilBanda[0]}–
            {p.percentilBanda[1]}):{' '}
            {cruza ? (
              <>
                cruza la mediana, así que esta posición <strong>no se distingue</strong> de la del
                grupo.
              </>
            ) : (
              <>
                no toca la mediana, así que esta posición <strong>sí se distingue</strong> de la del
                grupo.
              </>
            )}
          </>
        )}
      </p>

      {p.atipicos > 0 && (
        <p
          style={{
            margin: '10px 0 0',
            display: 'flex',
            gap: 10,
            alignItems: 'flex-start',
            background: 'var(--warn-soft)',
            border: '1px solid var(--warn)',
            borderRadius: 'var(--r-input)',
            padding: '11px 13px',
            fontSize: 'var(--fs-micro)',
            lineHeight: 1.55,
            color: 'var(--ink70)',
          }}
        >
          <span aria-hidden="true" className="cp-punto-warn" style={{ marginTop: 6 }} />
          <span>
            <strong>
              {p.atipicos === 1
                ? 'Uno de estos comparables queda fuera de un orden de magnitud'
                : `${p.atipicos} de estos comparables quedan fuera de un orden de magnitud`}
            </strong>{' '}
            respecto a la mediana del grupo — el menor declara {formatea(extremos.min)} y el mayor{' '}
            {formatea(extremos.max)}, una distancia que ninguna diferencia de gestión explica y que
            dice más de cómo se rellena el formulario que de los servicios. Se marcan con la misma
            regla que juzga la serie de Riba-roja, van señalados en la tabla de comparados y{' '}
            <strong>siguen contando en el percentil</strong>: son cifras oficiales y este panel no
            descarta lo que el ministerio publica.
          </span>
        </p>
      )}
    </div>
  )
}
