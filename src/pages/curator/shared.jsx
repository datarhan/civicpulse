import { Component, useCallback, useEffect, useState } from 'react'
import { Card, Pill } from '../../components/Primitives'
import { QuoteProvenanceMark } from '../../components/PlenoFindings'
import { useFindingQuoteProvenance, provenanceFor } from '../../hooks/useFindingQuoteProvenance'

class SectionErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null, info: null }
  }
  static getDerivedStateFromError(error) {
    return { error, info: null }
  }
  componentDidCatch(error, info) {
    console.error(`[Curator section "${this.props.label}" crashed]`, error, info)
    this.setState({ error, info })
  }
  render() {
    if (this.state.error) {
      return (
        <Card style={{ padding: 12, marginBottom: 18, borderColor: 'var(--crit-ink)' }}>
          <div className="mono" style={{ fontSize: 11, color: 'var(--crit-ink)', marginBottom: 6 }}>
            ⚠ {this.props.label} crashed
          </div>
          <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', margin: 0 }}>
            {String(this.state.error?.stack || this.state.error || 'unknown error')}
          </pre>
        </Card>
      )
    }
    return this.props.children
  }
}

const QUEUE_URL = '/data/auto-curation-queue.json'
const ISSUES_URL = '/data/finding-response-issues.json'

function useJsonResource(url) {
  const [state, setState] = useState({ loading: true, error: null, data: null })
  const refresh = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }))
    fetch(url, { cache: 'no-store' })
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
        return r.json()
      })
      .then((data) => setState({ loading: false, error: null, data }))
      .catch((err) => setState({ loading: false, error: err.message, data: null }))
  }, [url])
  useEffect(() => refresh(), [refresh])
  return { ...state, refresh }
}

async function callCurator(action, args = {}) {
  const res = await fetch('/api/curator/run', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, args }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    return {
      ok: false,
      error: json.error || `${res.status} ${res.statusText}`,
      issues: json.issues,
      raw: json,
    }
  }
  return { ok: true, ...json }
}

async function callCommit(message, files) {
  const res = await fetch('/api/curator/commit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(files ? { message, files } : { message }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok)
    return { ok: false, error: json.error || `${res.status} ${res.statusText}`, raw: json }
  return { ok: true, ...json }
}

function shortDate(iso) {
  if (!iso) return ''
  return iso.slice(0, 10)
}

function VerdictPill({ verdict }) {
  const tone =
    verdict === 'verificado'
      ? 'ok'
      : verdict === 'contradicho'
        ? 'crit'
        : verdict === 'parcial'
          ? 'warn'
          : 'neutral'
  return <Pill tone={tone}>{verdict}</Pill>
}

function PartyChip({ party }) {
  if (!party) return null
  const tone =
    party === 'PSOE'
      ? 'civic'
      : party === 'PP'
        ? 'intel'
        : party === 'VOX'
          ? 'crit'
          : party === 'Compromís'
            ? 'ok'
            : 'neutral'
  return <Pill tone={tone}>{party}</Pill>
}

/**
 * The marks a reader already sees beside this quote on `/hallazgos`.
 *
 * Both axes: which transcript the words come from, and what the editorial gate
 * would do with the claim behind them. The curator queues rendered `«{text}»`
 * plain, so the person deciding whether a finding stays published saw LESS
 * about a quote than a visitor does — backwards for the surface where the
 * judgement actually happens.
 *
 * The PUBLIC component, not a copy of it. `quoteMarks` and its wording live in
 * `PlenoFindings.jsx`; a second rendering here could drift from the page and
 * let a curator approve against marks the reader never got — the exact failure
 * `RefList` already caused once by being duplicated verbatim across two
 * surfaces. Reading the snapshot through the same hook the page uses makes the
 * two provably the same answer, rather than two answers that agree today.
 *
 * Renders nothing for an unmarked quote, and nothing while the snapshot is in
 * flight: silence is the honest output when there is nothing to say.
 */
function QuoteMarks({ findingId, index }) {
  const { data } = useFindingQuoteProvenance()
  return <QuoteProvenanceMark entry={provenanceFor(data, findingId)[index]} />
}

export {
  SectionErrorBoundary,
  QUEUE_URL,
  ISSUES_URL,
  useJsonResource,
  callCurator,
  callCommit,
  shortDate,
  VerdictPill,
  PartyChip,
  QuoteMarks,
}
