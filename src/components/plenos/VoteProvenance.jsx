import { Fragment } from 'react'
import { ExtLink } from '../Primitives'
import { isIndependentlyVerified, VOTE_SOURCE_KINDS } from '../../scraper/pleno-votes'
import { rotuloDe, useT } from '../../i18n'
import { rellena } from '../../lib/formatters'

/**
 * Where each half of a vote record came from.
 *
 * A vote asserts two facts of different provenance — «el punto se aprobó» and
 * «PSOE a favor, PP en contra» — and until 2026-08-05 the site showed one
 * citation for both. On /departamentos it was even labelled «Acta oficial»
 * while pointing at regmeet, which publishes the orden del día and the outcome
 * and no per-bloc tally at all; the tallies came off a Whisper transcript the
 * page never mentioned. A reader had no way to tell that half the row rested on
 * a machine transcription, because the citation they could see resolved
 * perfectly.
 *
 * So the minimum this has to do is make the two distinguishable: one line per
 * claim, each naming its own source, each linking to it. The label comes from
 * `VOTE_SOURCE_KINDS` — imported, not restated, so a page cannot describe a
 * source as something the schema does not think it is.
 *
 * The disclaimer follows the same rule, and until 2026-08-09 it did not. One
 * hard-coded string — «sin cotejar con el acta» — was printed under BOTH rows
 * wherever `verification !== 'verificado'`, which is every row. So every vote
 * carried the acta caveat twice and one of the two was false: the outcome comes
 * from regmeet, the council's own session portal, which publishes the orden del
 * día and the result as its record. There is nothing above it to cotejar the
 * outcome against, and printing a caveat there taught readers to skip the one
 * place it means something.
 *
 * Now each row derives its own line, from its own source:
 *
 *   · cotejado  → «cotejado contra <the document actually consulted>». Named,
 *                 never assumed to be the acta — `isIndependentVerificationSource`
 *                 admits the session video too, and saying «acta» when a curator
 *                 watched the video would be the same lie in the other direction.
 *   · otherwise → `VOTE_SOURCE_KINDS[kind].unverifiedNote`, which is null for
 *                 `acta` and `regmeet` (the document states the claim in the
 *                 council's own words) and a real caveat for `transcripcion`
 *                 and `video` (the claim is there only via a reading).
 */
export function VoteProvenance({ provenance }) {
  const t = useT()
  if (!provenance?.outcome) return null
  // Los rótulos de las fuentes, en el idioma de quien lee; el castellano de
  // `VOTE_SOURCE_KINDS` queda de reserva para una clase que el catálogo no tenga.
  const fuente = (kind) =>
    rotuloDe(t, `pleno.fuenteVoto.${kind}`, VOTE_SOURCE_KINDS[kind]?.label ?? kind)
  const sinCotejar = (kind) => {
    const nota = VOTE_SOURCE_KINDS[kind]?.unverifiedNote ?? null
    return nota && rotuloDe(t, `pleno.fuenteVoto.${kind}.sinCotejar`, nota)
  }
  const rows = [
    { key: 'outcome', claim: t('plenoDetail.voto.resultado'), ref: provenance.outcome },
    ...(provenance.breakdown
      ? [{ key: 'breakdown', claim: t('plenoDetail.voto.desglose'), ref: provenance.breakdown }]
      : []),
  ]
  // Una rejilla y no una fila flexible por cita: la columna del rótulo mide lo que
  // el más ancho, así los enlaces de las dos filas empiezan en el mismo borde. Con
  // `minWidth: 62` cabía «Desglose» y no cabe «Desglossament».
  return (
    <div
      style={{
        marginTop: 10,
        display: 'grid',
        gridTemplateColumns: 'max-content minmax(0, 1fr)',
        columnGap: 6,
        rowGap: 3,
        alignItems: 'baseline',
        fontSize: 'var(--fs-aux)',
        lineHeight: 1.45,
      }}
    >
      {rows.map(({ key, claim, ref }) => {
        const verified = isIndependentlyVerified(ref)
        const note = verified
          ? rellena(t('plenoDetail.voto.cotejadoContra'), {
              fuente: fuente(ref.verifiedAgainst.kind),
            })
          : sinCotejar(ref.kind)
        return (
          <Fragment key={key}>
            <span
              className="mono"
              style={{
                fontSize: 'var(--fs-micro)',
                letterSpacing: 0.3,
                color: 'var(--ink50)',
                textTransform: 'uppercase',
              }}
            >
              {claim}
            </span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <ExtLink href={ref.url} style={{ color: 'var(--civic)', textDecoration: 'none' }}>
                {fuente(ref.kind)} →
              </ExtLink>
              {ref.locator && (
                <span
                  className="mono"
                  style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}
                >
                  {ref.locator}
                </span>
              )}
              {note && (
                <span style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>{note}</span>
              )}
            </div>
          </Fragment>
        )
      })}
    </div>
  )
}
