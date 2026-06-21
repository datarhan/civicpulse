import { usePress, timeAgo as pressTimeAgo } from '../../../hooks/usePress'
import { PALETTE, SERIF, MONO } from '../tokens'
import { ExtLink } from '../../../components/Primitives'

function Kicker({ tone = 'ink', children }) {
  const c = {
    ink: PALETTE.ink,
    red: PALETTE.accent,
    navy: PALETTE.accent2,
    green: PALETTE.ok,
    amber: PALETTE.amber,
    gray: PALETTE.ink60,
  }[tone]
  return (
    <div
      style={{
        fontFamily: MONO,
        fontSize: 10,
        color: c,
        fontWeight: 700,
        letterSpacing: '.14em',
        textTransform: 'uppercase',
      }}
    >
      {children}
    </div>
  )
}

export function LeadStory() {
  const { loading, error, data } = usePress()
  if (loading || error || !data) return null
  const top = (data.items || [])[0]
  if (!top) return null
  const excerpt = (top.excerpt || '').trim()
  return (
    <article style={{ paddingBottom: 22, borderBottom: '1px solid ' + PALETTE.hair }}>
      <Kicker tone="red">{top.source}</Kicker>
      <h1
        style={{
          fontFamily: SERIF,
          fontSize: 28,
          fontWeight: 800,
          letterSpacing: '-.02em',
          lineHeight: 1.1,
          margin: '8px 0 10px',
        }}
      >
        <ExtLink href={top.link} style={{ color: 'inherit', textDecoration: 'none' }}>
          {top.title}
        </ExtLink>
      </h1>
      {excerpt && (
        <div
          style={{
            fontFamily: SERIF,
            fontSize: 14.5,
            color: PALETTE.ink80,
            lineHeight: 1.45,
            fontStyle: 'italic',
            marginBottom: 12,
          }}
        >
          {excerpt.length > 260 ? excerpt.slice(0, 260) + '…' : excerpt}
        </div>
      )}
      <div
        style={{
          fontFamily: MONO,
          fontSize: 10.5,
          color: PALETTE.ink60,
          letterSpacing: '.06em',
        }}
      >
        {pressTimeAgo(top.date).toUpperCase()} ·{' '}
        <ExtLink
          href={top.link}
          style={{ color: PALETTE.civic, textDecoration: 'none', fontWeight: 600 }}
        >
          Leer en {top.source} →
        </ExtLink>
      </div>
    </article>
  )
}
