import { useOfficials, partyColor } from '../../../hooks/useOfficials'
import { usePromises, isPromiseFrozen } from '../../../hooks/usePromises'
import { usePlenoAgendas } from '../../../hooks/usePlenoAgendas'
import { PALETTE, MONO } from '../tokens'
import { useT } from '../../../i18n'
import { rotuloPlazosVencidos } from '../../../lib/plazos-vencidos'
import { rellena } from '../../../lib/formatters'
import { ALLOWED_DEPARTMENT_SLUGS } from '../../../scraper/departments'
import { promesasPorPartido } from '../../../scraper/en-breve-portada'
import { SectionHeader } from '../SectionHeader'

export function CoalitionRing() {
  const t = useT()
  const { loading, error, data } = useOfficials()
  if (loading || error || !data) return null
  const order = ['PSOE', 'PP', 'VOX', 'Compromís', 'Ciudadanos', 'EU-Podem', 'Otro']
  const items = order.filter((p) => data.composition[p]).map((p) => ({ p, n: data.composition[p] }))
  return (
    <div>
      <SectionHeader
        tone="pleno"
        title={t('landing.section.pleno')}
        meta={`${data.count} ${t('landing.escanos')}`}
      />
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: 12,
          borderRadius: 'var(--r-input)',
          overflow: 'hidden',
          border: `1px solid ${PALETTE.hair}`,
        }}
      >
        {items.map(({ p, n }) => (
          <div
            key={p}
            title={`${p}: ${n}`}
            style={{
              flex: n,
              background: partyColor(p),
              display: 'grid',
              placeItems: 'center',
              color: 'white',
              fontFamily: MONO,
              fontSize: 'var(--fs-micro)',
              fontWeight: 700,
            }}
          >
            {n}
          </div>
        ))}
      </div>
      <div
        style={{
          display: 'flex',
          gap: 10,
          marginTop: 6,
          flexWrap: 'wrap',
          fontSize: 'var(--fs-micro)',
        }}
      >
        {items.map(({ p, n }) => (
          <span key={p} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: partyColor(p),
                display: 'inline-block',
              }}
            />
            <span style={{ fontWeight: 600 }}>{p}</span>
            <span className="mono" style={{ color: PALETTE.ink60 }}>
              {n}
            </span>
          </span>
        ))}
      </div>
    </div>
  )
}

export function PromesasBlockD() {
  const t = useT()
  const { loading, error, data } = usePromises()
  // El padrón decide si la frase puede nombrar la alcaldía: se espera a que
  // llegue, para no pintar el reparto por partidos y cambiarlo un instante después.
  const officials = useOfficials()
  if (loading || error || !data || officials.loading) return null
  const frozen = isPromiseFrozen(data)
  const { total, partidos, todasDeLaAlcaldia } = promesasPorPartido(data.items, officials.data)
  if (total === 0) return null
  return (
    <div>
      <SectionHeader
        tone="promesas"
        title={t('landing.section.promesas')}
        badge={
          frozen && (
            <span
              className="mono"
              style={{
                fontSize: 'var(--fs-micro)',
                color: PALETTE.crit,
                background: 'rgba(220,38,38,.08)',
                padding: '1px 6px',
                borderRadius: 'var(--r-input)',
                letterSpacing: '.08em',
                textTransform: 'uppercase',
                fontWeight: 700,
              }}
            >
              {t('landing.promesas.congelado')}
            </span>
          )
        }
      />
      {/* Una frase, no «12 · PSOE · 12»: el número de la cabecera y el de la
          pastilla eran el mismo dicho dos veces, sin decir de qué. */}
      <div
        style={{
          fontSize: 'var(--fs-aux)',
          fontWeight: 600,
          color: PALETTE.ink,
          lineHeight: 1.4,
          marginBottom: 6,
        }}
      >
        {todasDeLaAlcaldia
          ? rellena(
              t(total === 1 ? 'landing.promesas.delAlcaldia.una' : 'landing.promesas.delAlcaldia'),
              { n: total, partido: todasDeLaAlcaldia },
            )
          : rellena(t('landing.promesas.porPartido'), { n: total })}
      </div>
      {!todasDeLaAlcaldia && (
        <div
          style={{
            display: 'flex',
            gap: 6,
            flexWrap: 'wrap',
            fontSize: 'var(--fs-micro)',
            marginBottom: 8,
          }}
        >
          {partidos.map(([party, n]) => (
            <span
              key={party}
              style={{
                fontFamily: MONO,
                fontSize: 'var(--fs-micro)',
                fontWeight: 700,
                color: 'white',
                background: partyColor(party),
                padding: '2px 7px',
                borderRadius: 'var(--r-pill)',
              }}
            >
              {party} · {n}
            </span>
          ))}
        </div>
      )}
      <div
        style={{
          fontSize: 'var(--fs-aux)',
          color: PALETTE.ink80,
          lineHeight: 1.45,
          marginBottom: 6,
        }}
      >
        {t('landing.promesas.blurb')}
      </div>
      <a
        href="/promesas"
        style={{
          color: PALETTE.accent,
          textDecoration: 'none',
          fontSize: 'var(--fs-micro)',
          fontWeight: 600,
        }}
      >
        {t('landing.promesas.cta')}
      </a>
    </div>
  )
}

export function DepartamentosBlockD() {
  const t = useT()
  const { data: agendas } = usePlenoAgendas()
  const promisesSnap = usePromises()
  if (!agendas?.stats) return null
  const frozen = isPromiseFrozen(promisesSnap.data)
  const vencidos = frozen ? 0 : (agendas.stats.plazosVencidosCount ?? 0)
  // `deptCoverage` cuenta, sobre el registro de concejalías, las que tienen un
  // concejal responsable (scripts/compute-dept-stats.ts). El total sale del
  // mismo registro: era un 28 escrito aquí, cierto hasta que cambiara la lista.
  const coverage = agendas.stats.deptCoverage ?? null
  const totalDepts = ALLOWED_DEPARTMENT_SLUGS.length
  return (
    <div>
      <SectionHeader
        tone="rendicion"
        title={t('landing.section.rendicion')}
        badge={
          !frozen &&
          vencidos > 0 && (
            <span
              className="mono"
              style={{
                fontSize: 'var(--fs-micro)',
                color: PALETTE.warnInk,
                background: 'rgba(217,119,6,.10)',
                padding: '1px 6px',
                borderRadius: 'var(--r-input)',
                letterSpacing: '.08em',
                textTransform: 'uppercase',
                fontWeight: 700,
              }}
            >
              ⚠ {vencidos} {rotuloPlazosVencidos(vencidos, t)}
            </span>
          )
        }
      />
      {/* Una frase en vez de «28 · 26/28 · 21». Los 21 concejales se van: al lado
          de 28 concejalías se leían como que se las reparten, y la oposición no
          lleva ninguna. Los escaños ya están en el bloque del pleno. «Consta»:
          que no conste quién lleva una no prueba que nadie la lleve. */}
      <div
        style={{
          fontSize: 'var(--fs-aux)',
          fontWeight: 600,
          color: PALETTE.ink,
          lineHeight: 1.4,
          marginBottom: 6,
        }}
      >
        {coverage !== null
          ? rellena(t('landing.rendicion.cobertura'), { total: totalDepts, n: coverage })
          : rellena(t('landing.rendicion.total'), { total: totalDepts })}
      </div>
      <div
        style={{
          fontSize: 'var(--fs-aux)',
          color: PALETTE.ink80,
          lineHeight: 1.45,
          marginBottom: 6,
        }}
      >
        {t('landing.rendicion.blurb')}
      </div>
      <a
        href="/departamentos"
        style={{
          color: PALETTE.accent,
          textDecoration: 'none',
          fontSize: 'var(--fs-micro)',
          fontWeight: 600,
        }}
      >
        {t('landing.rendicion.cta')}
      </a>
    </div>
  )
}
