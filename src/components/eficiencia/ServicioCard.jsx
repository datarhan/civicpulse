import { Card, Pill } from '../Primitives'
import { useT } from '../../i18n'
import { BandaPares } from './BandaPares'

const GESTION = {
  directa: { label: 'gestión directa', tone: 'neutral' },
  concesion: { label: 'concesión', tone: 'warn' },
  mancomunada: { label: 'mancomunada', tone: 'neutral' },
  consorciada: { label: 'consorciada', tone: 'neutral' },
  convenio: { label: 'por convenio', tone: 'neutral' },
  mixta: { label: 'empresa mixta', tone: 'neutral' },
  otra: { label: 'otra forma de gestión', tone: 'ghost' },
  'sin-clasificar': { label: 'sin clasificar', tone: 'ghost' },
  'no-se-presta': { label: 'no se presta', tone: 'ghost' },
}

/**
 * Por qué NO hay cociente, en la lengua de un vecino.
 *
 * Cada uno de estos es un hecho sobre la rendición de cuentas del propio
 * ayuntamiento, no un defecto de esta página: por eso se enseñan en vez de
 * ocultar la tarjeta.
 */
const MOTIVO = {
  concesion:
    'El servicio está concedido: lo paga el concesionario y lo recupera vía tarifa, así que el coste que declara el ayuntamiento (0 €) no es lo que cuesta el servicio. Compararlo con un municipio de gestión directa diría que aquí es gratis.',
  'cero-sin-declarar':
    'Hay gasto declarado, pero la unidad física viene a cero. Un cero junto a un presupuesto real significa «no se declaró», no «no hubo».',
  'filas-duplicadas':
    'El ministerio publica más de un coste para este mismo servicio. Elegir uno sería un volado disfrazado de dato.',
  'atributo-ambiguo':
    'La misma magnitud está declarada dos veces con valores distintos en la misma entrega.',
  ausente: 'La entrega no trae esta magnitud.',
}

const TIER_TONE = { input: 'ghost', carga: 'neutral', output: 'ok', outcome: 'intel' }

export function ServicioCard({ indicador, formatea }) {
  const t = useT()
  const i = indicador
  const g = GESTION[i.modoGestion] ?? GESTION['sin-clasificar']
  const motivo = i.numerador.motivo ?? i.denominador.motivo
  const cita = i.citas?.[0]
  const declarados = i.serie.filter((p) => p.estado === 'declarado')
  const puntos = declarados.length

  return (
    <Card>
      <div
        style={{
          display: 'flex',
          gap: 10,
          alignItems: 'baseline',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 650, margin: 0 }}>{i.etiqueta}</h2>
        <div style={{ display: 'flex', gap: 6 }}>
          <Pill tone={g.tone}>{g.label}</Pill>
          <Pill tone={TIER_TONE[i.tier] ?? 'neutral'}>{t(`eficiencia.tier.${i.tier}`)}</Pill>
        </div>
      </div>

      {i.valor !== null ? (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 10 }}>
            <span
              className="mono"
              style={{ fontSize: 30, fontWeight: 600, letterSpacing: '-.02em' }}
            >
              {formatea(i.valor)}
            </span>
          </div>
          <div className="mono" style={{ fontSize: 12, color: 'var(--ink60)', marginTop: 2 }}>
            {i.numerador.valor.toLocaleString('es-ES', {
              style: 'currency',
              currency: 'EUR',
              maximumFractionDigits: 0,
            })}{' '}
            ÷ {i.denominador.valor.toLocaleString('es-ES')}{' '}
            {i.unidad.replace(/^€\//, '').replace(/^\//, '')} · entrega {cita?.entrega}
          </div>

          {/* Con dos entregas no se dibuja una línea: dos puntos no son una
              tendencia. Se enseñan los dos, cada uno con su año, y que el
              lector saque la conclusión — que en alumbrado es que la entrega
              de 2021 venía incompleta. */}
          {declarados.length >= 2 && (
            <p
              className="mono"
              style={{ fontSize: 12, margin: '8px 0 0', color: 'var(--ink70, var(--ink60))' }}
            >
              {declarados.map((p, idx) => (
                <span key={p.anio}>
                  {idx > 0 && ' → '}
                  {p.anio}: {formatea(p.valor)}
                </span>
              ))}
            </p>
          )}

          <BandaPares indicador={i} formatea={formatea} />
          {puntos < 2 && (
            <p style={{ fontSize: 11.5, color: 'var(--ink50)', margin: '10px 0 0' }}>
              {t('eficiencia.serie.ausente')}
            </p>
          )}
        </>
      ) : (
        <div style={{ marginTop: 10 }}>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--ink70, var(--ink60))' }}>
            {MOTIVO[motivo] ??
              'La fuente no permite calcular un coste unitario para este servicio.'}
          </p>
          {i.numerador.estado === 'declarado' && (
            <p className="mono" style={{ fontSize: 12, color: 'var(--ink60)', margin: '8px 0 0' }}>
              Coste declarado:{' '}
              {i.numerador.valor.toLocaleString('es-ES', {
                style: 'currency',
                currency: 'EUR',
                maximumFractionDigits: 0,
              })}
            </p>
          )}
        </div>
      )}

      {i.caveats?.length > 0 && (
        <ul style={{ margin: '12px 0 0', paddingLeft: 18, color: 'var(--ink60)', fontSize: 12 }}>
          {i.caveats.map((c) => (
            <li key={c} style={{ marginBottom: 3 }}>
              {c}
            </li>
          ))}
        </ul>
      )}

      {cita && (
        <p className="mono" style={{ fontSize: 10.5, color: 'var(--ink50)', margin: '10px 0 0' }}>
          Fuente: coste efectivo {cita.entrega} ·{' '}
          <a
            href={cita.url}
            style={{ color: 'var(--civic)' }}
            target="_blank"
            rel="noreferrer noopener"
          >
            Ministerio de Hacienda ↗
          </a>
        </p>
      )}
    </Card>
  )
}
