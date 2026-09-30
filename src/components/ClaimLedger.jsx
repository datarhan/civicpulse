import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, Pill, SectionHead, ExtLink } from './Primitives'
import { useT } from '../i18n'
import {
  usePlenoClaims,
  CLAIM_TYPE_LABEL,
  CLAIM_TYPE_TONE,
  VERDICT_LABEL,
  VERDICT_TONE,
} from '../hooks/usePlenoClaims'
import { gateForDisplay, sortSignalFirst } from '../lib/claim-ledger'
import { blocLabel } from '../lib/party-label.js'
import {
  etiquetaVerificador,
  fuentesComprobadas,
  resumenSegunFuentes,
} from '../lib/claim-provenance.js'
import { ROTULO_RESUMEN_RETIRADO, resumenPublicable } from '../lib/resumenes-retirados.js'

function formatEuros(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return ''
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + ' M €'
  if (n >= 1000) return (n / 1000).toFixed(0) + ' K €'
  return n.toFixed(0) + ' €'
}

function EvidenceRow({ e }) {
  const kindLabel =
    {
      tender: 'Contrato',
      bdns: 'Subvención BDNS',
      budget: 'Presupuesto',
      promise: 'Promesa documentada',
      'prior-claim': 'Pleno anterior',
    }[e.kind] || e.kind
  const body = (
    <>
      <span
        className="mono"
        style={{
          fontSize: 'var(--fs-micro)',
          fontWeight: 700,
          letterSpacing: '.1em',
          color: 'var(--ink50)',
          marginRight: 6,
        }}
      >
        {kindLabel.toUpperCase()}
      </span>
      <span style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink)' }}>{e.snippet}</span>
      {typeof e.similarity === 'number' && (
        <span
          className="mono"
          style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginLeft: 6 }}
        >
          sim {e.similarity.toFixed(2)}
        </span>
      )}
    </>
  )
  if (e.ref && /^https?:\/\//.test(e.ref)) {
    return (
      <ExtLink
        href={e.ref}
        style={{ display: 'block', padding: '4px 0', textDecoration: 'none', color: 'inherit' }}
      >
        {body}
      </ExtLink>
    )
  }
  return <div style={{ padding: '4px 0' }}>{body}</div>
}

function ClaimCard({ item }) {
  const { claim, verification } = item
  // `null` cuando el resumen guardado habla de la tarea del verificador y no de
  // esta declaración (src/lib/resumenes-retirados.js): la tarjeta dice que lo
  // retiró en vez de imprimirlo bajo la cita. El «no se encontró registro» se
  // re-deriva de la misma procedencia que «Fuentes comprobadas», más abajo:
  // guardado, nombraba fuentes que la línea no lista.
  const resumen = resumenSegunFuentes(verification, resumenPublicable(verification))
  return (
    <Card>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 10,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
            <Pill tone={CLAIM_TYPE_TONE[claim.type] || 'neutral'} size="xs">
              {CLAIM_TYPE_LABEL[claim.type] || claim.type}
            </Pill>
            {claim.speakerGroup && (
              <span
                className="mono"
                style={{
                  fontSize: 'var(--fs-micro)',
                  fontWeight: 700,
                  letterSpacing: '.1em',
                  color: 'var(--ink50)',
                  textTransform: 'uppercase',
                }}
              >
                {blocLabel(claim.speakerGroup)}
              </span>
            )}
            <span className="mono" style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>
              {claim.plenoDate}
            </span>
            {claim.entities.amountEuros && (
              <span
                className="mono"
                style={{ fontSize: 'var(--fs-micro)', fontWeight: 700, color: 'var(--ink)' }}
              >
                {formatEuros(claim.entities.amountEuros)}
              </span>
            )}
            {claim.entities.count && claim.entities.countUnit && (
              <span
                className="mono"
                style={{ fontSize: 'var(--fs-micro)', fontWeight: 700, color: 'var(--ink)' }}
              >
                {claim.entities.count} {claim.entities.countUnit}
              </span>
            )}
          </div>
          <blockquote
            style={{
              margin: '4px 0 0',
              padding: '6px 10px',
              borderLeft: '3px solid var(--civic)',
              fontSize: 'var(--fs-body)',
              fontWeight: 500,
              color: 'var(--ink)',
              lineHeight: 1.5,
              maxWidth: '68ch',
            }}
          >
            «{claim.verbatim}»
          </blockquote>
        </div>
        <Pill tone={VERDICT_TONE[verification.verdict] || 'neutral'} size="xs">
          {VERDICT_LABEL[verification.verdict] || verification.verdict}
        </Pill>
      </div>
      <div
        style={{
          fontSize: 'var(--fs-aux)',
          color: 'var(--ink50)',
          marginTop: 8,
          lineHeight: 1.5,
          fontStyle: resumen === null ? 'italic' : 'normal',
        }}
      >
        {resumen ?? ROTULO_RESUMEN_RETIRADO}
      </div>
      {verification.evidence.length > 0 && (
        <div
          style={{
            marginTop: 8,
            paddingTop: 8,
            borderTop: '1px dashed var(--border2)',
          }}
        >
          {verification.evidence.map((e, i) => (
            <EvidenceRow key={i} e={e} />
          ))}
        </div>
      )}
      {/* Dos preguntas, dos rótulos: contra qué se cotejó y quién dio el
          veredicto. `checkedAgainst` mezcla las dos, y esta línea lo imprimía
          entero: la marca de la pasada salía como una fuente consultada. El
          verificador se rotula como en /declaraciones, para que las dos páginas
          digan lo mismo de la misma cita, y los dos helpers reciben la
          verificación entera: la pasada también viaja en `derivedBy` y
          `source`. */}
      <div
        className="mono"
        style={{
          marginTop: 8,
          fontSize: 'var(--fs-micro)',
          color: 'var(--ink50)',
          letterSpacing: '.06em',
          display: 'flex',
          flexWrap: 'wrap',
          columnGap: 16,
          rowGap: 2,
        }}
      >
        <span>Fuentes comprobadas: {fuentesComprobadas(verification)}</span>
        <span>Veredicto: {etiquetaVerificador(verification)}</span>
      </div>
    </Card>
  )
}

/**
 * The claim ledger. Always gated (drops `hidden` — opinativa / sin-datos
 * accusations — via claim-public-gate) then signal-sorted. Source is either
 * the `items` prop (e.g. one pleno's chunk on /plenos/:id) or, when omitted,
 * the full claim set via usePlenoClaims (e.g. /departamentos narrowed by
 * `filter`). Cross-session filtering/search lives on /declaraciones.
 *
 * Honest empty state when no data-grounded declarations exist — the pipeline
 * hasn't surfaced contrastable claims, not that the government is clean.
 *
 * Con `items` no se pide nada: la carga del corpus vive en
 * `ClaimLedgerFromCorpus`, que sólo se monta cuando faltan. Un hook no se puede
 * saltar, y mientras `usePlenoClaims()` corría aquí, abrir «Declaraciones
 * contrastadas» en /plenos/:id descargaba el manifiesto y todos los fragmentos
 * —unos 7 MB, medido el 29-09-2026— para pintar sólo el de su sesión.
 * tests/components/claim-ledger-corpus.test.jsx cuenta lo que pide cada página.
 */
export function ClaimLedger({ items, ...props }) {
  if (items != null) return <ClaimLedgerView items={items} {...props} />
  return <ClaimLedgerFromCorpus {...props} />
}

/** Sin `items`: el corpus entero, p. ej. /departamentos/:slug filtrado por tema. */
function ClaimLedgerFromCorpus(props) {
  const { loading, data } = usePlenoClaims()
  if (loading) {
    return (
      <div style={{ padding: 12, fontSize: 'var(--fs-meta)', color: 'var(--ink50)' }}>
        Cargando verificaciones…
      </div>
    )
  }
  return <ClaimLedgerView items={data?.items ?? []} {...props} />
}

function ClaimLedgerView({ items, filter, limit = 20, emptyHint, showSummary = false }) {
  const t = useT()
  const [shown, setShown] = useState(limit)

  // Gate (defense-in-depth) → optional external filter → signal-first sort.
  const base = useMemo(() => {
    const gated = gateForDisplay(items)
    const scoped = filter ? gated.filter(filter) : gated
    return sortSignalFirst(scoped)
  }, [items, filter])

  // Honest proportion: signal-first + a small limit otherwise oversells coverage
  // by hiding the (usually majority) sin-datos behind "load more".
  const mix = useMemo(() => {
    const sinContraste = base.filter((it) => it?.verification?.verdict === 'sin-datos').length
    return { conEvidencia: base.length - sinContraste, sinContraste }
  }, [base])

  if (base.length === 0) {
    return (
      <div
        style={{
          padding: 14,
          background: 'var(--soft)',
          borderRadius: 'var(--r-input)',
          fontSize: 'var(--fs-aux)',
          color: 'var(--ink50)',
          lineHeight: 1.5,
        }}
      >
        {emptyHint ||
          'Todavía no hay declaraciones contrastadas con los datos municipales para mostrar aquí.'}
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {showSummary && (
        <div
          className="mono"
          style={{
            fontSize: 'var(--fs-micro)',
            color: 'var(--ink50)',
            letterSpacing: '.03em',
            paddingBottom: 2,
          }}
        >
          <strong style={{ color: 'var(--ink)' }}>{mix.conEvidencia}</strong> contrastadas
          {' · '}
          <strong style={{ color: 'var(--ink)' }}>{mix.sinContraste}</strong> sin contraste en los
          datos
        </div>
      )}
      {base.slice(0, shown).map((it) => (
        <ClaimCard key={it.claim.id} item={it} />
      ))}
      {base.length > shown && (
        <button
          type="button"
          onClick={() => setShown((n) => n + 25)}
          className="mono"
          style={{
            alignSelf: 'flex-start',
            fontSize: 'var(--fs-meta)',
            padding: '6px 12px',
            borderRadius: 'var(--r-input)',
            border: '1px solid var(--border2)',
            background: 'transparent',
            color: 'var(--civic)',
            cursor: 'pointer',
          }}
        >
          {t('ledger.loadMore')} ({base.length - shown})
        </button>
      )}
    </div>
  )
}

export function ClaimLedgerSection({ filter, limit, title, eyebrow, hint }) {
  return (
    <section style={{ marginTop: 28 }}>
      <SectionHead
        eyebrow={eyebrow || 'Verificación automática de declaraciones'}
        title={title || 'Declaraciones hechas en el pleno · contraste con los datos'}
      />
      {hint && (
        <p
          style={{
            fontSize: 'var(--fs-aux)',
            color: 'var(--ink50)',
            marginTop: 4,
            marginBottom: 10,
            lineHeight: 1.5,
            maxWidth: 720,
          }}
        >
          {hint}{' '}
          <Link to="/metodologia#verificacion-declaraciones" style={{ color: 'var(--civic)' }}>
            Cómo se filtran estas declaraciones →
          </Link>
        </p>
      )}
      <ClaimLedger filter={filter} limit={limit} />
    </section>
  )
}
