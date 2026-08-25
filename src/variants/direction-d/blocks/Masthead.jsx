import { PALETTE, SERIF, SANS, MONO, fmtDateLong } from '../tokens'
import { useT } from '../../../i18n'

export function EditorialMasthead({ now }) {
  const t = useT()
  return (
    <div style={{ borderBottom: '2px solid ' + PALETTE.rule, paddingBottom: 10 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 12,
          fontFamily: MONO,
          fontSize: 'var(--fs-micro)',
          color: PALETTE.ink60,
          letterSpacing: '.1em',
          textTransform: 'uppercase',
          marginBottom: 6,
        }}
      >
        <span>{t('landing.masthead.kicker')}</span>
        <span>{fmtDateLong(now)}</span>
      </div>
      {/* The page's only h1. Until Aug 2026 the landing's single heading was
          the LeadStory press headline — so the homepage's h1 was a third-party
          article title, and when that block was retired the page was left with
          NO headings at all: a screen-reader user pressing H got nothing, on
          the most-visited route. axe never caught it because
          `page-has-heading-one` is a best-practice rule, outside the wcag2aa
          tags the suite gates on. */}
      <h1
        style={{
          margin: 0,
          fontFamily: SERIF,
          fontSize: 'var(--fs-display)',
          fontWeight: 900,
          letterSpacing: '-.03em',
          lineHeight: 0.95,
        }}
      >
        {t('landing.masthead.title')}
      </h1>
      <div
        style={{
          fontFamily: MONO,
          fontSize: 'var(--fs-micro)',
          color: PALETTE.accent,
          letterSpacing: '.18em',
          textTransform: 'uppercase',
          fontWeight: 700,
          marginTop: 5,
        }}
      >
        {t('landing.masthead.tagline')}
      </div>
    </div>
  )
}

export function QuejaCTA() {
  const t = useT()
  // TODO operator: paste a Loom share URL here to enable the embed.
  return (
    <div
      style={{
        padding: '14px 16px',
        background: '#EEF4FF',
        border: '1px solid #C7D7F8',
        borderRadius: 'var(--r-card)',
      }}
    >
      <div
        style={{
          fontFamily: MONO,
          fontSize: 'var(--fs-micro)',
          color: PALETTE.civic,
          letterSpacing: '.14em',
          textTransform: 'uppercase',
          fontWeight: 700,
          marginBottom: 6,
        }}
      >
        {t('landing.queja.kicker')}
      </div>
      <h2
        style={{
          margin: '0 0 10px',
          fontFamily: SERIF,
          fontSize: 'var(--fs-card)',
          lineHeight: 1.15,
          fontWeight: 600,
          letterSpacing: '-.01em',
          color: PALETTE.ink,
        }}
      >
        {t('landing.queja.title')}
      </h2>
      <div
        style={{
          fontSize: 'var(--fs-aux)',
          color: PALETTE.ink60,
          marginBottom: 12,
          lineHeight: 1.45,
        }}
      >
        {t('landing.queja.body1')}{' '}
        <span
          style={{
            fontFamily: MONO,
            background: '#fff',
            padding: '1px 5px',
            borderRadius: 'var(--r-input)',
            border: '1px solid #DDE3EA',
          }}
        >
          /queja
        </span>
        {t('landing.queja.body2')}
      </div>
      <a
        href="https://t.me/munigraph_bot?start=landing"
        target="_blank"
        rel="noreferrer"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '9px 16px',
          background: PALETTE.civic,
          color: '#fff',
          fontFamily: SANS,
          fontSize: 'var(--fs-aux)',
          fontWeight: 600,
          borderRadius: 'var(--r-input)',
          textDecoration: 'none',
          boxShadow: '0 2px 6px rgba(14,91,98,.25)',
        }}
      >
        {t('landing.queja.cta')}
      </a>
      <a
        href="/aviso-legal"
        style={{
          marginLeft: 10,
          fontSize: 'var(--fs-micro)',
          color: PALETTE.civic,
          textDecoration: 'underline',
          textUnderlineOffset: 2,
        }}
      >
        {t('landing.queja.privacy')}
      </a>
    </div>
  )
}
