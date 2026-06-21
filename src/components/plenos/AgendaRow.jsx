import { Pill } from '../Primitives'
import { SECTION_LABEL, SECTION_TONE } from '../../hooks/usePlenoAgendas'

export function AgendaRow({ item }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '24px 1fr',
        gap: 10,
        padding: '6px 0',
        borderBottom: '1px dashed var(--border2)',
        fontSize: 12.5,
      }}
    >
      <div className="mono" style={{ color: 'var(--ink50)', textAlign: 'right' }}>
        {item.number}.
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', flexWrap: 'wrap' }}>
          {item.department && (
            <span
              className="mono"
              style={{
                fontSize: 9.5,
                color: 'var(--civic)',
                letterSpacing: '.08em',
                textTransform: 'uppercase',
                fontWeight: 700,
              }}
            >
              {item.department}
            </span>
          )}
          {item.expediente && (
            <span className="mono" style={{ fontSize: 9.5, color: 'var(--ink50)' }}>
              Expte. {item.expediente}
            </span>
          )}
          <Pill tone={SECTION_TONE[item.section] || 'ghost'} size="xs">
            {SECTION_LABEL[item.section] || item.section}
          </Pill>
        </div>
        <div style={{ marginTop: 2, color: 'var(--ink)', lineHeight: 1.4 }}>{item.title}</div>
      </div>
    </div>
  )
}
