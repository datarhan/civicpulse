import { useMemo, useState } from 'react'
import { ExtLink, Pill } from '../Primitives'
import Paginacion from '../Paginacion'
import { STATUS_TONE } from '../../hooks/useTenders'
import { fmtDateCompacta, rellena } from '../../lib/formatters'
import { rotuloDe, useLocale } from '../../i18n'
import { filterContracts, contractAmount, contractsListSummary } from '../../lib/tender-geo'

const fmtEur = (n) =>
  new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(n)

/**
 * Cuántas filas se pintan por página. El recuento de arriba habla del conjunto
 * ENTERO, no de la página.
 *
 * Eran sesenta de una vez, y esa lista sola medía ~2.500 px: la tarjeta del
 * mapa acababa a 6.200 px del principio de la página y empujaba el
 * endeudamiento y la contratación tan abajo que nadie llegaba. Un listado que
 * entierra a las secciones siguientes no está enseñando más, está escondiendo
 * lo que viene detrás.
 */
const POR_PAGINA = 10

const INP = {
  fontSize: 'var(--fs-meta)',
  padding: '5px 8px',
  border: '1px solid var(--border2)',
  borderRadius: 'var(--r-input)',
  background: 'var(--paper)',
  color: 'var(--ink)',
}

export default function ContractsExplorer({ contracts, snapshot }) {
  const { locale, t } = useLocale()
  const estado = (s) => rotuloDe(t, `contrato.estado.${s}`, s)
  const [text, setText] = useState('')
  const [zoneSlug, setZone] = useState('')
  const [type, setType] = useState('')
  const [dana, setDana] = useState(false)
  const assignmentsById = useMemo(
    () => new Map((snapshot?.assignments || []).map((a) => [a.id, a])),
    [snapshot],
  )
  // Se mide ANTES del corte. Medirlo después es lo que hacía este contador
  // durante toda su vida: `filterContracts(...).slice(0, 60).length` no puede
  // pasar de 60, así que un filtro que casaba 300 y otro que casaba 60 se veían
  // idénticos, y sin filtrar decía «60 resultados» con 806 coincidencias.
  const matched = useMemo(
    () => filterContracts(contracts, { text, zoneSlug, type, dana }, assignmentsById),
    [contracts, text, zoneSlug, type, dana, assignmentsById],
  )
  const resumen = useMemo(() => contractsListSummary(matched), [matched])
  const zones = snapshot?.zones || []
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <input
          placeholder={t('presupuesto.gasto.buscar')}
          value={text}
          onChange={(e) => setText(e.target.value)}
          style={{ ...INP, flex: 1, minWidth: 160 }}
        />
        <select
          value={zoneSlug}
          onChange={(e) => setZone(e.target.value)}
          style={INP}
          aria-label={t('presupuesto.gasto.filtro.zona')}
        >
          <option value="">{t('presupuesto.gasto.filtro.zonas')}</option>
          {zones.map((z) => (
            <option key={z.slug} value={z.slug}>
              {z.name}
            </option>
          ))}
        </select>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          style={INP}
          aria-label={t('presupuesto.gasto.filtro.tipo')}
        >
          <option value="">{t('presupuesto.gasto.filtro.tipos')}</option>
          <option value="construction">{t('contrato.tipo.construction')}</option>
          <option value="services">{t('contrato.tipo.services')}</option>
          <option value="supplies">{t('contrato.tipo.supplies')}</option>
        </select>
        <label
          style={{ fontSize: 'var(--fs-meta)', display: 'flex', alignItems: 'center', gap: 4 }}
        >
          <input type="checkbox" checked={dana} onChange={(e) => setDana(e.target.checked)} /> DANA
        </label>
      </div>
      <Paginacion
        items={matched}
        porPagina={POR_PAGINA}
        clave={`${text}|${zoneSlug}|${type}|${dana}`}
        etiqueta={t('presupuesto.gasto.listado')}
      >
        {(rows, { desde, pagina, paginas }) => (
          <>
            <div style={{ marginBottom: 8, lineHeight: 1.5 }}>
              <div data-recuento="" style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink70)' }}>
                <span className="mono" style={{ color: 'var(--ink)', fontWeight: 700 }}>
                  {resumen.total}
                </span>{' '}
                {t(
                  resumen.total === 1
                    ? 'presupuesto.gasto.resultado.uno'
                    : 'presupuesto.gasto.resultado.varios',
                )}
                {paginas > 1
                  ? ` · ${rellena(t('presupuesto.gasto.resultado.pagina'), {
                      desde: desde + 1,
                      hasta: desde + rows.length,
                      pagina,
                      paginas,
                    })}`
                  : ''}
              </div>
              {resumen.rest > 0 && (
                <div style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>
                  <span className="mono">{resumen.committed}</span>{' '}
                  {t('presupuesto.gasto.comprometido')}{' '}
                  {resumen.rest === 1
                    ? t('presupuesto.gasto.fueraDeCifras.uno')
                    : rellena(t('presupuesto.gasto.fueraDeCifras.varios'), {
                        n: resumen.rest,
                      })}{' '}
                  {resumen.restByStatus.map((r, i) => (
                    <span key={r.status} style={{ whiteSpace: 'nowrap' }}>
                      {i > 0 ? ' · ' : ''}
                      {estado(r.status)} <span className="mono">{r.count}</span>
                    </span>
                  ))}
                  .
                </div>
              )}
            </div>
            {rows.map((c) => (
              <div
                key={c.id}
                // La rejilla vive en `index.css` (`.cp-contrato-fila`): necesita
                // un punto de ruptura para partirse en el móvil, y una @media no
                // cabe en el prop `style`. Allí está también por qué la columna
                // de estado se dimensiona a su contenido y no a 90 px.
                className="cp-contrato-fila"
                style={{
                  padding: '8px 0',
                  borderBottom: '1px solid var(--border2)',
                  fontSize: 'var(--fs-meta)',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <ExtLink href={c.permalink} style={{ color: 'inherit', textDecoration: 'none' }}>
                    {c.title.length > 100 ? c.title.slice(0, 100) + '…' : c.title}
                  </ExtLink>
                  <div style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>
                    {c.assignee || '—'} · {fmtDateCompacta(c.awardDate, locale) || '—'}
                  </div>
                </div>
                <span className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>
                  {fmtEur(contractAmount(c))}
                </span>
                <span style={{ textAlign: 'right' }}>
                  <Pill tone={STATUS_TONE[c.status] || 'ghost'} size="xs">
                    {estado(c.status)}
                  </Pill>
                </span>
              </div>
            ))}
          </>
        )}
      </Paginacion>
    </div>
  )
}
