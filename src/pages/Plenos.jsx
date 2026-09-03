import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ExtLink } from '../components/Primitives'
import DataAsOf from '../components/DataAsOf'
import { estiloPlenos } from '../components/plenos/plenos.css.js'
import { EscaleraCobertura } from '../components/plenos/EscaleraCobertura'
import { TablaSesiones } from '../components/plenos/TablaSesiones'
import { TarjetaVotaciones } from '../components/plenos/TarjetaVotaciones'
import { TarjetaDeclaraciones } from '../components/plenos/TarjetaDeclaraciones'
import { RepartoPorArea } from '../components/plenos/RepartoPorArea'
import { usePlenos } from '../hooks/usePlenos'
import { usePlenoClaimsManifest } from '../hooks/usePlenoClaims'
import { usePlenoAgendas } from '../hooks/usePlenoAgendas'
import { usePlenoFindings } from '../hooks/usePlenoFindings'
import { usePlenoVotes } from '../hooks/usePlenoVotes'
import { resumenPlenos } from '../lib/pleno-summary'
import { fmtDateLong } from '../lib/formatters'
import { useT } from '../i18n'

const PORTAL_PARTICIPA = 'https://participa.ribarroja.es'

/**
 * El índice de sesiones, reconstruido sobre `Revisión Eficiencia.dc.html` (3b)
 * del proyecto de Claude Design.
 *
 * La auditoría de esa maqueta reunía ocho señalamientos y todos apuntaban al
 * mismo sitio: **el índice contaba cosas sin decir nunca sobre cuántas
 * sesiones las contaba**. Una fila muda podía ser una sesión sin nada que
 * declarar o una sesión que no hemos leído, y no había forma de distinguirlas;
 * los dos únicos denominadores de la página vivían dentro de una tarjeta
 * derivada que iba por delante del objeto y de un párrafo de leyenda que la
 * revisión lectora malinterpretó dos barridos seguidos.
 *
 * De ahí el orden nuevo: la escalera de cobertura arriba —61 · 39 · 22 · 7,
 * anidados—, luego las sesiones con columnas rotuladas y la ausencia dibujada
 * aparte del cero, y sólo después los agregados.
 *
 * NINGUNA CIFRA ESTÁ ESCRITA AQUÍ. Todas salen de `resumenPlenos`, que las
 * deriva de los cinco snapshots. La maqueta traía dos que no se sostienen y
 * derivarlas las corrige solas: decía «desde junio de 2023» cuando la sesión
 * más antigua es del 23 de enero de 2023 —siete anteriores a esta
 * corporación— y hablaba de 2 retractaciones de hallazgos cuando el registro
 * lleva doce.
 *
 * La paleta de la maqueta está caducada y no se pega: su azul es, hexadecimal
 * a hexadecimal, el color del PP, y este sitio atribuye afirmaciones a
 * partidos. La marca es `--civic`.
 */
export default function Plenos() {
  const t = useT()
  const { loading, data: plenosData } = usePlenos()
  const { data: manifest } = usePlenoClaimsManifest()
  const { data: agendasData } = usePlenoAgendas()
  const { data: findingsData } = usePlenoFindings()
  const { data: votesData } = usePlenoVotes()

  const r = useMemo(
    () =>
      resumenPlenos({
        plenos: plenosData,
        agendas: agendasData,
        manifest,
        votes: votesData,
        findings: findingsData,
      }),
    [plenosData, agendasData, manifest, votesData, findingsData],
  )

  return (
    <div
      className="cp-page"
      style={{ padding: '24px 24px 48px', maxWidth: 1180, margin: '0 auto' }}
    >
      <style>{estiloPlenos}</style>

      <div className="cp-plenos-hero" style={{ marginBottom: 30 }}>
        <div>
          <div
            className="mono"
            style={{
              fontSize: 'var(--fs-micro)',
              color: 'var(--ink50)',
              textTransform: 'uppercase',
              letterSpacing: '.08em',
            }}
          >
            {t('plenos.eyebrow')}
          </div>
          <h1
            style={{
              fontSize: 'var(--fs-page)',
              fontWeight: 700,
              letterSpacing: '-.015em',
              margin: '6px 0 0',
              lineHeight: 1.14,
            }}
          >
            {t('plenos.title')}
          </h1>
          {/* El lede lleva los cuatro números de la escalera en prosa, porque
              un lector que no mira la tarjeta de al lado tiene que salir de
              aquí sabiendo el denominador. */}
          <p
            style={{
              margin: '14px 0 0',
              fontSize: 'var(--fs-head)',
              lineHeight: 1.5,
              color: 'var(--ink)',
              maxWidth: '62ch',
            }}
          >
            El ayuntamiento ha celebrado <strong>{r.total} sesiones</strong>
            {r.ventana.desde && <> desde el {fmtDateLong(r.ventana.desde)}</>}. De ésas, tenemos el
            orden del día de {r.agenda.sesiones}, declaraciones extraídas de {r.embudo.sesiones} y{' '}
            <strong>votaciones transcritas de {r.votos.sesiones}</strong>. Lo que esta página no
            cuenta no es que no ocurriera: es que aún no lo hemos leído.
          </p>
          <p
            style={{
              margin: '12px 0 0',
              fontSize: 'var(--fs-aux)',
              lineHeight: 1.55,
              color: 'var(--ink70)',
              maxWidth: '66ch',
            }}
          >
            Cada sesión enlaza a su acta en regmeet.com, el gestor del propio ayuntamiento.{' '}
            <Link to="/metodologia" style={{ color: 'var(--civic)' }}>
              Cómo se procesa una sesión →
            </Link>
          </p>
        </div>
        <EscaleraCobertura escalera={r.escalera} />
      </div>

      <div style={{ height: 1, background: 'var(--border)', margin: '0 0 30px' }} />

      <TablaSesiones filas={r.filas} filtros={r.filtros} porAnio={r.porAnio} loading={loading} />

      <div className="cp-plenos-duo" style={{ marginTop: 30 }}>
        <TarjetaVotaciones votos={r.votos} total={r.total} />
        <TarjetaDeclaraciones embudo={r.embudo} />
      </div>

      <div style={{ marginTop: 30 }}>
        <RepartoPorArea departamentos={r.departamentos} agenda={r.agenda} sesiones={r.total} />
      </div>

      <div className="cp-plenos-pie" style={{ marginTop: 30 }}>
        <p
          style={{
            margin: 0,
            fontSize: 'var(--fs-aux)',
            lineHeight: 1.55,
            color: 'var(--ink70)',
            maxWidth: '60ch',
          }}
        >
          Fuente: actas y vídeos publicados por el Ayuntamiento de Riba-roja de Túria en
          regmeet.com.
          {r.ventana.hasta && <> Última sesión recogida: {fmtDateLong(r.ventana.hasta)}.</>}{' '}
          {plenosData?.generatedAt && <DataAsOf iso={plenosData.generatedAt} label="Plenos" />}
        </p>
        <span style={{ flex: 1 }} />
        {/* La participación ciudadana sale del índice de plenos: es contenido
            de otra sección y se llevaba el último tercio del scroll. El enlace
            va al portal vivo —participa.ribarroja.es responde 200— y no a un
            volcado nuestro; el snapshot sigue catalogado en /datos. */}
        <div style={{ display: 'flex', gap: 16, fontSize: 'var(--fs-aux)', flexWrap: 'wrap' }}>
          <ExtLink href={PORTAL_PARTICIPA} style={{ color: 'var(--civic)' }}>
            Participación ciudadana →
          </ExtLink>
          <Link to="/hallazgos" style={{ color: 'var(--civic)' }}>
            Hallazgos →
          </Link>
          <Link to="/metodologia" style={{ color: 'var(--civic)' }}>
            Metodología →
          </Link>
        </div>
      </div>
    </div>
  )
}
