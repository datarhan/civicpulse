import { Link, useParams } from 'react-router-dom'
import { Card, Pill } from '../components/Primitives'
import { EcuacionCoste } from '../components/eficiencia/EcuacionCoste'
import { estiloFicha } from '../components/eficiencia/ficha.css.js'
import { TicksPares } from '../components/eficiencia/TicksPares'
import { TablaPares } from '../components/eficiencia/TablaPares'
import { DeclaracionEntregas } from '../components/eficiencia/DeclaracionEntregas'
import { SerieServicio, enTerminosReales } from '../components/eficiencia/SerieServicio'
import { Lectura } from '../components/eficiencia/Lectura'
import { Resultado } from '../components/eficiencia/Resultado'
import { Concesion } from '../components/eficiencia/Concesion'
import { CompetenciaDelegada } from '../components/eficiencia/CompetenciaDelegada'
import { TIER_TONE } from '../components/eficiencia/Escalones'
import { GESTION, MOTIVO } from '../components/eficiencia/vocabulario'
import { leerIndicador, lecturaVisible, chipDeclaracion } from '../scraper/indicador-lectura'
import { useIndicadores } from '../hooks/useIndicadores'
import { useCompetencias, indexarCompetencias, useNombresVisibles } from '../hooks/useCompetencias'
import { useT } from '../i18n'

/**
 * /eficiencia/:id — la ficha de un servicio.
 *
 * El libro contesta «¿cómo van los quince?»; esto contesta «¿y éste?». Antes
 * eran la misma pantalla y por eso ninguna de las dos preguntas se contestaba
 * bien: quince andamios de nueve partes en columna no dejan comparar, y una
 * tarjeta dentro de esa columna no tiene sitio para enseñar la división.
 *
 * Aquí sí: la ecuación con sus dos mitades y sus dos fechas, los comparables
 * uno a uno, la década con la mediana del grupo detrás, y lo que el
 * ayuntamiento declaró entrega a entrega. Ninguna cifra es nueva; lo nuevo es
 * que caben.
 *
 * El nombre del titular de la competencia va al FINAL, después de la frase que
 * dice qué mide y qué no. El docblock de `CompetenciaDelegada` lleva desde
 * agosto explicando por qué: un nombre propio pegado a «81.964,66 €/efectivo»
 * construye «mira lo que cuesta lo suyo» antes de que el lector llegue a la
 * frase que lo desarma.
 */
export default function ServicioDetalle() {
  const { id } = useParams()
  const t = useT()
  const { loading, error, data } = useIndicadores()
  const { data: competencias } = useCompetencias()
  const nombresOn = useNombresVisibles()

  const i = (data?.indicadores ?? []).find((x) => x.id === id)

  const formatea = (v) => {
    if (typeof v !== 'number') return '—'
    const dec = v >= 1000 ? 0 : 2
    return `${v.toLocaleString('es-ES', { minimumFractionDigits: dec, maximumFractionDigits: dec })} ${i.unidad}`
  }

  if (loading) {
    return (
      <div className="cp-page" style={{ padding: 24, maxWidth: 820, margin: '0 auto' }}>
        <p style={{ color: 'var(--ink50)' }}>Cargando…</p>
      </div>
    )
  }

  if (error || !i) {
    return (
      <div className="cp-page" style={{ padding: 24, maxWidth: 820, margin: '0 auto' }}>
        <Link
          to="/eficiencia"
          className="mono"
          style={{ fontSize: 'var(--fs-micro)', color: 'var(--civic)' }}
        >
          ← El libro de servicios
        </Link>
        <Card style={{ marginTop: 16 }}>
          <p style={{ margin: 0, color: 'var(--ink50)' }}>
            No hay ninguna ficha con ese identificador en la entrega publicada.
          </p>
        </Card>
      </div>
    )
  }

  const cita = i.citas?.[0]
  const entrega = cita?.entrega ?? data?.anioBase
  const gestion = GESTION[i.modoGestion] ?? GESTION['sin-clasificar']
  const chip = chipDeclaracion(i)
  const lecturaEntera = leerIndicador(i)
  const lectura = lecturaVisible(lecturaEntera, { banda: Boolean(i.pares), cifra: true })
  const salvedades = [...(lecturaEntera.avisos ?? []), ...(i.caveats ?? [])]
  const motivo = i.numerador.motivo ?? i.denominador.motivo
  const competencia = nombresOn ? indexarCompetencias(competencias).get(i.id) : null
  const resultado = (data?.resultados?.items ?? []).find((r) => r.servicioRelacionado === i.id)
  // Todo o nada: si a una entrega declarada le falta su índice, la serie
  // entera vuelve a euros corrientes y el rótulo lo dice. Mezclar las dos
  // haría que la distancia entre la línea y la mediana dejara de significar.
  const serie = enTerminosReales((i.serie ?? []).filter((p) => p.estado === 'declarado'))

  return (
    <div className="cp-page" style={{ padding: 24, maxWidth: 820, margin: '0 auto' }}>
      <style>{estiloFicha}</style>
      <Link
        to="/eficiencia"
        className="mono"
        style={{ fontSize: 'var(--fs-micro)', color: 'var(--civic)' }}
      >
        ← El libro de servicios
      </Link>

      <div
        className="mono"
        style={{
          fontSize: 'var(--fs-micro)',
          textTransform: 'uppercase',
          letterSpacing: '.08em',
          color: 'var(--ink50)',
          marginTop: 12,
        }}
      >
        Coste efectivo · entrega {entrega} · programa {i.servicio}
      </div>
      <h1
        style={{
          fontSize: 'var(--fs-card)',
          fontWeight: 700,
          letterSpacing: '-.015em',
          margin: '2px 0 0',
        }}
      >
        {i.etiqueta}
      </h1>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
        {chip && <Pill tone="warn">{chip.texto}</Pill>}
        <Pill tone={gestion.tone}>{gestion.label}</Pill>
        <Pill tone={TIER_TONE[i.tier] ?? 'neutral'}>{t(`eficiencia.tier.${i.tier}`)}</Pill>
      </div>

      {i.avisoDeclaracion && (
        <p
          style={{
            margin: '14px 0 0',
            padding: '10px 12px',
            borderLeft: '3px solid var(--warn)',
            background: 'var(--warn-soft)',
            fontSize: 'var(--fs-aux)',
            color: 'var(--ink70)',
            maxWidth: '72ch',
            lineHeight: 1.6,
          }}
        >
          {i.avisoDeclaracion}
        </p>
      )}

      {i.valor === null ? (
        <>
          <p
            style={{
              margin: '16px 0 0',
              fontSize: 'var(--fs-aux)',
              color: 'var(--ink70)',
              maxWidth: '72ch',
              lineHeight: 1.6,
            }}
          >
            <strong>Sin cociente posible.</strong> {MOTIVO[motivo] ?? MOTIVO.ausente}
          </p>
          <p
            className="mono"
            style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink50)', marginTop: 8 }}
          >
            {i.numerador.valor === null
              ? 'El ayuntamiento no declara coste para este servicio: la casilla viene vacía, no a cero.'
              : `Coste declarado: ${i.numerador.valor.toLocaleString('es-ES')} €`}
          </p>
          {/* Sin el `que`: para una ficha bloqueada, `MOTIVO` dice lo mismo y
              más —incluye por qué compararla diría que aquí es gratis—, así que
              dejar las dos frases era decirlo dos veces. Lo que se queda es el
              `como`, que es la parte que MOTIVO no cubre: esto es un hecho
              sobre la declaración, no un hueco de esta página. */}
          <Lectura lectura={{ ...lectura, que: null }} />
          <Concesion concesion={i.concesion} />
        </>
      ) : (
        <>
          <EcuacionCoste indicador={i} formatea={formatea} entrega={entrega} />
          <Lectura lectura={lectura} />
          <TicksPares indicador={i} formatea={formatea} />

          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border2)' }}>
            <span
              className="mono"
              style={{
                fontSize: 'var(--fs-micro)',
                textTransform: 'uppercase',
                letterSpacing: '.07em',
                color: 'var(--ink50)',
              }}
            >
              La década ·{' '}
              {serie.reales
                ? `euros constantes de ${entrega}`
                : 'euros corrientes: falta el índice de algún año'}
            </span>
            <SerieServicio puntos={serie.puntos} formatea={formatea} unidad={i.unidad} />
          </div>

          <DeclaracionEntregas
            indicador={i}
            entregasPublicadas={data?.cobertura?.entregasPublicadas}
            noPresentadas={data?.cobertura?.entregasNoPresentadas ?? []}
          />

          {i.declaracion?.paresMedibles > 0 && (
            <p style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink50)', margin: '10px 0 0' }}>
              <strong className="mono">
                {i.declaracion.paresCongelados} de {i.declaracion.paresMedibles}
              </strong>{' '}
              comparables medibles hacen lo mismo con esta misma cifra.
            </p>
          )}

          {resultado && <Resultado resultado={resultado} id={`r-${i.id}`} />}
          <TablaPares pares={i.pares} formatea={formatea} />
        </>
      )}

      <div
        style={{
          marginTop: 20,
          paddingTop: 16,
          borderTop: '1px solid var(--border2)',
          display: 'flex',
          gap: 24,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: 1, minWidth: 280 }}>
          <span
            className="mono"
            style={{
              fontSize: 'var(--fs-micro)',
              textTransform: 'uppercase',
              letterSpacing: '.07em',
              color: 'var(--ink50)',
            }}
          >
            Salvedades · {salvedades.length}
          </span>
          {salvedades.length > 0 ? (
            <ul
              style={{
                margin: '8px 0 0',
                paddingLeft: 18,
                fontSize: 'var(--fs-meta)',
                color: 'var(--ink50)',
                lineHeight: 1.55,
              }}
            >
              {salvedades.map((c) => (
                <li key={c} style={{ marginBottom: 5 }}>
                  {c}
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ margin: '8px 0 0', fontSize: 'var(--fs-meta)', color: 'var(--ink50)' }}>
              Esta ficha no arrastra ninguna.
            </p>
          )}
          <p style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', margin: '8px 0 0' }}>
            Las reglas numeradas que citan estas salvedades:{' '}
            <a href="/metodologia#reglas-eficiencia" style={{ color: 'var(--civic)' }}>
              reglas de filtrado y comparabilidad
            </a>
            .
          </p>
        </div>

        <div style={{ width: 250 }}>
          <span
            className="mono"
            style={{
              fontSize: 'var(--fs-micro)',
              textTransform: 'uppercase',
              letterSpacing: '.07em',
              color: 'var(--ink50)',
            }}
          >
            Fuente y réplica
          </span>
          {cita && (
            <p
              className="mono"
              style={{
                margin: '8px 0 0',
                fontSize: 'var(--fs-micro)',
                color: 'var(--ink50)',
                lineHeight: 1.6,
              }}
            >
              Coste efectivo {cita.entrega} · celda{' '}
              <span style={{ color: 'var(--ink70)' }}>
                {String(i.numerador.fuente ?? '')
                  .split(':')
                  .slice(2)
                  .join(':')}
              </span>
              <br />
              <a
                href={cita.url}
                target="_blank"
                rel="noreferrer noopener"
                style={{ color: 'var(--civic)' }}
              >
                Ministerio de Hacienda ↗
              </a>
            </p>
          )}
          <p
            style={{
              margin: '8px 0 0',
              fontSize: 'var(--fs-micro)',
              color: 'var(--ink50)',
              lineHeight: 1.6,
            }}
          >
            Derecho de réplica abierto para el ayuntamiento:{' '}
            <a href="/aviso-legal" style={{ color: 'var(--civic)' }}>
              cómo responder
            </a>
            .
          </p>
          <CompetenciaDelegada asignacion={competencia} />
        </div>
      </div>
    </div>
  )
}
