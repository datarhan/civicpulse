import { ExtLink, LegendDot } from '../Primitives'
import { useJsonFetch } from '../../hooks/useJsonFetch'
import { puenteDePlantilla } from '../../scraper/plantilla-en-breve'
import { fmtDateLong, rellena } from '../../lib/formatters'
import { useLocale } from '../../i18n'

/**
 * «¿Cuánta gente trabaja en el Ayuntamiento?» — la plantilla municipal.
 *
 * Vivía en /cargos, debajo de los 21 electos, rotulada «Otra cosa · no son los
 * cargos electos»: en una página sobre electos, eran 180 palabras de método
 * para dos cifras que un vecino no podía cuadrar (auditoría de las dos
 * lecturas, §3, punto 5). Aquí es lo que se pregunta quien busca trabajo en el
 * Ayuntamiento, y /cargos deja una línea que apunta a ella.
 *
 * Antes, en la misma columna que los electos, una cifra de PERSONAS de 2021 se
 * leía junto a una de PUESTOS de 2024 y pedía que se restaran. La frase de
 * arriba (`puenteDePlantilla`) dice qué cuenta cada una y por qué no se
 * restan; debajo siguen las dos cifras con su método y sus fuentes, como
 * estaban. Que los puestos no incluyen al personal eventual lo dice la nota del
 * propio fichero (`authorized.note`): si un día cambia la fuente, la frase
 * `noSeRestan` se revisa con ella.
 */
export default function Plantilla() {
  const { t, locale } = useLocale()
  const { data } = useJsonFetch('/data/plantilla.json', null)
  if (!data || !data.total) return null
  const pct = (n) => Math.round((n / data.total) * 100)
  const anio = data.asOf ? String(data.asOf).slice(0, 4) : null
  const puente = puenteDePlantilla(data)
  const frase =
    puente &&
    [
      puente.personas &&
        rellena(t('empleoPublico.plantilla.personasFrase'), {
          n: puente.personas.n,
          anio: puente.personas.anio,
        }),
      puente.plazas &&
        rellena(t('empleoPublico.plantilla.plazasFrase'), {
          n: puente.plazas.aprox
            ? rellena(t('empleoPublico.plantilla.unas'), { n: puente.plazas.n })
            : puente.plazas.n,
          anio: puente.plazas.anio,
        }),
      puente.personas && puente.plazas && t('empleoPublico.plantilla.noSeRestan'),
    ]
      .filter(Boolean)
      .join(' ')
  return (
    <section
      id="plantilla"
      aria-labelledby="plantilla-titulo"
      style={{ marginTop: 32, scrollMarginTop: 16 }}
    >
      <h2
        id="plantilla-titulo"
        style={{ fontSize: 'var(--fs-head)', fontWeight: 700, margin: 0, lineHeight: 1.3 }}
      >
        {t('empleoPublico.plantilla.pregunta')}
      </h2>
      {frase && (
        <p
          data-puente-plantilla=""
          style={{ margin: '8px 0 0', color: 'var(--ink70)', lineHeight: 1.55, maxWidth: '64ch' }}
        >
          {frase}
        </p>
      )}
      <div
        style={{
          marginTop: 14,
          background: 'var(--soft)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-card)',
          padding: 20,
        }}
      >
        <div className="cp-plantilla-duo">
          <div>
            <h3 style={{ fontSize: 'var(--fs-head)', fontWeight: 700, margin: 0 }}>
              {t('empleoPublico.plantilla.title')}
            </h3>
            <div
              style={{
                display: 'flex',
                gap: 26,
                marginTop: 10,
                alignItems: 'baseline',
                flexWrap: 'wrap',
              }}
            >
              <div>
                <div className="mono" style={{ fontSize: 'var(--fs-card)', fontWeight: 700 }}>
                  {data.total}
                </div>
                <div
                  style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginTop: 2 }}
                >{`${t('empleoPublico.plantilla.personas')}${anio ? ` · ${anio}` : ''}`}</div>
              </div>
              {data.authorized && typeof data.authorized.plazas === 'number' && (
                <div>
                  <div
                    className="mono"
                    style={{ fontSize: 'var(--fs-card)', fontWeight: 700, color: 'var(--ink50)' }}
                  >
                    {data.authorized.approx ? '≈' : ''}
                    {data.authorized.plazas}
                  </div>
                  <div style={{ fontSize: 'var(--fs-micro)', color: 'var(--ink50)', marginTop: 2 }}>
                    {t('empleoPublico.plantilla.plazas')}
                    {data.authorized.asOf ? ` · ${data.authorized.asOf}` : ''}
                  </div>
                </div>
              )}
            </div>
            {typeof data.women === 'number' && typeof data.men === 'number' && (
              <>
                {/* Two tones a reader can actually tell apart. The second
                    segment was --intel-soft, which is a #f5f0ff wash: against the
                    band's own light ground it vanished, so a 52/48 split read as
                    a bar filled to 52 % and nothing else. Each figure carries its
                    own swatch, so the mapping never depends on reading order. */}
                <div
                  style={{
                    display: 'flex',
                    height: 10,
                    borderRadius: 'var(--r-pill)',
                    overflow: 'hidden',
                    marginTop: 14,
                  }}
                >
                  <span style={{ flex: data.women, background: 'var(--intel)' }} />
                  <span style={{ flex: data.men, background: 'var(--ink30)' }} />
                </div>
                <div
                  style={{
                    display: 'flex',
                    gap: 16,
                    marginTop: 7,
                    fontSize: 'var(--fs-micro)',
                    color: 'var(--ink70)',
                    flexWrap: 'wrap',
                  }}
                >
                  <LegendDot
                    color="var(--intel)"
                    label={
                      <span>
                        <span className="mono" style={{ fontWeight: 700 }}>
                          {data.women}
                        </span>{' '}
                        {t('empleoPublico.plantilla.mujeres')} · {pct(data.women)} %
                      </span>
                    }
                  />
                  <LegendDot
                    color="var(--ink30)"
                    label={
                      <span>
                        <span className="mono" style={{ fontWeight: 700 }}>
                          {data.men}
                        </span>{' '}
                        {t('empleoPublico.plantilla.hombres')} · {pct(data.men)} %
                      </span>
                    }
                  />
                </div>
              </>
            )}
          </div>
          <div>
            <p
              style={{
                margin: 0,
                fontSize: 'var(--fs-meta)',
                lineHeight: 1.6,
                color: 'var(--ink70)',
              }}
            >
              {data.note}
            </p>
            {data.authorized?.note && (
              <p
                style={{
                  margin: '9px 0 0',
                  fontSize: 'var(--fs-micro)',
                  lineHeight: 1.55,
                  color: 'var(--ink50)',
                }}
              >
                {data.authorized.note}{' '}
                {data.authorized.source?.url && (
                  <ExtLink href={data.authorized.source.url} style={{ color: 'var(--civic)' }}>
                    Fuente: {data.authorized.source.publisher} ↗
                  </ExtLink>
                )}
              </p>
            )}
            {data.source?.url && (
              <p
                style={{
                  margin: '9px 0 0',
                  fontSize: 'var(--fs-micro)',
                  lineHeight: 1.55,
                  color: 'var(--ink50)',
                }}
              >
                {t('empleoPublico.plantilla.fuenteSexo')}{' '}
                <ExtLink href={data.source.url} style={{ color: 'var(--civic)' }}>
                  {data.source.publisher}, {fmtDateLong(data.source.date, locale)} ↗
                </ExtLink>
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
