import { Card, Pill, SectionHead } from '../Primitives'
import { Sparkline } from '../Charts'
import { TIER_TONE } from './Escalones'

/**
 * Un RESULTADO, publicado al lado del coste y nunca dentro de él.
 *
 * Vive dentro de la tarjeta de coste a la que acompaña, después de su banda de
 * pares, separado por su propio marco: la adyacencia es deliberada (es la
 * pregunta que el lector trae — ¿y qué se obtiene?) y la separación también
 * (dividir una cifra por la otra inventaría una relación que ningún dato
 * sostiene; por eso aquí no hay ningún cociente entre ambas, ni puede
 * haberlo: el tipo del resultado no tiene campos de coste).
 *
 * La frase no-causal (`comoSeLee`) no es letra pequeña: va en el cuerpo del
 * bloque, porque sin ella la vecindad de un coste p85 y un resultado p87
 * invita exactamente a la lectura que este panel existe para impedir.
 */
export function Resultado({ resultado, id }) {
  if (!resultado) return null
  const r = resultado
  const p = r.pares

  return (
    <div
      id={id}
      style={{
        marginTop: 14,
        padding: '12px 14px',
        border: '1px solid var(--intel, var(--border))',
        borderRadius: 'var(--r-card)',
        background: 'var(--intel-soft, var(--soft))',
      }}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <span
          className="mono"
          style={{
            fontSize: 'var(--fs-micro)',
            textTransform: 'uppercase',
            letterSpacing: '.07em',
            color: 'var(--intel-ink, var(--ink50))',
          }}
        >
          Resultado · al lado, nunca dividido
        </span>
        <Pill tone={TIER_TONE.outcome}>resultado</Pill>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 8 }}>
        <span className="mono" style={{ fontSize: 'var(--fs-card)', fontWeight: 600 }}>
          {r.valor.toLocaleString('es-ES', { maximumFractionDigits: 1 })} {r.unidad}
        </span>
        <span style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink50)' }}>
          {r.etiqueta} · {r.periodo}
        </span>
      </div>

      {r.serie?.length >= 2 && (
        <div style={{ marginTop: 8, maxWidth: 300 }}>
          <Sparkline data={r.serie.map((s) => s.valor)} color="var(--intel)" />
          <div
            className="mono"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 'var(--fs-micro)',
              color: 'var(--ink50)',
            }}
          >
            <span>{r.serie[0].anio}</span>
            <span>{r.serie[r.serie.length - 1].anio}</span>
          </div>
        </div>
      )}

      {p && (
        <p
          className="mono"
          style={{ margin: '8px 0 0', fontSize: 'var(--fs-aux)', color: 'var(--ink50)' }}
        >
          Mediana de {p.n} municipios comparables ({p.conjunto}):{' '}
          {p.mediana.toLocaleString('es-ES', { maximumFractionDigits: 1 })} {r.unidad} · aquí,
          percentil {p.percentil}
        </p>
      )}

      <p
        style={{
          margin: '10px 0 0',
          paddingLeft: 10,
          borderLeft: '2px solid var(--intel, var(--border))',
          fontSize: 'var(--fs-aux)',
          color: 'var(--ink70, var(--ink50))',
        }}
      >
        {r.comoSeLee}
      </p>

      {r.caveats?.length > 0 && (
        <ul
          style={{
            margin: '8px 0 0',
            paddingLeft: 18,
            fontSize: 'var(--fs-meta)',
            color: 'var(--ink50)',
          }}
        >
          {r.caveats.map((c) => (
            <li key={c} style={{ marginBottom: 3 }}>
              {c}
            </li>
          ))}
        </ul>
      )}

      <p
        className="mono"
        style={{ fontSize: 'var(--fs-aux)', color: 'var(--ink50)', margin: '8px 0 0' }}
      >
        {r.fuente.atribucion} ·{' '}
        <a
          href={r.fuente.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--civic)' }}
        >
          {r.fuente.nombre} ↗
        </a>
      </p>
    </div>
  )
}

/** Los resultados que NO existen, dichos donde el lector los buscaría. */
export function AusenciasResultados({ ausencias = [] }) {
  if (!ausencias.length) return null
  return (
    // En tarjeta, como sus tres hermanas de la cola de método. Iba suelta y era
    // el único bloque de los cuatro sin caja: leído de arriba abajo parecía el
    // pie del bloque anterior y no un apartado propio.
    <Card style={{ marginTop: 18 }}>
      <SectionHead
        as="h3"
        size="head"
        eyebrow="Ausencias"
        title="Resultados que faltan, y por qué"
      />
      <ul
        style={{
          margin: '8px 0 0',
          paddingLeft: 18,
          fontSize: 'var(--fs-meta)',
          color: 'var(--ink70, var(--ink50))',
        }}
      >
        {ausencias.map((a) => (
          <li key={a.tema} style={{ marginBottom: 4 }}>
            <strong>{a.tema}:</strong> {a.motivo}
          </li>
        ))}
      </ul>
    </Card>
  )
}
