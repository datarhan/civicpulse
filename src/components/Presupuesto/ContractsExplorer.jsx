import { useEffect, useMemo, useState } from 'react'
import { ExtLink, Pill } from '../Primitives'
import { STATUS_LABEL, STATUS_TONE } from '../../hooks/useTenders'
import { fmtDateShort } from '../../lib/formatters'
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

/** Un paso de página. Deshabilitado en los extremos, y se NOTA que lo está. */
function PasoPagina({ children, onClick, disabled, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      style={{
        ...INP,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        fontWeight: 600,
        lineHeight: 1.2,
      }}
    >
      {children}
    </button>
  )
}

export default function ContractsExplorer({ contracts, snapshot }) {
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
  const [paginaPedida, setPagina] = useState(1)

  // Un filtro nuevo empieza por el principio. Sin esto, buscar algo estando en
  // la página cinco deja al lector a mitad de un listado que acaba de cambiar.
  useEffect(() => setPagina(1), [text, zoneSlug, type, dana])

  const paginas = Math.max(1, Math.ceil(matched.length / POR_PAGINA))
  // La página se ACOTA al renderizar, no sólo al pulsar: un refresco nocturno
  // puede dejar menos filas sin que nadie toque un filtro, y «página 7 de 2»
  // es una lista vacía con toda la pinta de un fallo de datos.
  const pagina = Math.min(Math.max(1, paginaPedida), paginas)
  const desde = (pagina - 1) * POR_PAGINA
  const rows = useMemo(() => matched.slice(desde, desde + POR_PAGINA), [matched, desde])
  const zones = snapshot?.zones || []
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <input
          placeholder="Buscar contrato o empresa…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          style={{ ...INP, flex: 1, minWidth: 160 }}
        />
        <select
          value={zoneSlug}
          onChange={(e) => setZone(e.target.value)}
          style={INP}
          aria-label="Filtrar por zona"
        >
          <option value="">Todas las zonas</option>
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
          aria-label="Filtrar por tipo"
        >
          <option value="">Todo tipo</option>
          <option value="construction">Obras</option>
          <option value="services">Servicios</option>
          <option value="supplies">Suministros</option>
        </select>
        <label
          style={{ fontSize: 'var(--fs-meta)', display: 'flex', alignItems: 'center', gap: 4 }}
        >
          <input type="checkbox" checked={dana} onChange={(e) => setDana(e.target.checked)} /> DANA
        </label>
      </div>
      <div style={{ marginBottom: 8, lineHeight: 1.5 }}>
        <div data-recuento="" style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink70)' }}>
          <span className="mono" style={{ color: 'var(--ink)', fontWeight: 700 }}>
            {resumen.total}
          </span>{' '}
          resultado{resumen.total === 1 ? '' : 's'}
          {paginas > 1
            ? ` · ${desde + 1}–${desde + rows.length}, página ${pagina} de ${paginas}`
            : ''}
        </div>
        {resumen.rest > 0 && (
          <div style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>
            <span className="mono">{resumen.committed}</span> son dinero comprometido (adjudicado o
            formalizado).{' '}
            {resumen.rest === 1 ? 'El otro consta' : `Los otros ${resumen.rest} constan`} en el
            registro público pero no cuenta{resumen.rest === 1 ? '' : 'n'} en las cifras de arriba:{' '}
            {resumen.restByStatus.map((r, i) => (
              <span key={r.status} style={{ whiteSpace: 'nowrap' }}>
                {i > 0 ? ' · ' : ''}
                {STATUS_LABEL[r.status]} <span className="mono">{r.count}</span>
              </span>
            ))}
            .
          </div>
        )}
      </div>
      {rows.map((c) => (
        <div
          key={c.id}
          // La rejilla vive en `index.css` (`.cp-contrato-fila`): necesita un
          // punto de ruptura para partirse en el móvil, y una @media no cabe
          // en el prop `style`. Allí está también por qué la columna de estado
          // se dimensiona a su contenido y no a 90 px.
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
              {c.assignee || '—'} · {fmtDateShort(c.awardDate) || '—'}
            </div>
          </div>
          <span className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>
            {fmtEur(contractAmount(c))}
          </span>
          <span style={{ textAlign: 'right' }}>
            <Pill tone={STATUS_TONE[c.status] || 'ghost'} size="xs">
              {STATUS_LABEL[c.status] || c.status}
            </Pill>
          </span>
        </div>
      ))}
      {paginas > 1 && (
        <nav
          aria-label="Paginación del listado de contratos"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            flexWrap: 'wrap',
            paddingTop: 12,
          }}
        >
          <PasoPagina
            onClick={() => setPagina(pagina - 1)}
            disabled={pagina <= 1}
            label="Página anterior"
          >
            ← Anterior
          </PasoPagina>
          {/* `aria-live` porque al cambiar de página no se mueve el foco: sin
              esto, quien usa lector de pantalla pulsa «siguiente» y no se
              entera de que la lista ha cambiado debajo. */}
          <span
            className="mono"
            aria-live="polite"
            style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink70)' }}
          >
            {pagina} / {paginas}
          </span>
          <PasoPagina
            onClick={() => setPagina(pagina + 1)}
            disabled={pagina >= paginas}
            label="Página siguiente"
          >
            Siguiente →
          </PasoPagina>
        </nav>
      )}
    </div>
  )
}
