import { Link } from 'react-router-dom'
import { Card } from '../Primitives'
import { rotuloRetiradas } from '../../lib/pleno-summary'
import { rellena } from '../../lib/formatters'
import { conHuecos } from '../../lib/huecos'
import { rotuloDe, useLocale } from '../../i18n'

const RELLENO = {
  aprobado: 'var(--ok)',
  rechazado: 'var(--crit)',
  retirado: 'var(--ink30)',
  aplazado: 'var(--ink30)',
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
  const { locale, t } = useLocale()
  if (!votos?.total) return null
  const presentes = [...new Set(votos.lista.filter(Boolean))]
  const cuenta = (o) => votos.lista.filter((x) => x === o).length
  const frase = rotuloRetiradas(votos.retiradas, { t, locale })

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
        {rellena(t('plenos.indice.votos.eyebrow'), { n: votos.sesiones, total })}
      </div>
      <h2
        style={{ fontSize: 'var(--fs-head)', fontWeight: 700, margin: '7px 0 0', lineHeight: 1.3 }}
      >
        {rellena(t('plenos.indice.votos.titulo'), {
          total: votos.total,
          aprobado: votos.aprobado,
        })}
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
            {rotuloDe(t, `plenos.indice.votos.desenlace.${o}`, o)} · {cuenta(o)}
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
        {conHuecos(t('plenos.indice.votos.desglose'), {
          '{transcripcion}': <strong>{t('plenos.indice.votos.transcripcion')}</strong>,
        })}
      </p>

      {/* La retirada se publica. Es la mitad que la auditoría echaba en falta:
          existía el registro y no lo contaba ninguna pantalla. Las cifras salen
          de `stats.retracted`, no de una frase escrita a mano — y la frase se
          construye recorriendo los alcances que trae la instantánea, igual que
          la tira de desenlaces. Nombrar dos a mano es lo que hizo que esta
          tarjeta dijera «2 registros y 1 desglose» mientras /datos, que los suma
          todos, decía cuatro: el mismo fichero y dos cifras publicadas. */}
      {frase && (
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
          <strong>{frase}.</strong> {t('plenos.indice.votos.retirada')}
        </p>
      )}

      <div style={{ marginTop: 11 }}>
        <Link to="/metodologia" style={{ fontSize: 'var(--fs-aux)', color: 'var(--civic)' }}>
          {t('plenos.indice.comoSeProcesa')}
        </Link>
      </div>
    </Card>
  )
}
