import { Card, Pill, SectionHead, ExtLink, Quote } from './Primitives'
import { usePlenoFindings, SEVERITY_LABEL, SEVERITY_TONE } from '../hooks/usePlenoFindings'
import { useTenders } from '../hooks/useTenders'
import { useFindingQuoteProvenance, provenanceFor } from '../hooks/useFindingQuoteProvenance'
import { QUOTE_PROVENANCE_STATUS_IDS } from '../scraper/quote-provenance'
import { CLAIM_VISIBILITIES } from '../scraper/claim-public-gate'
import { isMachineAuthored } from '../scraper/finding-authorship'
import { blocLabel } from '../lib/party-label.js'
import { refDateIndexFor, refDate } from '../lib/crosschecked-date.js'
import {
  refStatusIndexFor,
  refStatus,
  snippetWithoutStatus,
  REF_STATUS_KINDS,
} from '../lib/crosschecked-status.js'
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
        fontSize: 'var(--fs-micro)',
        // No opacity: this is text inside a tinted chip, and opacity there
        // drops it below AA against the tint at any theme.
        color: known ? 'var(--ink70)' : 'var(--ink50)',
        background: 'var(--soft)',
        border: known ? 'none' : '1px dashed var(--border2)',
        padding: '1px 5px',
        borderRadius: 'var(--r-input)',
        marginRight: 6,
        whiteSpace: 'nowrap',
      }}
      title={known ? `${field} · ${date.iso}` : t('findings.refs.date.noneTitle')}
    >
      {known ? `${fmtDateShort(date.iso)} · ${field}` : t('findings.refs.date.none')}
    </span>
  )
}

/**
 * What the procurement register says happened to a cross-checked document.
 *
 * The date was published beside every ref and the STATE was not, so three
 * PLACSP procedures annulled before award — `finalAmount: 0`, no award,
 * formalisation or start date at all — appeared under «Documentos cotejados»
 * looking exactly like a signed contract. Nothing published names them, so the
 * removal criteria leave them in place; what was owed was the missing fact.
 *
 * Rendered like `RefDate` and for the same reasons: always present when the
 * snapshot has resolved the ref, always saying WHICH answer it is, and with a
 * dashed border when the register publishes nothing. A state shown only on the
 * annulled ones would make its absence ambiguous — «fine» and «unresolved»
 * would look the same.
 *
 * `status: 'unknown'` is Gobierto's blank after normalisation, and it is not a
 * state (`docs/DATA_INTEGRITY.md` rule 3). It resolves to `null` here and
 * renders as «sin estado», never as the token — which is what 16 published
 * snippets still say in their own text, and what `snippetWithoutStatus` takes
 * off the display copy.
 */
// `--ink70` es hoy un tier real y definido —.78 en claro, el secundario de la
// escala— así que este chip lo usa sin reparos. El comentario anterior avisaba
// de que estaba sin definir y caía al color heredado: cierto cuando se escribió,
// falso desde que la escala se arregló. Se corrige aquí porque un comentario que
// desaconseja usar un token perfectamente bueno se obedece igual que una regla.
const REF_STATUS_TONE = {
  cancelled: { fg: 'var(--warn-ink)', bg: 'var(--warn-soft)' },
  committed: { fg: 'var(--ink70)', bg: 'var(--soft)' },
  'in-flight': { fg: 'var(--ink70)', bg: 'var(--soft)' },
}

function RefStatus({ status, t }) {
  // `undefined` = the tenders snapshot has not resolved this ref yet. Saying
  // anything here would be a claim about the document made from our own
  // loading state — the same rule RefDate follows.
  if (status === undefined) return null
  const known = status !== null
  const tone = known ? REF_STATUS_TONE[status.kind] : null
  return (
    <span
      className="mono"
      style={{
        fontSize: 'var(--fs-micro)',
        // No opacity: tinted chip, and opacity drops the text below AA
        // against the tint at either theme.
        color: known ? tone.fg : 'var(--ink50)',
        background: known ? tone.bg : 'var(--soft)',
        border: known ? 'none' : '1px dashed var(--border2)',
        padding: '1px 5px',
        borderRadius: 'var(--r-input)',
        marginRight: 6,
        whiteSpace: 'nowrap',
      }}
      title={
        known
          ? `${t(`findings.refs.status.${status.kind}Title`)} (${status.status})`
          : t('findings.refs.status.noneTitle')
      }
    >
      {known ? t(`findings.refs.status.${status.kind}`) : t('findings.refs.status.none')}
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
  const statusIndex = refStatusIndexFor(tenders)
  if (!refs || refs.length === 0) return null
  const isCrossChecked = kind === 'crossChecked'
  const label = t(isCrossChecked ? 'findings.refs.crossChecked' : 'findings.refs.contradiction')
  const tone = isCrossChecked ? 'var(--ink50)' : 'var(--crit-ink)'
  return (
    <div style={{ marginTop: 6 }}>
      <div
        className="mono"
        style={{
          fontSize: 'var(--fs-micro)',
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
            <span
              className="mono"
              style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginRight: 6 }}
            >
              {r.kind.toUpperCase()}
            </span>{' '}
            <RefDate date={refDate(r, index, plenoDate)} t={t} />{' '}
            <RefStatus status={refStatus(r, statusIndex)} t={t} />{' '}
            {/* The spaces above are load-bearing: margins separate the chips
                visually, but a screen reader reads the text nodes, and without
                them it says «adjudicacióncontrato emergencia». */}
            {/* The snippet loses its `· estado: <token>` tail: the state now
                has a field of its own, and the tail printed the raw sentinel
                «unknown» to a reader on 16 of these. Display only — the
                committed snippet is untouched. */}
            <span style={{ fontSize: 'var(--fs-meta)' }}>{snippetWithoutStatus(r.snippet)}</span>
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

/**
 * The second mark, and the one that took longer to notice.
 *
 * `src/scraper/claim-public-gate.ts` calls itself the «single source of truth
 * for what the machine-extracted verifier output may surface to the public»,
 * and it fails safe. `/plenos` obeys it. `/hallazgos` never consulted it: of
 * the 177 verbatims published here the gate would show 16, toggle 86 and HIDE
 * 75 — every one of those 75 an `acusacion_publica` the verifier could not
 * ground in any municipal record. So this page was publishing, unqualified,
 * accusations by named political groups that the same site withholds one click
 * away.
 *
 * The gate's own header says promotion into a finding is the sanctioned way
 * past it, «precisely because a person is standing in it». For most of these,
 * the person was `auto-curation-v1`. That is a curation problem, queued for a
 * human by `triage:finding-exception`; it is not fixed by deleting quotes,
 * which would be a larger editorial act taken by the same kind of process.
 * What the reader was owed is the missing fact, and this is it.
 *
 * TWO marks, not one, because the gate keeps them apart on purpose: an
 * ungrounded ACCUSATION and an ungrounded ordinary claim are different things,
 * and collapsing them would tell a reader that «el presupuesto sube un 3 %» is
 * unproven in the same way «se adjudicó a dedo» is.
 *
 * Neither says the claim is false. `sin-datos` is the verifier reporting that
 * the municipal record neither confirms nor refutes it — the same «ninguno las
 * respalda ni las desmiente» a curator already writes into some summaries — and
 * the wording below stays inside that. Keyed by the gate's OWN enum, so a
 * fourth outcome cannot arrive unworded.
 */
/**
 * Quién dejó pasar una acusación que nadie pudo contrastar.
 *
 * Decía «Aquí aparece porque **alguien** promovió la ficha: el pie dice quién»,
 * y «alguien» es una persona. Sobre una acusación pública contra la gestión
 * municipal, eso le dice al lector que un humano miró este caso y asumió la
 * responsabilidad de publicarlo igualmente — una excepción deliberada. Las 19
 * fichas que llevan la marca las firma `auto-curation-v1`: no hubo excepción ni
 * hubo nadie. Lo promovió el mismo proceso que redactó el texto.
 *
 * Ninguna comprobación de datos podía cazarlo, porque el dato estaba bien y la
 * frase mal. Lo cazó leer la página.
 *
 * Ahora sale del propio pie en lugar de insinuarlo, así que no puede volver a
 * separarse de él: el día que una persona promueva una de éstas, la nota dirá su
 * nombre porque lo lee de la ficha.
 */
export function notaAcusacionSinContrastar(curatorName) {
  const base =
    'es una acusación pública sobre la gestión municipal, y en el registro de declaraciones del ' +
    'pleno una acusación sin contrastar no se publica. Aquí aparece igualmente'
  const quien = (curatorName ?? '').trim()
  if (!quien) return `${base}; el pie de la ficha dice quién la editó.`
  return isMachineAuthored(quien)
    ? `${base}, y la ficha la editó un proceso automático (${quien}), no una persona.`
    : `${base}, y la ficha la editó ${quien}.`
}

const CONTRAST_MARK = {
  shown: null,
  toggle: {
    tone: 'ghost',
    chip: 'sin contraste en los datos',
    title:
      'El verificador no halló ningún dato municipal que confirme ni desmienta lo que se afirma aquí.',
    note: 'no es una acusación; en el registro de declaraciones del pleno sale publicada con esta misma etiqueta.',
  },
  hidden: {
    tone: 'warn',
    chip: 'acusación no contrastada',
    title:
      'Es una acusación pública que el verificador no pudo contrastar con ningún dato municipal. No decimos que sea falsa.',
    note: notaAcusacionSinContrastar,
  },
}

/**
 * The two axes, and what a card says about each once.
 *
 * `lead` exists because of a real duplication: 18 of the 52 cards carry both
 * contrast marks, and giving each its own self-contained sentence made the card
 * say «no hay dato que lo confirme ni que lo desmienta» twice, two lines apart.
 * The shared half is stated once per axis and each mark adds only its
 * difference. The transcript axis has no lead — its two notes are about
 * different sessions' file sizes and share no clause.
 */
const MARK_AXES = [
  {
    id: 'transcripcion',
    marks: PROVENANCE_MARK,
    key: (e) => e?.status,
    lead: null,
    href: '/metodologia#citas-transcripcion',
    linkText: 'Cómo se comprueba una cita →',
  },
  {
    id: 'contraste',
    marks: CONTRAST_MARK,
    key: (e) => e?.gate,
    lead:
      'Estas citas se cotejaron automáticamente con la base documental municipal —contratos, ' +
      'subvenciones, presupuesto y promesas publicadas— y no apareció ningún dato que las ' +
      'confirme ni que las desmienta. Eso no las convierte en falsas: quiere decir que no lo sabemos.',
    href: '/metodologia#citas-contraste',
    linkText: 'Qué significa que una cita no esté contrastada →',
  },
]

// The enums are imported, never restated: a hand-copied list of states is how
// six tests in this repo stayed green while production matched nothing
// (docs/DATA_INTEGRITY.md rule 1). A new state must break this on sight.
if (import.meta.env?.DEV) {
  const missing = [
    ...QUOTE_PROVENANCE_STATUS_IDS.filter((id) => !(id in PROVENANCE_MARK)),
    ...CLAIM_VISIBILITIES.filter((id) => !(id in CONTRAST_MARK)),
    ...REF_STATUS_KINDS.filter((id) => !(id in REF_STATUS_TONE)),
  ]
  if (missing.length > 0) {
    throw new Error(
      'PlenoFindings: falta la redacción de lectura para un estado nuevo — ' + missing.join(', '),
    )
  }
}

/**
 * Every mark one quote carries, in reading order: first where the words come
 * from, then whether any municipal data backs what they say. That order is not
 * decorative — you cannot usefully ask the second question about a verbatim
 * until the first one is answered.
 *
 * The chip row and the footnote both derive from this one function, so the two
 * cannot disagree about which marks a quote has.
 */
export function quoteMarks(entry) {
  const out = []
  for (const axis of MARK_AXES) {
    const key = axis.key(entry)
    const mark = key ? axis.marks[key] : null
    if (mark) out.push({ key, axis: axis.id, ...mark })
  }
  return out
}

/** The chips beside one quote. Renders nothing for a quote with no marks. */
export function QuoteProvenanceMark({ entry }) {
  const marks = quoteMarks(entry)
  if (marks.length === 0) return null
  return (
    // A flex row on its own line, not chips trailing the text: a quote can
    // carry both marks (86 of the 177 do), and two pills pushed onto the end of
    // an italic sentence stop being readable at 375px.
    <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 5 }}>
      {marks.map((m) => (
        <Pill key={m.key} tone={m.tone} size="xs" style={{ fontStyle: 'normal' }}>
          <span title={m.title}>{m.chip}</span>
        </Pill>
      ))}
    </span>
  )
}

/**
 * What the reader should conclude, below the quotes, once per distinct mark. A
 * chip alone says «something is off» without saying what to do with it, and
 * this is prose about named political groups.
 */
export function QuoteProvenanceNote({ entries, curatorName }) {
  const groups = []
  for (const axis of MARK_AXES) {
    const seen = []
    for (const e of entries ?? []) {
      const key = axis.key(e)
      if (key && axis.marks[key] && !seen.includes(key)) seen.push(key)
    }
    if (seen.length > 0) groups.push({ axis, seen })
  }
  if (groups.length === 0) return null
  return (
    <div
      style={{
        marginTop: 8,
        padding: '7px 10px',
        borderLeft: '3px solid var(--warn)',
        background: 'var(--soft)',
        borderRadius: 'var(--r-input)',
        fontSize: 'var(--fs-micro)',
        lineHeight: 1.5,
        color: 'var(--ink70)',
      }}
    >
      {groups.map(({ axis, seen }, gi) => (
        <div
          key={axis.id}
          // A rule between the axes: run together, the two explanations read as
          // one long paragraph about one problem, and they are two problems.
          style={
            gi === 0
              ? undefined
              : { marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border2)' }
          }
        >
          {axis.lead && <div style={{ marginBottom: 2 }}>{axis.lead}</div>}
          {seen.map((s) => (
            <div key={s} style={{ marginTop: 2 }}>
              <strong style={{ color: 'var(--ink)', fontWeight: 600 }}>{axis.marks[s].chip}</strong>
              {' — '}
              {/* Una nota puede ser una frase fija o depender de la propia
                  ficha. La de «acusación no contrastada» tiene que leer el pie:
                  afirmar a secas que alguien lo decidió es lo que estaba mal. */}
              {typeof axis.marks[s].note === 'function'
                ? axis.marks[s].note(curatorName)
                : axis.marks[s].note}
            </div>
          ))}
          <a href={axis.href} style={{ color: 'var(--civic)', textDecoration: 'underline' }}>
            {axis.linkText}
          </a>
        </div>
      ))}
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
            <span className="mono" style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>
              {f.plenoDate} · editado por {f.curatorName}
            </span>
          </div>
          <div style={{ fontSize: 'var(--fs-body)', fontWeight: 600, lineHeight: 1.35 }}>
            {f.title}
          </div>
        </div>
      </div>
      <p
        style={{
          fontSize: 'var(--fs-meta)',
          color: 'var(--ink70)',
          marginTop: 8,
          lineHeight: 1.55,
        }}
      >
        {f.summary}
      </p>
      {f.quotes?.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {f.quotes.slice(0, 3).map((q, i) => (
            <Quote
              key={i}
              text={q.text}
              attribution={q.speakerGroup ? blocLabel(q.speakerGroup) : null}
              marks={<QuoteProvenanceMark entry={prov[i]} />}
            />
          ))}
          {/* Only the three quotes this card shows are marked, so the note must
              describe those and not the finding's full list. */}
          <QuoteProvenanceNote entries={prov.slice(0, 3)} curatorName={f.curatorName} />
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
            borderRadius: 'var(--r-input)',
            fontSize: 'var(--fs-meta)',
            lineHeight: 1.5,
            color: 'var(--ink)',
          }}
        >
          <div
            className="mono"
            style={{
              fontSize: 'var(--fs-micro)',
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
          fontSize: 'var(--fs-meta)',
          color: 'var(--ink50)',
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
