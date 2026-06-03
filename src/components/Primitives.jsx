import { Ic } from './Icons'

const TONES = {
  neutral: { bg: 'var(--soft)', fg: 'var(--ink)' },
  civic: { bg: 'var(--civic-soft)', fg: 'var(--civic-ink)' },
  ok: { bg: 'var(--ok-soft)', fg: 'var(--ok-ink)' },
  warn: { bg: 'var(--warn-soft)', fg: 'var(--warn-ink)' },
  crit: { bg: 'var(--crit-soft)', fg: 'var(--crit-ink)' },
  intel: { bg: 'var(--intel-soft)', fg: 'var(--intel-ink)' },
  ghost: { bg: 'transparent', fg: 'var(--ink60)', border: '1px solid var(--border)' },
}

export function Pill({ tone = 'neutral', children, size = 'sm', style = {} }) {
  const t = TONES[tone] || TONES.neutral
  return (
    <span
      className="mono"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: size === 'xs' ? '2px 6px' : '3px 8px',
        borderRadius: 999,
        background: t.bg,
        color: t.fg,
        fontSize: size === 'xs' ? 10 : 11,
        fontWeight: 600,
        letterSpacing: '.02em',
        lineHeight: 1,
        border: t.border || 'none',
        ...style,
      }}
    >
      {children}
    </span>
  )
}

export function Delta({ v, size = 11 }) {
  if (v === 0) {
    return (
      <span className="mono" style={{ color: 'var(--ink50)', fontSize: size }}>
        —
      </span>
    )
  }
  const up = v > 0
  return (
    <span
      className="mono"
      style={{
        color: up ? 'var(--ok)' : 'var(--crit)',
        fontSize: size,
        fontWeight: 600,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
      }}
    >
      {up ? <Ic.up width={8} height={8} /> : <Ic.down width={8} height={8} />}
      {up ? '+' : ''}
      {v.toFixed(1)}
    </span>
  )
}

export function Card({ children, style = {}, pad = true, hover = false }) {
  const onEnter = hover
    ? (e) => {
        e.currentTarget.style.borderColor = 'var(--border)'
      }
    : undefined
  const onLeave = hover
    ? (e) => {
        e.currentTarget.style.borderColor = 'var(--border2)'
      }
    : undefined
  return (
    <div
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      style={{
        background: 'var(--paper)',
        border: '1px solid var(--border2)',
        borderRadius: 12,
        padding: pad ? 18 : 0,
        transition: 'border-color .15s',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

export function SectionHead({ eyebrow, title, right }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        marginBottom: 10,
        gap: 12,
      }}
    >
      <div style={{ minWidth: 0 }}>
        {eyebrow && (
          <div
            className="mono"
            style={{
              fontSize: 10,
              color: 'var(--ink50)',
              textTransform: 'uppercase',
              letterSpacing: '.08em',
            }}
          >
            {eyebrow}
          </div>
        )}
        <div
          style={{
            fontSize: 15,
            fontWeight: 600,
            letterSpacing: '-.01em',
            marginTop: eyebrow ? 3 : 0,
          }}
        >
          {title}
        </div>
      </div>
      {right}
    </div>
  )
}

export function Button({ variant = 'ghost', children, ...rest }) {
  const base = {
    padding: '7px 12px',
    borderRadius: 7,
    fontSize: 13,
    fontWeight: 500,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    cursor: 'pointer',
    transition: 'background .15s, opacity .15s',
  }
  const solid = { ...base, background: 'var(--ink)', color: 'var(--paper)' }
  const ghost = {
    ...base,
    background: 'var(--paper)',
    color: 'var(--ink)',
    border: '1px solid var(--border)',
  }
  return (
    <button style={variant === 'solid' ? solid : ghost} {...rest}>
      {children}
    </button>
  )
}

export function LinkArrow({ children, ...rest }) {
  return (
    <button
      {...rest}
      style={{ fontSize: 12, color: 'var(--civic)', fontWeight: 500, cursor: 'pointer' }}
    >
      {children}
    </button>
  )
}

export function LegendDot({ color, label }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: color }} />
      {label}
    </span>
  )
}

/**
 * WhatsApp share deeplink. Spain-native distribution channel — most
 * Riba-roja civic conversation happens in vecinos WhatsApp groups, not
 * Telegram or email. Renders a tiny "wa" pill that opens wa.me with a
 * pre-filled message + canonical link.
 *
 * `text` is the human message ("Queja pendiente · bache en calle Major").
 * `url`  is the canonical page to share; if omitted, defaults to the
 *        current URL at click time.
 */
export function ShareWA({ text, url, size = 10.5 }) {
  const onClick = (e) => {
    e.stopPropagation()
    const targetUrl = url || (typeof window !== 'undefined' ? window.location.href : '')
    const body = encodeURIComponent(`${text}${targetUrl ? `\n${targetUrl}` : ''}`)
    const href = `https://wa.me/?text=${body}`
    if (typeof window !== 'undefined') window.open(href, '_blank', 'noopener,noreferrer')
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Compartir en WhatsApp"
      title="Compartir en WhatsApp"
      className="mono"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 7px',
        borderRadius: 999,
        background: '#DCFCE7',
        color: '#15803D',
        fontSize: size,
        fontWeight: 700,
        letterSpacing: '.04em',
        cursor: 'pointer',
        border: '1px solid #BBF7D0',
      }}
    >
      <span aria-hidden="true">↗</span>
      WA
    </button>
  )
}
