import { Link } from 'react-router-dom'
import { Card, Pill, SectionHead, ShareWA, ExtLink } from '../components/Primitives'
import { useCambios, KIND_LABEL_ES, KIND_TONE } from '../hooks/useCambios'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { rotuloDe, useT } from '../i18n'
import { euros, rellena } from '../lib/formatters'
import { useState } from 'react'
import { FraseDeLaSemana } from '../components/Cambios/FraseDeLaSemana'
import DivisorLecturas from '../components/DivisorLecturas'
import { SeccionExperta } from '../components/Lecturas'

const WINDOW_OPTIONS = [7, 14, 30]

/**
 * El orden de las tarjetas: primero lo que hace el Ayuntamiento, luego el canal
 * de quejas y al final la prensa. Antes la prensa iba en medio, y con doce
 * noticias de fiestas tapaba al único contrato de la semana (auditoría de las
 * dos lecturas, §2).
 */
const KINDS = ['pleno', 'licitacion', 'subvencion', 'participa', 'queja', 'prensa']

/** El rótulo de una clase en el idioma de la interfaz; el castellano de reserva. */
const rotuloDeClase = (t, kind) => rotuloDe(t, `cambios.kind.${kind}`, KIND_LABEL_ES[kind] || kind)

function WindowToggle({ current, onChange }) {
  const t = useT()
  return (
    <div
      style={{
        display: 'inline-flex',
        gap: 4,
        background: 'var(--soft)',
        padding: 2,
        borderRadius: 'var(--r-input)',
      }}
    >
      {WINDOW_OPTIONS.map((days) => (
        <button
          key={days}
          onClick={() => onChange(days)}
          aria-pressed={current === days}
          style={{
            padding: '4px 10px',
            borderRadius: 'var(--r-input)',
            fontSize: 'var(--fs-meta)',
            fontWeight: current === days ? 600 : 500,
            background: current === days ? 'var(--paper)' : 'transparent',
            color: current === days ? 'var(--ink)' : 'var(--ink50)',
            boxShadow: current === days ? '0 1px 2px rgba(0,0,0,.06)' : 'none',
          }}
        >
          {rellena(t('cambios.ventana'), { n: days })}
        </button>
      ))}
    </div>
  )
}

/**
 * La línea de un contrato: a quién se adjudicó y por cuánto. Era «Ayuntamiento de
 * Riba-roja de Túria · €14.984,46 · ADJUDICATARIA»: el órgano es el mismo en los
 * 814 contratos, y el importe salía con otro formato que el resto del sitio. Sin
 * importe publicado lo dice, en vez de callarlo.
 */
function lineaDeContrato(t, it) {
  return [
    it.adjudicataria
      ? rellena(t('cambios.contrato.adjudicataria'), { nombre: it.adjudicataria })
      : null,
    it.importe != null
      ? rellena(t('importe.sinIva'), { importe: euros(it.importe) })
      : t('importe.noPublicado'),
  ]
    .filter(Boolean)
    .join(' · ')
}

/**
 * Los sitios que publicaron una noticia de prensa, cada uno enlazado a su pieza
 * y con su propio titular al pasar por encima: la fila lleva el de uno solo, y
 * así se ve qué juntó `agruparPorNoticia`. Un nombre repetido lleva un número.
 *
 * Dice cuántos, porque la página cuenta noticias y no piezas: «En 2 sitios» es lo
 * que une las once noticias de la frase con las trece piezas que hay detrás.
 */
function EnSitios({ piezas }) {
  const t = useT()
  const vistos = new Map()
  return (
    <div
      data-sitios=""
      className="mono"
      style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginTop: 2 }}
    >
      {rellena(t('cambios.prensa.enSitios'), { n: piezas.length })}{' '}
      {piezas.map((p, i) => {
        const nombre = p.subtitle || p.origen || p.url
        const n = (vistos.get(nombre) ?? 0) + 1
        vistos.set(nombre, n)
        return (
          <span key={p.id ?? i}>
            {i > 0 && ' · '}
            <ExtLink href={p.url} title={p.title} style={{ color: 'var(--ink70)' }}>
              {n > 1 ? `${nombre} (${n})` : nombre}
            </ExtLink>
          </span>
        )
      })}
    </div>
  )
}

/**
 * Una tarjeta por clase, una fila por cambio. `filas` trae las piezas de cada
 * fila (la prensa, agrupada por noticia); sin ella, cada cambio es una fila de
 * una pieza. La cabecera y «Y N más» cuentan filas, como la frase y el total.
 */
function KindCard({ kind, items, filas, formatDate }) {
  const t = useT()
  if (!items || items.length === 0) return null
  const todas = filas ?? items.map((it) => ({ principal: it, piezas: [it] }))
  const visibles = todas.slice(0, 10)
  const fuera = todas.length - visibles.length
  return (
    <Card data-clase={kind}>
      <SectionHead
        eyebrow={
          items.length === 1 ? t('cambios.n.uno') : rellena(t('cambios.n'), { n: items.length })
        }
        title={rotuloDeClase(t, kind)}
        right={
          <Pill tone={KIND_TONE[kind] || 'ghost'} size="xs">
            {items.length}
          </Pill>
        }
      />
      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {visibles.map(({ principal: it, piezas }, i) => (
          <div
            key={i}
            data-fila=""
            data-piezas={piezas.length}
            style={{
              display: 'grid',
              gridTemplateColumns: '90px 1fr min-content',
              gap: 10,
              alignItems: 'baseline',
              padding: '6px 0',
              borderTop: i === 0 ? 'none' : '1px dotted var(--border2)',
            }}
          >
            <span className="mono" style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>
              {formatDate ? formatDate(it.date) : it.date}
            </span>
            <div style={{ minWidth: 0 }}>
              {it.external ? (
                <ExtLink
                  href={it.url}
                  style={{
                    color: 'var(--ink70)',
                    textDecoration: 'none',
                    fontSize: 'var(--fs-aux)',
                    fontWeight: 500,
                  }}
                >
                  {it.title}
                </ExtLink>
              ) : (
                <Link
                  to={it.url}
                  style={{
                    color: 'var(--ink70)',
                    textDecoration: 'none',
                    fontSize: 'var(--fs-aux)',
                    fontWeight: 500,
                  }}
                >
                  {it.title}
                </Link>
              )}
              {/* Un contrato se titula con su etiqueta llana; si dice menos que el
                  título oficial, éste va debajo, entero. */}
              {it.tituloOficial && (
                <div
                  data-titulo-oficial=""
                  style={{
                    fontSize: 'var(--fs-micro)',
                    color: 'var(--ink50)',
                    marginTop: 2,
                    lineHeight: 1.45,
                  }}
                >
                  {rellena(t('cambios.contrato.tituloOficial'), { titulo: it.tituloOficial })}
                </div>
              )}
              {piezas.length > 1 ? (
                <EnSitios piezas={piezas} />
              ) : (
                (it.subtitle || kind === 'licitacion') && (
                  <div
                    className="mono"
                    style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginTop: 2 }}
                  >
                    {kind === 'licitacion' ? lineaDeContrato(t, it) : it.subtitle}
                  </div>
                )
              )}
            </div>
            <ShareWA
              text={it.shareText}
              url={it.external ? it.url : `https://civicpulse.es${it.url}`}
            />
          </div>
        ))}
        {/* Era «+ N más · ver Prensa completo», sin enlace a ninguna parte: un
            botón que no lo era. Ahora dice lo que hay, y nada más. */}
        {fuera > 0 && (
          <div
            className="mono"
            style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginTop: 4 }}
          >
            {rellena(t('cambios.mas'), { n: fuera })}
          </div>
        )}
      </div>
    </Card>
  )
}

export default function Cambios() {
  const t = useT()
  const [days, setDays] = useState(7)
  const { loading, byKind, prensaPorNoticia, fuentes, totalCount, windowDays, formatDate } =
    useCambios(days)
  useDocumentTitle(t('cambios.title'))

  return (
    <div
      className="cp-page"
      style={{ padding: '24px 24px 48px', maxWidth: 1100, margin: '0 auto' }}
    >
      <div
        style={{
          marginBottom: 18,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
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
            {t('cambios.eyebrow')}
          </div>
          <h1
            style={{
              fontSize: 'var(--fs-page)',
              fontWeight: 700,
              letterSpacing: '-.015em',
              margin: '2px 0 0',
            }}
          >
            {t('cambios.title')}
          </h1>
          {/* La entradilla explicaba además «un botón verde (WA)»: el botón ya
              dice lo que es. */}
          <div
            style={{
              fontSize: 'var(--fs-aux)',
              color: 'var(--ink50)',
              marginTop: 4,
              maxWidth: 720,
            }}
          >
            {rellena(t('cambios.intro'), { dias: windowDays })}
          </div>
        </div>
        <WindowToggle current={days} onChange={setDays} />
      </div>

      {loading && (
        <Card>
          <div style={{ fontSize: 'var(--fs-aux)', color: 'var(--ink50)' }}>
            {t('common.loading')}
          </div>
        </Card>
      )}

      {!loading && (
        <>
          {/* Las dos lecturas (auditoría de las dos lecturas, §2): arriba, en una
              frase, lo que hizo el Ayuntamiento, lo que no consta y lo que no se
              sabe; debajo, las tarjetas de siempre. */}
          <FraseDeLaSemana byKind={byKind} fuentes={fuentes} dias={windowDays} />
          <DivisorLecturas />

          {totalCount === 0 ? (
            // La frase de arriba ya dice qué no consta y de qué no hay datos: aquí
            // sólo queda que no hay tarjetas. Esta caja decía «no se han
            // registrado quejas, plenos, contratos…» aunque la fuente estuviera
            // atrasada.
            <Card>
              <div style={{ fontSize: 'var(--fs-aux)', color: 'var(--ink50)' }}>
                {t('cambios.vacio')}
              </div>
            </Card>
          ) : (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                {KINDS.filter((k) => byKind[k]?.length).map((k) => (
                  <Pill key={k} tone={KIND_TONE[k]} size="sm">
                    {rotuloDeClase(t, k)} · {byKind[k].length}
                  </Pill>
                ))}
              </div>
              {/* Una sección por clase: lo que pliega «Ver: lo esencial»
                  (components/Lecturas.jsx). Las píldoras de arriba y el total
                  de abajo se quedan a la vista: son el índice de lo plegado. */}
              <div style={{ display: 'grid', gap: 14 }}>
                {KINDS.filter((k) => byKind[k]?.length).map((k) => (
                  <SeccionExperta key={k} id={`cambios-${k}`} titulo={rotuloDeClase(t, k)}>
                    <KindCard
                      kind={k}
                      items={byKind[k]}
                      filas={k === 'prensa' ? prensaPorNoticia : undefined}
                      formatDate={formatDate}
                    />
                  </SeccionExperta>
                ))}
              </div>
              <div
                style={{
                  marginTop: 18,
                  fontSize: 'var(--fs-meta)',
                  color: 'var(--ink50)',
                  textAlign: 'center',
                }}
              >
                {totalCount === 1
                  ? rellena(t('cambios.total.uno'), { dias: windowDays })
                  : rellena(t('cambios.total'), { n: totalCount, dias: windowDays })}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
