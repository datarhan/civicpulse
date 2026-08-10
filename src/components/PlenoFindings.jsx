import { Card, Pill, SectionHead, ExtLink } from './Primitives'
import { usePlenoFindings, SEVERITY_LABEL, SEVERITY_TONE } from '../hooks/usePlenoFindings'
import { useTenders } from '../hooks/useTenders'
import { useFindingQuoteProvenance, provenanceFor } from '../hooks/useFindingQuoteProvenance'
import { QUOTE_PROVENANCE_STATUS_IDS } from '../scraper/quote-provenance'
import { blocLabel } from '../lib/party-label.js'
import { refDateIndexFor, refDate } from '../lib/crosschecked-date.js'
import { fmtDateShort } from '../lib/formatters'
import { useT } from '../i18n'

/**
 * The documents a finding was cross-checked against.
 *
 * The heading used to read «Corrobora», which asserted a verdict the slot does
 * not carry. The field behind it is not a filtered list of documents that
 * agree: `auto-curate.ts` filled it with EVERY verifier evidence ref for the
 * cited quotes — agreeing or not — plus the pleno video itself. Six published
 * findings therefore stamped «CORROBORA» over documents their own prose calls
 * insufficient: `f-2026-07-03-cit-1e90e0` says «sin corroboración documental»
 * above three tenders (the register holds no FCC contract at all), and
 * `f-2025-10-06-acu-b00839` says the cited contract «no documenta el sistema
 * COMETA». Being checked is not agreeing.
 *
 * The heading was fixed first and the field kept its old name for four days,
 * which is how the LLM synthesiser went on writing «corroborado por…» under an
 * honest heading: it reads the schema, not the page. The field is now
 * `crossChecked[]`, and `contradiction[]` takes only refs the verifier
 * recorded as `stance: 'contradicts'`.
 *
 * The green `--ok-ink` went with the old heading — a colour asserts a verdict
 * just as loudly as a word.
 *
 * Shared with `/hallazgos`, which imports this: the same component was
 * duplicated verbatim in `pages/Hallazgos.jsx`, so the first fix reached only
 * one of the two surfaces that render it.
 */
/**
 * When a cross-checked document is from, rendered where the reader sees it.
 *
 * Not decoration. `f-2026-07-03-cit-1e90e0` is about a JULY 2026 debate on an
 * emergency waste contract, and the document at the top of its list opens
 * «contrato emergencia acondicionamiento de caminos…» — an emergency contract
 * from the NOVEMBER 2022 storms, about roads. The list is honest (it means
 * «cotejado», not «coincide») and the reference is a real record, so the fix
 * is not to remove it: it is to show the one fact that tells the two apart,
 * which was in the data and not on screen.
 *
 * The date is always labelled with WHICH date it is — a contract's award is
 * not its start — and a document that publishes none says so in words. A blank
 * would read as recent, which is the failure being repaired.
 */
function RefDate({ date, t }) {
  // `undefined` = nothing has resolved this ref yet (the tenders snapshot is
  // still in flight). Rendering "sin fecha" then would be a claim about the
  // document made from our own loading state.
  if (date === undefined) return null
  const known = date !== null
  const field = known ? t(`findings.refs.date.${date.field}`) : null
  return (
    <span
      className="mono"
      style={{
        fontSize: 9.5,
        // No opacity: this is text inside a tinted chip, and opacity there
        // drops it below AA against the tint at any theme.
        color: known ? 'var(--ink70)' : 'var(--ink60)',
        background: 'var(--soft)',
        border: known ? 'none' : '1px dashed var(--border2)',
        padding: '1px 5px',
        borderRadius: 4,
        marginRight: 6,
        whiteSpace: 'nowrap',
      }}
      title={known ? `${field} · ${date.iso}` : t('findings.refs.date.noneTitle')}
    >
      {known ? `${fmtDateShort(date.iso)} · ${field}` : t('findings.refs.date.none')}
    </span>
  )
}

export function RefList({ refs, kind, plenoDate }) {
  const t = useT()
  // Tender dates live in tenders.json and nowhere smaller. A precomputed
  // index would be lighter, but it goes stale exactly where mis-dating is most
  // likely — the newest finding, citing the newest expediente — and a stale
  // index renders no date at all. Reading the live snapshot cannot rot; the
  // session store fetches it once per session and shares it with /cambios,
  // /presupuesto and /departamentos.
  const { data: tenders } = useTenders()
  const index = refDateIndexFor(tenders)
  if (!refs || refs.length === 0) return null
  const isCrossChecked = kind === 'crossChecked'
  const label = t(isCrossChecked ? 'findings.refs.crossChecked' : 'findings.refs.contradiction')
  const tone = isCrossChecked ? 'var(--ink60)' : 'var(--crit-ink)'
  return (
    <div style={{ marginTop: 6 }}>
      <div
        className="mono"
        style={{
          fontSize: 9,
          letterSpacing: '.1em',
          textTransform: 'uppercase',
          color: tone,
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      {refs.map((r, i) => {
        const isUrl = /^https?:\/\//.test(r.ref)
        const body = (
          <>
            <span className="mono" style={{ fontSize: 9.5, color: 'var(--ink50)', marginRight: 6 }}>
              {r.kind.toUpperCase()}
            </span>{' '}
            <RefDate date={refDate(r, index, plenoDate)} t={t} />{' '}
            {/* The spaces above are load-bearing: margins separate the chips
                visually, but a screen reader reads the text nodes, and without
                them it says «adjudicacióncontrato emergencia». */}
            <span style={{ fontSize: 12 }}>{r.snippet}</span>
          </>
        )
        return isUrl ? (
          <ExtLink
            key={i}
            href={r.ref}
            style={{ display: 'block', padding: '2px 0', textDecoration: 'none', color: 'inherit' }}
          >
            {body}
          </ExtLink>
        ) : (
          <div key={i} style={{ padding: '2px 0' }}>
            {body}
          </div>
        )
      })}
    </div>
  )
}

/**
 * The reader-facing half of the quote-provenance snapshot.
 *
 * Eighteen pleno sessions were transcribed a second time with a better engine.
 * 95 of the 177 verbatims published on this site appear in the transcript they
 * were lifted from and NOT in the one that replaced it — and for most of those
 * sessions the current file is 121–191 % the size of its predecessor, so the
 * absence is not missing coverage. It is the earlier machine's wording, sitting
 * inside guillemets, attributed to a named political group.
 *
 * The substance is real: «Feria de Comercio» appears five times in each pass of
 * `10yl550`, while `satombat` and `Rivarroch` are artefacts only the old one
 * produces. So the honest move is neither to delete the quote nor to silently
 * rewrite it — it is to tell the reader that the words between the guillemets
 * are not confirmed against the best available text, and to leave the rewording
 * to a person. Nothing automatic edits published prose.
 *
 * Two marks, not one. «Sólo en la sustituida» is a claim: we know the new pass
 * says more and still does not contain these words. «Sin determinar» is the
 * absence of a claim, for the sessions whose current transcript is SHORTER than
 * the one it replaced — there, the words may have been reworded or the stretch
 * may simply not be covered, and we do not know which. Collapsing the second
 * into the first would publish a confidence the bytes do not support.
 */
const PROVENANCE_MARK = {
  'en-vigente': null,
  'solo-en-sustituida': {
    tone: 'warn',
    chip: 'no consta en la transcripción revisada',
    title:
      'La sesión se transcribió de nuevo con un motor mejor y estas palabras no aparecen en el texto nuevo.',
    note:
      'Sesión re-transcrita con un motor mejor. Las citas marcadas constan literalmente en la ' +
      'transcripción anterior y no en la vigente, que es más extensa: el asunto se debatió, pero ' +
      'la literalidad entrecomillada es la del primer transcriptor y no está confirmada contra el ' +
      'mejor texto disponible. Reanclarla es trabajo de una persona; aquí no se reescribe sola.',
  },
  'sin-determinar': {
    tone: 'ghost',
    chip: 'no hemos podido comprobarlo',
    title:
      'No podemos decir si estas palabras cambiaron al re-transcribir o si el tramo no está cubierto.',
    note:
      'La transcripción vigente de esta sesión es más corta que la que sustituyó, así que la ' +
      'ausencia de estas palabras puede deberse al cambio de motor o a un tramo que la nueva pasada ' +
      'no cubre. No afirmamos ninguna de las dos cosas.',
  },
}

// The enum is imported, never restated: a hand-copied list of states is how six
// tests in this repo stayed green while production matched nothing
// (docs/DATA_INTEGRITY.md rule 1). A new state must break this on sight.
if (import.meta.env?.DEV && QUOTE_PROVENANCE_STATUS_IDS.some((id) => !(id in PROVENANCE_MARK))) {
  throw new Error(
    'PlenoFindings: falta la redacción de lectura para un estado de procedencia nuevo — ' +
      QUOTE_PROVENANCE_STATUS_IDS.filter((id) => !(id in PROVENANCE_MARK)).join(', '),
  )
}

/** The chip that sits beside one quote. Renders nothing for a sound quote. */
export function QuoteProvenanceMark({ entry }) {
  const mark = entry ? PROVENANCE_MARK[entry.status] : null
  if (!mark) return null
  return (
    <Pill tone={mark.tone} size="xs" style={{ fontStyle: 'normal', marginLeft: 6 }}>
      <span title={mark.title}>{mark.chip}</span>
    </Pill>
  )
}

/**
 * One sentence per distinct mark present on a card, below its quotes. A chip
 * alone says «something is off» without saying what a reader should conclude,
 * and this is prose about named political groups.
 */
export function QuoteProvenanceNote({ entries }) {
  const seen = []
  for (const e of entries ?? []) {
    if (PROVENANCE_MARK[e?.status] && !seen.includes(e.status)) seen.push(e.status)
  }
  if (seen.length === 0) return null
  return (
    <div
      style={{
        marginTop: 8,
        padding: '7px 10px',
        borderLeft: '3px solid var(--warn)',
        background: 'var(--soft)',
        borderRadius: 4,
        fontSize: 11,
        lineHeight: 1.5,
        color: 'var(--ink70)',
      }}
    >
      {seen.map((s) => (
        <div key={s} style={{ marginTop: 2 }}>
          <strong style={{ color: 'var(--ink)', fontWeight: 600 }}>
            {PROVENANCE_MARK[s].chip}
          </strong>
          {' — '}
          {PROVENANCE_MARK[s].note}
        </div>
      ))}
      <a
        href="/metodologia#citas-transcripcion"
        style={{ color: 'var(--civic)', textDecoration: 'underline' }}
      >
        Cómo se comprueba una cita →
      </a>
    </div>
  )
}

export function FindingCard({ f }) {
  const { data: provenance } = useFindingQuoteProvenance()
  const prov = provenanceFor(provenance, f.id)
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
            <Pill tone={SEVERITY_TONE[f.severity] || 'neutral'} size="xs">
              {SEVERITY_LABEL[f.severity] || f.severity}
            </Pill>
            <span className="mono" style={{ fontSize: 10, color: 'var(--ink50)' }}>
              {f.plenoDate} · editado por {f.curatorName}
            </span>
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.35 }}>{f.title}</div>
        </div>
      </div>
      <p
        style={{
          fontSize: 12.5,
          color: 'var(--ink80)',
          marginTop: 8,
          lineHeight: 1.55,
        }}
      >
        {f.summary}
      </p>
      {f.quotes?.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {f.quotes.slice(0, 3).map((q, i) => (
            <blockquote
              key={i}
              style={{
                margin: '6px 0 0',
                padding: '6px 10px',
                borderLeft: '3px solid var(--border)',
                fontSize: 12,
                color: 'var(--ink70)',
                lineHeight: 1.5,
                fontStyle: 'italic',
              }}
            >
              «{q.text}»{' '}
              {q.speakerGroup && (
                <span
                  className="mono"
                  style={{
                    fontSize: 10,
                    fontStyle: 'normal',
                    color: 'var(--ink50)',
                    marginLeft: 6,
                  }}
                >
                  {blocLabel(q.speakerGroup)}
                </span>
              )}
              <QuoteProvenanceMark entry={prov[i]} />
            </blockquote>
          ))}
          {/* Only the three quotes this card shows are marked, so the note must
              describe those and not the finding's full list. */}
          <QuoteProvenanceNote entries={prov.slice(0, 3)} />
        </div>
      )}
      <RefList refs={f.crossChecked} kind="crossChecked" plenoDate={f.plenoDate} />
      <RefList refs={f.contradiction} kind="contradiction" plenoDate={f.plenoDate} />
      {f.response && (
        <div
          style={{
            marginTop: 10,
            padding: '8px 10px',
            background: 'var(--soft)',
            borderRadius: 6,
            fontSize: 12,
            lineHeight: 1.5,
            color: 'var(--ink)',
          }}
        >
          <div
            className="mono"
            style={{
              fontSize: 9,
              letterSpacing: '.1em',
              textTransform: 'uppercase',
              color: 'var(--ink50)',
              marginBottom: 2,
            }}
          >
            Réplica de {f.response.from} · {f.response.respondedAt}
          </div>
          «{f.response.quote}»
        </div>
      )}
    </Card>
  )
}

export function PlenoFindingsSection() {
  const { loading, data } = usePlenoFindings()
  if (loading) return null
  const items = data?.items ?? []
  if (items.length === 0) return null
  return (
    <section style={{ marginTop: 28 }}>
      <SectionHead
        eyebrow="Hallazgos editoriales verificados"
        title="Contrastes curados sobre declaraciones en el pleno"
      />
      <p
        style={{
          fontSize: 12,
          color: 'var(--ink60)',
          marginTop: 4,
          marginBottom: 10,
          maxWidth: 720,
          lineHeight: 1.5,
        }}
      >
        Un hallazgo toma una o más declaraciones extraídas automáticamente del pleno y las sitúa en
        su contexto documental (contratos, subvenciones, presupuesto, promesas). La mayoría los
        redacta un proceso automático bajo reglas fijas; el pie de cada ficha dice quién la editó, y
        un nombre como «auto-curation-v1» significa que el texto lo escribió una máquina. Cada
        hallazgo cita literales verbatim, lista los documentos con los que se ha cotejado —lo
        corroboren o no— y permite réplica literal de los grupos afectados.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map((f) => (
          <FindingCard key={f.id} f={f} />
        ))}
      </div>
    </section>
  )
}
