import { Card, Pill } from '../Primitives'
import { useT } from '../../i18n'
import { BandaPares } from './BandaPares'
import { SerieServicio } from './SerieServicio'
import { TIER_TONE } from './Escalones'
import { leerIndicador, lecturaVisible, chipDeclaracion } from '../../scraper/indicador-lectura'
import { Lectura } from './Lectura'

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

export function ServicioCard({ indicador, formatea }) {
  const t = useT()
  const i = indicador
  const g = GESTION[i.modoGestion] ?? GESTION['sin-clasificar']
  const motivo = i.numerador.motivo ?? i.denominador.motivo
  const cita = i.citas?.[0]
  // La cifra en cuerpo 30 y la banda ya dicen «cuánto» y «dónde queda»; la
  // lectura sólo aporta lo que ninguna de las dos puede enseñar.
  const lectura = lecturaVisible(leerIndicador(i), {
    cifra: i.valor !== null,
    banda: Boolean(i.pares),
  })
  const declarados = i.serie.filter((p) => p.estado === 'declarado')
  const puntos = declarados.length
  const chip = chipDeclaracion(i)
  // Avisos y salvedades comparten destino: los primeros los cuenta ahora el
  // gráfico (la tendencia es la forma; la entrega imposible, el ⚠ del borde), y
  // las segundas son el texto largo que se leía una vez y se saltaba nueve.
  const salvedades = [...lectura.avisos, ...(i.caveats ?? [])]
  const plegable = salvedades.length + (declarados.length >= 2 ? 1 : 0)

  return (
    // El id es el destino de los enlaces del resumen de arriba; el margen de
    // scroll deja la cabecera de la tarjeta por debajo de la barra fija.
    <Card id={`s-${i.id}`} style={{ scrollMarginTop: 76 }}>
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
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {/* La marca del denominador parado va PRIMERA y en tono de aviso:
              es lo que condiciona cómo se lee todo lo demás de la tarjeta. */}
          {chip && <Pill tone="warn">{chip.texto}</Pill>}
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
          <div className="mono" style={{ fontSize: 12, color: 'var(--ink50)', marginTop: 2 }}>
            {i.numerador.valor.toLocaleString('es-ES', {
              style: 'currency',
              currency: 'EUR',
              maximumFractionDigits: 0,
            })}{' '}
            ÷ {i.denominador.valor.toLocaleString('es-ES')}{' '}
            {i.unidad.replace(/^€\//, '').replace(/^\//, '')} · entrega {cita?.entrega}
          </div>

          {/* La serie va dibujada, con las entregas inverosímiles fuera de la
              escala y marcadas donde estaban. Las cifras exactas, año por año,
              siguen en el desplegable de abajo. */}
          <SerieServicio puntos={declarados} formatea={formatea} unidad={i.unidad} />

          <BandaPares indicador={i} formatea={formatea} />
          {puntos < 2 && (
            <p style={{ fontSize: 11.5, color: 'var(--ink50)', margin: '10px 0 0' }}>
              {t('eficiencia.serie.ausente')}
            </p>
          )}
        </>
      ) : (
        <div style={{ marginTop: 10 }}>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--ink70, var(--ink50))' }}>
            {MOTIVO[motivo] ??
              'La fuente no permite calcular un coste unitario para este servicio.'}
          </p>
          {i.numerador.estado === 'declarado' && (
            <p className="mono" style={{ fontSize: 12, color: 'var(--ink50)', margin: '8px 0 0' }}>
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

      <Lectura lectura={lectura} conAvisos={false} />

      {/* Lo que la tarjeta guardaba abierto y nadie leía.

          Ninguna de estas frases se borra —son el contenido de esta página, no
          su letra pequeña—, pero tenerlas las diez abiertas a la vez daba trece
          pantallas de las que diez eran repetición, y enterraba la salvedad de
          la tarjeta once bajo la de la tarjeta uno. Va en <details> y no
          desmontado: el texto sigue en el DOM, así que la búsqueda del
          navegador lo encuentra y lo despliega.

          El recuento en el resumen es la parte que hace que se abra: «(4)»
          promete algo concreto donde «ver más» no promete nada. */}
      {plegable > 0 && (
        <details style={{ marginTop: 10 }}>
          <summary style={{ cursor: 'pointer', fontSize: 12.5, color: 'var(--civic)' }}>
            {declarados.length >= 2 ? 'Serie completa y salvedades' : 'Salvedades'} ({plegable})
          </summary>

          {declarados.length >= 2 && (
            <p
              className="mono"
              style={{ fontSize: 12, margin: '10px 0 0', color: 'var(--ink70, var(--ink50))' }}
            >
              {declarados.map((p, idx) => (
                <span key={p.anio}>
                  {idx > 0 && ' · '}
                  <span
                    style={
                      p.atipico
                        ? { color: 'var(--warn-ink)', textDecoration: 'underline dotted' }
                        : undefined
                    }
                    title={
                      p.atipico
                        ? `Cifra inverosímil: los municipios comparables declararon una mediana de ${formatea(p.medianaPares)} ese año`
                        : undefined
                    }
                  >
                    {p.anio}: {formatea(p.valor)}
                    {p.atipico ? ' ⚠' : ''}
                  </span>
                </span>
              ))}
            </p>
          )}

          {salvedades.length > 0 && (
            <ul
              style={{ margin: '10px 0 0', paddingLeft: 18, color: 'var(--ink50)', fontSize: 12 }}
            >
              {salvedades.map((c) => (
                <li key={c} style={{ marginBottom: 3 }}>
                  {c}
                </li>
              ))}
            </ul>
          )}
        </details>
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
