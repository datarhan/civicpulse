import { Pill } from '../Primitives'
import { SECTION_TONE } from '../../hooks/usePlenoAgendas'
import { DEPARTMENT_LABEL } from '../../scraper/departments'
import { rotuloDe, useLocale } from '../../i18n'
import { rellena } from '../../lib/formatters'

/**
 * The department chip used to read `item.department`, the raw upstream string.
 * 57 of 377 items have a `departmentSlug` re-derived from their title while
 * `department` stays null — so those items showed no chip here, yet counted as
 * that councillor's council business on /cargos/:slug and as the área's
 * activity on /departamentos. Three surfaces, three different answers about
 * the same item. The canonical slug is the one they all agree on.
 *
 * En el idioma de quien lee: la tabla lleva los dos. El texto crudo de origen,
 * cuando no hay slug, es dato y va como se publicó.
 */
function deptChip(item, locale) {
  if (item.departmentSlug && DEPARTMENT_LABEL[item.departmentSlug]) {
    return DEPARTMENT_LABEL[item.departmentSlug][locale] ?? DEPARTMENT_LABEL[item.departmentSlug].es
  }
  return item.department || null
}

export function AgendaRow({ item }) {
  const { locale, t } = useLocale()
  const area = deptChip(item, locale)
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '24px 1fr',
        gap: 10,
        padding: '6px 0',
        borderBottom: '1px dashed var(--border2)',
        fontSize: 'var(--fs-meta)',
      }}
    >
      <div className="mono" style={{ color: 'var(--ink50)', textAlign: 'right' }}>
        {item.number}.
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', flexWrap: 'wrap' }}>
          {area && (
            <span
              className="mono"
              style={{
                fontSize: 'var(--fs-micro)',
                color: 'var(--civic)',
                letterSpacing: '.08em',
                textTransform: 'uppercase',
                fontWeight: 700,
              }}
            >
              {area}
            </span>
          )}
          {item.expediente && (
            <span className="mono" style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)' }}>
              {rellena(t('plenoDetail.expediente'), { expediente: item.expediente })}
            </span>
          )}
          <Pill tone={SECTION_TONE[item.section] || 'ghost'} size="xs">
            {rotuloDe(t, `pleno.seccion.${item.section}`, item.section)}
          </Pill>
        </div>
        <div style={{ marginTop: 2, color: 'var(--ink)', lineHeight: 1.4 }}>{item.title}</div>
      </div>
    </div>
  )
}
