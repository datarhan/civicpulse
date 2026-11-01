import { rellena, eurosBreves } from '../../lib/formatters'
import { conHuecos } from '../../lib/huecos'
import { useT } from '../../i18n'

export default function CoverageMeter({ universe, zones, onSelectZone }) {
  const t = useT()
  const total = universe?.totalAmount || 0
  const located = universe?.locatedAmount || 0
  const pct = total > 0 ? (located / total) * 100 : 0
  const top = (zones || []).slice(0, 5)
  const maxAmt = top.length ? top[0].amount : 1
  // The span these contracts cover. Without it the figure sits on the same page
  // as "GASTOS TOTALES 41.578.252 €" — one municipal year — and the two invite a
  // comparison that is false: a reader concludes the town awards more in
  // contracts than it spends in a year, when this is nearly a decade of awards.
  // «El resto» es el resto de ESE importe, y la frase lo dice ahora. Decía «el
  // resto son contratos adjudicados», que es cierto de la barra —su universo es
  // sólo-adjudicado, `tender-geo.ts:146`— pero se leía como una afirmación sobre
  // toda la página, y el listado de abajo pinta el registro entero: 806 filas de
  // las que 699 están adjudicadas. El revisor de superficies lo señaló citando
  // esta frase, y tenía razón sobre la página aunque no sobre la barra.
  // El periodo es el del denominador (`totalDate*`, todos los contratos que suma
  // `totalAmount`), no el de los que tienen sitio en el mapa (`dateMin`/`dateMax`,
  // que mueve el deslizador). Un snapshot anterior a esos campos cae en los otros.
  const yearMin = (universe?.totalDateMin ?? universe?.dateMin ?? '').slice(0, 4)
  const yearMax = (universe?.totalDateMax ?? universe?.dateMax ?? '').slice(0, 4)
  const span = yearMin && yearMax ? `${yearMin}–${yearMax}` : null
  return (
    <div>
      <div style={{ fontSize: 'var(--fs-aux)', lineHeight: 1.4 }}>
        {conHuecos(
          t(
            span
              ? 'presupuesto.gasto.cobertura.conPeriodo'
              : 'presupuesto.gasto.cobertura.sinPeriodo',
          ),
          {
            '{total}': <strong>{eurosBreves(total)}</strong>,
            '{periodo}': (
              <strong>
                {rellena(t('presupuesto.gasto.cobertura.aLoLargo'), { periodo: span })}
              </strong>
            ),
            '{n}': yearMax - yearMin + 1,
            '{situado}': <strong>{eurosBreves(located)}</strong>,
            '{pct}': pct.toFixed(0),
          },
        )}
      </div>
      <div
        style={{
          height: 14,
          borderRadius: 'var(--r-pill)',
          overflow: 'hidden',
          display: 'flex',
          border: '1px solid var(--border2)',
          margin: '8px 0 6px',
        }}
      >
        <div style={{ width: pct + '%', background: 'var(--civic)' }} />
        <div style={{ flex: 1, background: 'var(--soft)' }} />
      </div>
      <div
        style={{
          fontSize: 'var(--fs-aux)',
          color: 'var(--ink50)',
          lineHeight: 1.4,
        }}
      >
        {t('presupuesto.gasto.cobertura.resto')}
      </div>
      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>
        {top.map((z) => (
          <button
            key={z.slug}
            onClick={() => onSelectZone(z.slug)}
            style={{
              all: 'unset',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 'var(--fs-meta)',
            }}
          >
            <span style={{ flex: 1 }}>{z.name}</span>
            <span
              style={{
                height: 6,
                width: Math.max(6, (z.amount / maxAmt) * 80),
                background: 'var(--civic)',
                borderRadius: 'var(--r-input)',
              }}
            />
            <span className="mono" style={{ fontWeight: 700, fontSize: 'var(--fs-micro)' }}>
              {eurosBreves(z.amount)}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
