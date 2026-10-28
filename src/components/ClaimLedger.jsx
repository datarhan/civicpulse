import { useMemo, useState } from 'react'
import { Card, Pill, ExtLink } from './Primitives'
import { MarcaDeFirma } from './MarcaDeFirma'
import { tramoDeFirma } from '../lib/atribucion-firmada'
import { rotuloDe, useT } from '../i18n'
import { conHuecos } from '../lib/huecos'
import { rellena } from '../lib/formatters'
import { usePlenoClaims, VERDICT_TONE } from '../hooks/usePlenoClaims'
import { rotuloDeTipo } from '../lib/claim-type-label.js'
import { gateForDisplay, sortSignalFirst } from '../lib/claim-ledger'
import { cuentaCotejadas, entreParentesis } from '../lib/cotejo'
import { blocLabel } from '../lib/party-label.js'
import { snippetDeEvidencia } from '../lib/crosschecked-status.js'
import {
  etiquetaVerificador,
  evidenciaSegunFuentes,
  fuentesComprobadas,
  resumenSegunFuentes,
  rotuloDeParecido,
} from '../lib/claim-provenance.js'
import { CLAVE_RESUMEN_RETIRADO, resumenPublicable } from '../lib/resumenes-retirados.js'
import { PuenteDeImporte } from './PuenteDeImporte'
import { cifraCitada } from '../scraper/cifra-en-literal'

function formatEuros(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return ''
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + ' M €'
  if (n >= 1000) return (n / 1000).toFixed(0) + ' K €'
  return n.toFixed(0) + ' €'
}

/**
 * Una fila de evidencia, y debajo —fuera del enlace, que es de la fila— el
 * puente con la cifra citada cuando son dos importes del mismo expediente.
 */
function EvidenceRow({ e, cifra }) {
  const t = useT()
  const kindLabel = rotuloDe(t, `ledger.evidencia.${e.kind}`, e.kind)
  const parecido = rotuloDeParecido(e.similarity, t)
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
      {/* Sin la cola «· estado: formalized» que `claim-verifier.ts` añade a
          cada contrato —la palabra cruda del registro, o el centinela
          «unknown»— y con la categoría de Gobierto por su rótulo, no
          «· construction ·». El mismo helper que /hallazgos y /declaraciones
          (crosschecked-status.js). */}
      <span style={{ fontSize: 'var(--fs-meta)', color: 'var(--ink)' }}>
        {snippetDeEvidencia(e, t)}
      </span>
      {/* Qué mide el número y qué no: suelto, «sim 1.00» junto a «Parcial» se
          leía como coincidencia perfecta (src/lib/claim-provenance.js). */}
      {parecido && (
        <span
          className="mono"
          style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginLeft: 6 }}
        >
          {parecido}
        </span>
      )}
    </>
  )
  const fila =
    e.ref && /^https?:\/\//.test(e.ref) ? (
      <ExtLink
        href={e.ref}
        style={{ display: 'block', padding: '4px 0', textDecoration: 'none', color: 'inherit' }}
      >
        {body}
      </ExtLink>
    ) : (
      <div style={{ padding: '4px 0' }}>{body}</div>
    )
  return (
    <>
      {fila}
      <PuenteDeImporte cifra={cifra} evidencia={e} />
    </>
  )
}

function ClaimCard({ item }) {
  const t = useT()
  const { claim, verification } = item
  // `null` cuando el resumen guardado habla de la tarea del verificador y no de
  // esta declaración (src/lib/resumenes-retirados.js): la tarjeta dice que lo
  // retiró en vez de imprimirlo bajo la cita. El «no se encontró registro» se
  // re-deriva de la misma procedencia que «Fuentes comprobadas», más abajo:
  // guardado, nombraba fuentes que la línea no lista. Y con la misma regla se
  // deja de pintar el expediente «que se parece» de una verificación que no
  // cotejó contratos: salía encima de «Fuentes comprobadas: ninguna».
  const resumen = resumenSegunFuentes(verification, resumenPublicable(verification), claim.verbatim)
  const evidencia = evidenciaSegunFuentes(verification)
  // La cifra que la tarjeta pinta como de la cita es la que la cita DICE
  // (src/scraper/cifra-en-literal.ts). El extractor saca a veces la suya de la
  // frase de al lado: k4olcs-019-cit-b9b013 llevaba «81 K €» en la cabecera
  // encima de «sistema de debate, captura y grabación…», que no trae ninguna.
  const cifra = cifraCitada(claim)
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
          {/* La envoltura vive en index.css (.cp-ledger-head): sin ella la
              fila no envolvía y, a 375 px, la fecha se partía por el guion. */}
          <div
            className="cp-ledger-head"
            style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}
          >
            {/* Derivado del literal: un tipo que promete una cifra o un
                convenio que la cita no trae baja a «Afirmación»
                (src/lib/claim-type-label.js). */}
            <Pill tone={rotuloDeTipo(claim, t).tono} size="xs">
              {rotuloDeTipo(claim, t).texto}
            </Pill>
            {/* El grupo y su «firmado» van en una sola pieza para que, al
                envolver, la marca no caiga sola al principio de la línea
                siguiente (lo mismo que /declaraciones, commit 43b21db0). */}
            {(claim.speakerGroup || tramoDeFirma(claim)) && (
              <span
                className="cp-ledger-entero"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
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
                <MarcaDeFirma
                  claim={claim}
                  style={{
                    fontSize: 'var(--fs-micro)',
                    letterSpacing: '.04em',
                    color: 'var(--ink50)',
                  }}
                />
              </span>
            )}
            <span
              className="mono cp-ledger-entero"
              style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}
            >
              {claim.plenoDate}
            </span>
            {cifra != null && (
              <span
                className="mono"
                style={{ fontSize: 'var(--fs-micro)', fontWeight: 700, color: 'var(--ink)' }}
              >
                {formatEuros(cifra)}
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
          {rotuloDe(t, `declaraciones.veredicto.${verification.verdict}`, verification.verdict)}
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
        {resumen ?? t(CLAVE_RESUMEN_RETIRADO)}
      </div>
      {evidencia.length > 0 && (
        <div
          style={{
            marginTop: 8,
            paddingTop: 8,
            borderTop: '1px dashed var(--border2)',
          }}
        >
          {evidencia.map((e, i) => (
            <EvidenceRow key={i} e={e} cifra={cifra} />
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
        <span>
          {rellena(t('ledger.fuentes'), { fuentes: fuentesComprobadas(verification, t) })}
        </span>
        <span>
          {rellena(t('ledger.veredicto'), { verificador: etiquetaVerificador(verification, t) })}
        </span>
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
  const t = useT()
  const { loading, data } = usePlenoClaims()
  if (loading) {
    return (
      <div style={{ padding: 12, fontSize: 'var(--fs-meta)', color: 'var(--ink50)' }}>
        {t('ledger.cargando')}
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
  // Las cotejadas, con su desglose por veredicto (src/lib/cotejo.js): sin él, «8
  // contrastadas» se leía comprobadas siendo las ocho parciales. Lo que repite una
  // promesa no es un cotejo con un documento municipal y va en su propia pieza.
  const mix = useMemo(() => {
    const sinContraste = base.filter((it) => it?.verification?.verdict === 'sin-datos').length
    const promesas = base.filter((it) => it?.verification?.verdict === 'promesa-repetida').length
    return { cotejadas: cuentaCotejadas(base), sinContraste, promesas }
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
        {emptyHint || t('ledger.vacio')}
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
          {conHuecos(
            t(
              mix.cotejadas.total === 1
                ? 'ledger.recuento.cotejadas.uno'
                : 'ledger.recuento.cotejadas.varios',
            ),
            { '{n}': <strong style={{ color: 'var(--ink)' }}>{mix.cotejadas.total}</strong> },
          )}
          {entreParentesis(t, mix.cotejadas)}
          {mix.promesas > 0 && (
            <>
              {' · '}
              {conHuecos(t(mix.promesas === 1 ? 'cotejo.promesas.uno' : 'cotejo.promesas.varios'), {
                '{n}': <strong style={{ color: 'var(--ink)' }}>{mix.promesas}</strong>,
              })}
            </>
          )}
          {' · '}
          {conHuecos(t('ledger.recuento.sinContraste'), {
            '{n}': <strong style={{ color: 'var(--ink)' }}>{mix.sinContraste}</strong>,
          })}
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
