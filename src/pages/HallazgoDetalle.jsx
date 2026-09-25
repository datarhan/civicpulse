import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Card, SectionHead } from '../components/Primitives'
import DataAsOf from '../components/DataAsOf'
import { FindingDetailCard, RetiradaDatos } from './Hallazgos'
import { usePlenoFindings } from '../hooks/usePlenoFindings'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { isMachineAuthored } from '../scraper/finding-authorship'
import { useT } from '../i18n'

const ENVOLTORIO = { padding: '24px 24px 48px', maxWidth: 900, margin: '0 auto' }
const VOLVER = { color: 'var(--civic)', fontSize: 'var(--fs-meta)', textDecoration: 'none' }

/**
 * Un hallazgo en su propia dirección: `/hallazgos/:id`.
 *
 * El enlace permanente era un ancla (`/hallazgos#id`). Quien lo compartía
 * mandaba la página entera, con todas las fichas, y la tarjeta que enseñaban
 * WhatsApp o Telegram era la de `/hallazgos`, porque sus rastreadores no
 * ejecutan JavaScript y nunca llegan al ancla. Aquí la ficha es la MISMA,
 * `FindingDetailCard`, y no una copia: el RefList ya enseñó que dos copias de
 * una ficha acaban diciendo cosas distintas. Los enlaces viejos con ancla
 * siguen funcionando en la lista.
 *
 * Tres estados, y ninguno redirige:
 * - publicado: la ficha, con una cabecera que dice quién la redactó ANTES del
 *   titular (§00, principio 2), como la de la lista;
 * - retirado: la huella del registro de retiradas, nunca el texto, para que un
 *   enlace compartido antes de la retirada no parezca una página que no existió;
 * - desconocido: lo dice. Mandar a la portada escondería que el enlace no lleva
 *   a nada.
 */
export default function HallazgoDetalle() {
  const t = useT()
  const { id } = useParams()
  const { data, loading, error } = usePlenoFindings()
  const hallazgo = useMemo(() => (data?.items ?? []).find((f) => f.id === id), [data, id])
  const retirada = useMemo(
    () => (data?.retractions ?? []).find((r) => r.findingId === id),
    [data, id],
  )
  useDocumentTitle(hallazgo ? hallazgo.title : retirada ? t('hallazgo.retirado') : null)

  if (loading) {
    return <div style={{ padding: 32, color: 'var(--ink50)', fontSize: 'var(--fs-aux)' }}>…</div>
  }

  if (error) {
    return (
      <div className="cp-page" style={ENVOLTORIO}>
        <SectionHead eyebrow={t('nav.hallazgos')} title={t('hallazgo.errorCarga')} />
        <Link to="/hallazgos" style={VOLVER}>
          {t('hallazgo.volver')}
        </Link>
      </div>
    )
  }

  if (!hallazgo) {
    return (
      <div className="cp-page" style={ENVOLTORIO}>
        <Link to="/hallazgos" style={VOLVER}>
          {t('hallazgo.volver')}
        </Link>
        <div style={{ marginTop: 12 }}>
          <SectionHead
            eyebrow={t('nav.hallazgos')}
            title={retirada ? t('hallazgo.retirado') : t('hallazgo.noEncontrado')}
          />
        </div>
        {retirada ? (
          <Card>
            <p
              style={{
                margin: '0 0 10px',
                fontSize: 'var(--fs-aux)',
                color: 'var(--ink70)',
                lineHeight: 1.55,
              }}
            >
              {t('hallazgo.retiradoTexto')}
            </p>
            <div style={{ fontSize: 'var(--fs-aux)', color: 'var(--ink70)', lineHeight: 1.55 }}>
              <RetiradaDatos r={retirada} />
            </div>
          </Card>
        ) : (
          <p style={{ fontSize: 'var(--fs-aux)', color: 'var(--ink70)', lineHeight: 1.55 }}>
            {t('hallazgo.noEncontradoTexto')}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="cp-page" style={ENVOLTORIO}>
      <Link to="/hallazgos" style={VOLVER}>
        {t('hallazgo.volver')}
      </Link>
      {/* Quién la redactó, antes del titular. Se deriva de la firma de ESTA
          ficha con la misma regla que la cabecera de la lista: una firma que no
          es de una persona conocida cuenta como máquina. */}
      <div
        className="mono"
        style={{
          marginTop: 12,
          marginBottom: 8,
          fontSize: 'var(--fs-micro)',
          color: 'var(--ink50)',
          textTransform: 'uppercase',
          letterSpacing: '.08em',
        }}
      >
        {isMachineAuthored(hallazgo.curatorName)
          ? t('hallazgo.cabecera.automatica')
          : t('hallazgo.cabecera.editorial')}
      </div>
      <FindingDetailCard f={hallazgo} permalink={`/hallazgos/${hallazgo.id}`} />
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '8px 16px',
          marginTop: 14,
        }}
      >
        <DataAsOf iso={data?.generatedAt} label="Hallazgos" />
        <Link
          to="/metodologia"
          style={{ color: 'var(--civic)', fontSize: 'var(--fs-meta)', textDecoration: 'underline' }}
        >
          {t('hallazgo.metodologia')}
        </Link>
      </div>
    </div>
  )
}
