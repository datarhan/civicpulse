import { Ic } from './Icons'
import { useLocale, useT, LOCALES } from '../i18n'

function TwkSelect({ label, value, onChange, opts }) {
  return (
    <div>
      <div
        className="mono"
        style={{
          fontSize: 'var(--fs-micro)',
          color: 'var(--ink50)',
          textTransform: 'uppercase',
          letterSpacing: '.06em',
          marginBottom: 5,
        }}
      >
        {label}
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {opts.map((o) => (
          <button
            key={o.v}
            onClick={() => onChange(o.v)}
            style={{
              padding: '5px 9px',
              borderRadius: 'var(--r-input)',
              fontSize: 'var(--fs-micro)',
              background: value === o.v ? 'var(--civic)' : 'var(--soft)',
              color: value === o.v ? 'white' : 'var(--ink70)',
              fontWeight: value === o.v ? 600 : 500,
            }}
          >
            {o.l}
          </button>
        ))}
      </div>
    </div>
  )
}

function TwkToggle({ label, value, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ fontSize: 'var(--fs-meta)' }}>{label}</div>
      <button
        onClick={() => onChange(!value)}
        style={{
          width: 34,
          height: 20,
          borderRadius: 'var(--r-pill)',
          padding: 2,
          background: value ? 'var(--civic)' : 'var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: value ? 'flex-end' : 'flex-start',
          transition: 'background .15s',
        }}
      >
        <span
          style={{
            width: 16,
            height: 16,
            borderRadius: '50%',
            background: 'white',
            boxShadow: '0 1px 2px rgba(0,0,0,.2)',
          }}
        />
      </button>
    </div>
  )
}

export function TweaksPanel({ open, onClose, state, onChange }) {
  const t = useT()
  const { locale, setLocale } = useLocale()
  if (!open) return null
  return (
    <div
      className="cp-spring-in"
      style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        width: 268,
        zIndex: 40,
        background: 'var(--paper)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-card)',
        boxShadow: '0 16px 40px rgba(0,0,0,.15)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '10px 14px',
          borderBottom: '1px solid var(--border2)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <Ic.settings width={14} height={14} style={{ color: 'var(--ink50)' }} />
        <div style={{ fontSize: 'var(--fs-meta)', fontWeight: 600, flex: 1 }}>
          {t('tweaks.title')}
        </div>
        <button
          onClick={onClose}
          className="mono"
          style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}
        >
          {t('tweaks.close')}
        </button>
      </div>
      <div
        style={{
          padding: 14,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          fontSize: 'var(--fs-meta)',
        }}
      >
        <TwkSelect
          label={t('tweaks.lang.label')}
          value={locale}
          onChange={setLocale}
          opts={LOCALES.map((code) => ({ v: code, l: t(`tweaks.lang.${code}`) }))}
        />
        <TwkSelect
          label={t('tweaks.density.label')}
          value={state.density}
          onChange={(v) => onChange({ density: v })}
          opts={[
            { v: 'compact', l: t('tweaks.density.compact') },
            { v: 'comfortable', l: t('tweaks.density.comfortable') },
            { v: 'spacious', l: t('tweaks.density.spacious') },
          ]}
        />
        <TwkToggle
          label={t('tweaks.dark')}
          value={state.dark}
          onChange={(v) => onChange({ dark: v })}
        />
      </div>
    </div>
  )
}

export function TweaksButton({ onOpen }) {
  const t = useT()
  return (
    <button
      onClick={onOpen}
      aria-label={t('tweaks.open.aria')}
      // Armazón: en papel no hay ajustes que abrir.
      data-print-hide
      style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        width: 40,
        height: 40,
        borderRadius: 'var(--r-pill)',
        background: 'var(--paper)',
        border: '1px solid var(--border)',
        boxShadow: '0 4px 12px rgba(11,15,25,.08)',
        display: 'grid',
        placeItems: 'center',
        color: 'var(--ink50)',
        zIndex: 30,
      }}
    >
      <Ic.settings width={18} height={18} />
    </button>
  )
}
