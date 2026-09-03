import { Link } from 'react-router-dom'
import { Card } from '../Primitives'

const RELLENO = {
  aprobado: 'var(--ok)',
  rechazado: 'var(--crit)',
  retirado: 'var(--ink30)',
  aplazado: 'var(--ink30)',
}

const ROTULO = {
  aprobado: 'aprobado',
  rechazado: 'rechazado',
  retirado: 'retirado',
  aplazado: 'aplazado',
}

/**
 * El patrón más nítido del pleno, que el índice no decía en ninguna parte: de
 * las votaciones que hemos podido transcribir, casi todas se aprueban.
 *
 * La tira se dibuja desde `lista`, el desenlace real de cada votación, y no
 * desde un contador: si mañana entra una tercera categoría aparece sola. La
 * leyenda se construye igual, recorriendo lo que hay.
 *
 * Las celdas van de RELLENO, así que usan el tono base; los rótulos van en
 * tinta y usan el `-ink`, que es el que se redefine en oscuro.
 */
export function TarjetaVotaciones({ votos, total }) {
  if (!votos?.total) return null
  const presentes = [...new Set(votos.lista.filter(Boolean))]
  const cuenta = (o) => votos.lista.filter((x) => x === o).length
  const { record, breakdown } = votos.retiradas

  return (
    <Card style={{ padding: 20 }}>
      <div
        style={{
          fontSize: 'var(--fs-meta)',
          fontWeight: 500,
          textTransform: 'uppercase',
          letterSpacing: '.05em',
          color: 'var(--ink50)',
        }}
      >
        Votaciones transcritas · {votos.sesiones} sesiones de {total}
      </div>
      <h2
        style={{ fontSize: 'var(--fs-head)', fontWeight: 700, margin: '7px 0 0', lineHeight: 1.3 }}
      >
        De {votos.total} votaciones registradas, {votos.aprobado} se aprobaron
      </h2>

      <div style={{ display: 'flex', gap: 3, marginTop: 14 }} aria-hidden="true">
        {votos.lista.map((o, i) => (
          <span
            key={i}
            style={{
              flex: 1,
              height: 30,
              borderRadius: 'var(--r-input)',
              background: RELLENO[o] || 'var(--ink30)',
            }}
          />
        ))}
      </div>

      <div style={{ display: 'flex', gap: 18, marginTop: 10, flexWrap: 'wrap' }}>
        {presentes.map((o) => (
          <span
            key={o}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 'var(--fs-micro)',
              color: 'var(--ink70)',
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 10,
                height: 10,
                borderRadius: 'var(--r-input)',
                background: RELLENO[o] || 'var(--ink30)',
                flex: 'none',
              }}
            />
            {ROTULO[o] || o} · {cuenta(o)}
          </span>
        ))}
      </div>

      <p
        style={{
          margin: '14px 0 0',
          fontSize: 'var(--fs-aux)',
          lineHeight: 1.6,
          color: 'var(--ink70)',
        }}
      >
        Los desgloses por grupo salen de una <strong>transcripción automática</strong> del vídeo, no
        del acta: el resultado lo publica el ayuntamiento, el reparto de votos lo infiere el
        sistema. Por eso cada uno lleva su procedencia por separado.
      </p>

      {/* La retirada se publica. Es la mitad que la auditoría echaba en falta:
          existía el registro y no lo contaba ninguna pantalla. Las cifras salen
          de `stats.retracted`, no de una frase escrita a mano. */}
      {(record > 0 || breakdown > 0) && (
        <p
          style={{
            margin: '10px 0 0',
            padding: '11px 13px',
            background: 'var(--warn-soft)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-input)',
            fontSize: 'var(--fs-aux)',
            lineHeight: 1.55,
            color: 'var(--ink70)',
          }}
        >
          <strong>
            {record} {record === 1 ? 'registro' : 'registros'} y {breakdown}{' '}
            {breakdown === 1 ? 'desglose' : 'desgloses'} retirados.
          </strong>{' '}
          Cuando la transcripción no sostiene el reparto que se publicó, el registro se retira y se
          dice — no se corrige en silencio.
        </p>
      )}

      <div style={{ marginTop: 11 }}>
        <Link to="/metodologia" style={{ fontSize: 'var(--fs-aux)', color: 'var(--civic)' }}>
          Cómo se procesa una sesión →
        </Link>
      </div>
    </Card>
  )
}
