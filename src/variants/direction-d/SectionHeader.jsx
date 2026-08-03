/**
 * Editorial-column section header — a tinted band with a left accent rule,
 * semantically colour-coded per section, so the landing column ("El Mirador")
 * reads as a sequence of scannable "chapters" instead of seven identical grey
 * kickers separated by hairlines.
 *
 * Kept faithful to the warm-newspaper aesthetic: still a mono / uppercase /
 * letter-spaced kicker, the colour lives mostly in the thin 3px bar + the
 * kicker ink; the background is a low-alpha wash so it whispers rather than
 * shouts. The landing renders on a fixed warm-paper palette (it does NOT swap
 * to the html.dark tokens), so a single light-mode wash per tone is enough.
 *
 * Tones are grouped by meaning, not just spread across the rainbow:
 *   navy  → institutional structure (pleno)
 *   blue  → government tracking (promesas)
 *   amber → accountability / oversight (rendición de cuentas)
 *   red   → newsroom / press (prensa)
 *   green → money (contratos)
 *   teal  → civic engagement (participa, eventos)
 *   ink   → OUR OWN reporting (reportajes)
 *
 * `reportajes` is deliberately the only achromatic tone. It leads the column,
 * and the distinction it has to carry is not "which topic" but "who wrote
 * this" — our own investigations against seven feeds of other people's output.
 * Full-strength masthead ink says that; an eighth hue would just have read as
 * one more category.
 */

export const SECTION_TONES = {
  reportajes: { bar: '#0B0F19', wash: 'rgba(11,15,25,.06)', ink: '#0B0F19' },
  pleno: { bar: '#1E3A8A', wash: 'rgba(30,58,138,.07)', ink: '#1E3A8A' },
  promesas: { bar: '#2463EB', wash: 'rgba(36,99,235,.08)', ink: '#1E4FBB' },
  rendicion: { bar: '#B45309', wash: 'rgba(180,83,9,.10)', ink: '#B45309' },
  prensa: { bar: '#B0291F', wash: 'rgba(176,41,31,.08)', ink: '#8F221A' },
  contratos: { bar: '#16A34A', wash: 'rgba(22,163,74,.09)', ink: '#15803D' },
  participa: { bar: '#0D9488', wash: 'rgba(13,148,136,.10)', ink: '#0F766E' },
  eventos: { bar: '#0D9488', wash: 'rgba(13,148,136,.10)', ink: '#0F766E' },
  empleo: { bar: '#4F46E5', wash: 'rgba(79,70,229,.08)', ink: '#4338CA' },
  neutral: { bar: 'rgba(11,15,25,.35)', wash: 'rgba(11,15,25,.05)', ink: 'rgba(11,15,25,.68)' },
}

export function sectionTone(name) {
  return SECTION_TONES[name] || SECTION_TONES.neutral
}

/**
 * @param {object} props
 * @param {string} props.tone   one of SECTION_TONES (unknown → neutral)
 * @param {import('react').ReactNode} props.title   the kicker text
 * @param {import('react').ReactNode} [props.meta]  right-aligned mono meta
 * @param {import('react').ReactNode} [props.badge] chip rendered after the title
 * @param {object} [props.style] extra styles merged onto the band
 */
export function SectionHeader({ tone = 'neutral', title, meta, badge, style }) {
  const t = sectionTone(tone)
  return (
    <div
      data-section-band
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 10px',
        marginBottom: 10,
        background: t.wash,
        borderRadius: 'var(--r-input)',
        borderLeft: `3px solid ${t.bar}`,
        ...style,
      }}
    >
      {/* h2, not a span: these bands ARE the column's section structure, so
          they are what a screen-reader user navigates by. Rendering them as
          styled text left the landing with no heading outline at all. */}
      <h2
        className="mono"
        style={{
          margin: 0,
          fontSize: 10,
          color: t.ink,
          letterSpacing: '.12em',
          textTransform: 'uppercase',
          fontWeight: 700,
        }}
      >
        {title}
      </h2>
      {badge}
      {meta != null && (
        <span
          className="mono"
          style={{
            fontSize: 10,
            color: 'rgba(11,15,25,.55)',
            marginLeft: 'auto',
            whiteSpace: 'nowrap',
          }}
        >
          {meta}
        </span>
      )}
    </div>
  )
}
