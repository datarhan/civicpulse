/**
 * Says out loud that a dataset's upstream is gone.
 *
 * `participa.json` has been frozen since 2026-05-14 because
 * participa.ribarroja.es was decommissioned. The scraper handles that
 * impeccably — it refuses to overwrite, keeps `generatedAt` pinned to the last
 * good fetch rather than re-stamping it, and records
 * `upstream: {status, lastGoodAt, reason, successorUrl}`.
 *
 * Nothing in the UI read any of it. Both surfaces rendered 79-day-old
 * participation content under a date, which a reader takes as "quiet lately"
 * rather than "this source no longer exists". The honest signal was already in
 * the file; it just needed saying.
 */
export function RetiredSourceNote({ upstream }) {
  if (!upstream || upstream.status !== 'retired') return null
  return (
    <div
      style={{
        fontSize: 11.5,
        lineHeight: 1.5,
        color: 'var(--warn-ink)',
        background: 'var(--warn-soft)',
        border: '1px solid var(--border2)',
        borderRadius: 'var(--r-input)',
        padding: '8px 10px',
        margin: '8px 0',
      }}
    >
      <strong>Fuente retirada.</strong> {upstream.reason}{' '}
      {upstream.lastGoodAt && (
        <>
          Lo que se muestra es la última captura buena
          {` (${String(upstream.lastGoodAt).slice(0, 10)})`}, no contenido actual.
        </>
      )}{' '}
      {upstream.successorUrl && (
        <a
          href={upstream.successorUrl}
          target="_blank"
          rel="noreferrer"
          style={{ color: 'var(--warn-ink)', textDecoration: 'underline' }}
        >
          Portal sucesor →
        </a>
      )}
    </div>
  )
}
