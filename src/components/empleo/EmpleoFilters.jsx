const ctrl = {
  padding: '7px 10px',
  fontSize: 12.5,
  border: '1px solid var(--border)',
  borderRadius: 'var(--r-input)',
  background: 'var(--paper)',
  color: 'var(--ink)',
  maxWidth: '100%',
}

function Select({ value, onChange, ariaLabel, children }) {
  return (
    <select value={value} onChange={onChange} aria-label={ariaLabel} style={ctrl}>
      {children}
    </select>
  )
}

/**
 * Controlled filter bar for /empleo. Presentational: the parent owns the filter
 * state and passes `onPatch(partial)` to merge changes. Dropdown options come
 * from the full open set so they stay stable as the list narrows.
 */
export default function EmpleoFilters({
  filters,
  onPatch,
  sortBy,
  onSort,
  municipios,
  contracts,
  resultCount,
  onClear,
  t,
}) {
  const anyActive =
    !!filters.q ||
    filters.ribaOnly ||
    !!filters.municipio ||
    !!filters.contract ||
    !!filters.jornada ||
    filters.closing !== 'all'

  return (
    <div
      style={{
        border: '1px solid var(--border2)',
        borderRadius: 'var(--r-card)',
        padding: 12,
        marginBottom: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      {/* row 1 — search + sort */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="search"
          value={filters.q}
          onChange={(e) => onPatch({ q: e.target.value })}
          placeholder={t('empleo.searchPlaceholder')}
          aria-label={t('empleo.searchPlaceholder')}
          style={{ ...ctrl, flex: '1 1 220px', minWidth: 0 }}
        />
        <Select
          value={sortBy}
          onChange={(e) => onSort(e.target.value)}
          ariaLabel={t('empleo.sortBy')}
        >
          <option value="deadline">{t('empleo.sortDeadline')}</option>
          <option value="published">{t('empleo.sortPublished')}</option>
        </Select>
      </div>

      {/* row 2 — dimension filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Select
          value={filters.municipio}
          onChange={(e) => onPatch({ municipio: e.target.value })}
          ariaLabel={t('empleo.filterMunicipio')}
        >
          <option value="">{t('empleo.allMunicipios')}</option>
          {municipios.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </Select>
        <Select
          value={filters.contract}
          onChange={(e) => onPatch({ contract: e.target.value })}
          ariaLabel={t('empleo.filterContract')}
        >
          <option value="">{t('empleo.allContracts')}</option>
          {contracts.map((c) => (
            <option key={c.raw} value={c.raw}>
              {c.label} ({c.count})
            </option>
          ))}
        </Select>
        <Select
          value={filters.jornada}
          onChange={(e) => onPatch({ jornada: e.target.value })}
          ariaLabel={t('empleo.filterJornada')}
        >
          <option value="">{t('empleo.allJornadas')}</option>
          <option value="Completa">{t('empleo.jornadaFull')}</option>
          <option value="Parcial">{t('empleo.jornadaPart')}</option>
        </Select>
        <Select
          value={filters.closing}
          onChange={(e) => onPatch({ closing: e.target.value })}
          ariaLabel={t('empleo.filterClosing')}
        >
          <option value="all">{t('empleo.closingAll')}</option>
          <option value="week">{t('empleo.closingWeek')}</option>
          <option value="month">{t('empleo.closingMonth')}</option>
        </Select>
        <label
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12.5,
            color: 'var(--ink70)',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          <input
            type="checkbox"
            checked={filters.ribaOnly}
            onChange={(e) => onPatch({ ribaOnly: e.target.checked })}
          />
          {t('empleo.ribaOnly')}
        </label>
      </div>

      {/* result count + clear */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          fontSize: 12,
          color: 'var(--ink50)',
        }}
      >
        <span className="mono">
          {resultCount} {t('empleo.results')}
        </span>
        {anyActive && (
          <button
            type="button"
            onClick={onClear}
            style={{
              fontSize: 12,
              color: 'var(--civic)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              textDecoration: 'underline',
            }}
          >
            {t('empleo.clearFilters')}
          </button>
        )}
      </div>
    </div>
  )
}
