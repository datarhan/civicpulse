import { PALETTE, SERIF, SANS, MONO, fmtDateLong } from '../tokens'

export function EditorialMasthead({ now }) {
  return (
    <div style={{ marginBottom: 18, borderBottom: '2px solid ' + PALETTE.rule, paddingBottom: 10 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 12,
          fontFamily: MONO,
          fontSize: 10.5,
          color: PALETTE.ink60,
          letterSpacing: '.1em',
          textTransform: 'uppercase',
          marginBottom: 6,
        }}
      >
        <span>CivicPulse · Boletín</span>
        <span>{fmtDateLong(now)}</span>
      </div>
      <div
        style={{
          fontFamily: SERIF,
          fontSize: 34,
          fontWeight: 900,
          letterSpacing: '-.03em',
          lineHeight: 0.95,
        }}
      >
        El Mirador
      </div>
      <div
        style={{
          fontFamily: MONO,
          fontSize: 10,
          color: PALETTE.accent,
          letterSpacing: '.18em',
          textTransform: 'uppercase',
          fontWeight: 700,
          marginTop: 5,
        }}
      >
        Diario cívico · Riba-roja de Túria
      </div>
    </div>
  )
}

export function QuejaCTA() {
  // TODO operator: paste a Loom share URL here to enable the embed.
  return (
    <div
      style={{
        marginTop: 10,
        padding: '14px 16px',
        background: '#EEF4FF',
        border: '1px solid #C7D7F8',
        borderRadius: 10,
      }}
    >
      <div
        style={{
          fontFamily: MONO,
          fontSize: 9.5,
          color: PALETTE.civic,
          letterSpacing: '.14em',
          textTransform: 'uppercase',
          fontWeight: 700,
          marginBottom: 6,
        }}
      >
        Voz ciudadana · canal directo
      </div>
      <div
        style={{
          fontFamily: SERIF,
          fontSize: 22,
          lineHeight: 1.15,
          fontWeight: 600,
          letterSpacing: '-.01em',
          color: PALETTE.ink,
          marginBottom: 10,
        }}
      >
        Denuncia un bache en 10 segundos.
      </div>
      <div style={{ fontSize: 12.5, color: PALETTE.ink60, marginBottom: 12, lineHeight: 1.45 }}>
        Abre el bot de Telegram, envía{' '}
        <span
          style={{
            fontFamily: MONO,
            background: '#fff',
            padding: '1px 5px',
            borderRadius: 3,
            border: '1px solid #DDE3EA',
          }}
        >
          /queja
        </span>
        , adjunta foto y ubicación. Si 10 vecinos la apoyan, entra al Registro Electrónico del
        Ayuntamiento como solicitud oficial. Reloj legal público, sin coste, sin datos personales
        publicados.
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
          fontSize: 13.5,
          fontWeight: 600,
          borderRadius: 7,
          textDecoration: 'none',
          boxShadow: '0 2px 6px rgba(36,99,235,.25)',
        }}
      >
        Abrir el bot →
      </a>
      <a
        href="/aviso-legal"
        style={{
          marginLeft: 10,
          fontSize: 11.5,
          color: PALETTE.civic,
          textDecoration: 'underline',
          textUnderlineOffset: 2,
        }}
      >
        Cómo protegemos tus datos
      </a>
    </div>
  )
}
