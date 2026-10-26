import { opinionesVisibles } from '../../scraper/opinion-editor'
import { fmtDateLong, rellena } from '../../lib/formatters'
import { useLocale, useT } from '../../i18n'

/*
 * La opinión del editor, arriba del todo en /eficiencia.
 *
 * Es la única pieza de la página que JUZGA, y por eso va en su propio marco,
 * rotulada como opinión antes que nada y firmada por una persona: un lector
 * tiene que saber que esto ya no es el dato del ministerio sino lo que alguien
 * de CivicPulse concluye de él, con su nombre. Debajo van, siempre y en el
 * mismo marco, los hechos en que se basa, lo que no sabemos, el contacto previo
 * con quien se nombra y su réplica íntegra. Una opinión sin esas cuatro cosas
 * no llega aquí: el validador de `src/scraper/opinion-editor.ts` no la deja
 * publicarse.
 *
 * Durante la ventana LOREG no se pinta ninguna opinión que nombre a alguien
 * (`opinionesVisibles`).
 */

function enlaceDeHecho(h, resultados) {
  if (h.tipo === 'indicador') return `/eficiencia/${h.id}`
  if (h.tipo === 'resultado') {
    const r = resultados.find((x) => x.id === h.id)
    return r ? `/eficiencia/${r.servicioRelacionado}` : '#sec-cuesta'
  }
  return '#hallazgos'
}

function Opinion({ o, etiquetas, resultados }) {
  const t = useT()
  const { locale } = useLocale()
  const fecha = (iso) => fmtDateLong(iso, locale)
  const c = o.contactoPrevio
  return (
    <article className="cp-opinion" data-opinion={o.id} aria-labelledby={`op-${o.id}`}>
      <div className="cp-opinion-rotulo">{t('opinion.rotulo')}</div>
      <h2 id={`op-${o.id}`} className="cp-opinion-titulo">
        {o.titulo}
      </h2>
      <p className="cp-opinion-firma">
        {rellena(t('opinion.firma'), {
          nombre: o.firma.nombre,
          rol: o.firma.rol,
          fecha: fecha(o.fecha),
        })}
      </p>
      <div className="cp-opinion-cuerpo">
        {o.cuerpo.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>

      <div className="cp-opinion-anexos">
        <section>
          <h3>{t('opinion.hechos')}</h3>
          <ul>
            {o.hechos.map((h, i) => (
              <li key={i}>
                <a href={enlaceDeHecho(h, resultados)}>{etiquetas.get(h.id) ?? h.id}</a>
                {h.anio != null && <span className="cp-opinion-meta"> · {h.anio}</span>}
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h3>{t('opinion.noSabemos')}</h3>
          <ul>
            {o.noSabemos.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </section>
      </div>

      {c && (
        <section className="cp-opinion-contacto" data-opinion-contacto="">
          <h3>{t('opinion.contacto')}</h3>
          <p>
            {rellena(t('opinion.contacto.enviado'), {
              nombres: o.nombra.map((p) => p.nombre).join(', '),
              fecha: fecha(c.enviadoEl),
              canal: c.canal,
              dias: c.plazoDias,
            })}
          </p>
          {c.respuesta ? (
            <blockquote className="cp-opinion-replica">
              <p>{c.respuesta.texto}</p>
              <footer>
                {fecha(c.respuesta.fecha)}
                {c.respuesta.url && (
                  <>
                    {' · '}
                    <a href={c.respuesta.url}>{t('opinion.fuente')}</a>
                  </>
                )}
              </footer>
            </blockquote>
          ) : (
            <p className="cp-opinion-meta">{t('opinion.contacto.sinRespuesta')}</p>
          )}
        </section>
      )}

      {o.replicas.length > 0 && (
        <section className="cp-opinion-contacto">
          <h3>{t('opinion.replicas')}</h3>
          {o.replicas.map((r, i) => (
            <blockquote key={i} className="cp-opinion-replica">
              <p>{r.texto}</p>
              <footer>
                {r.autor} · {fecha(r.fecha)}
                {r.url && (
                  <>
                    {' · '}
                    <a href={r.url}>{t('opinion.fuente')}</a>
                  </>
                )}
              </footer>
            </blockquote>
          ))}
        </section>
      )}

      {o.correcciones.length > 0 && (
        <details className="cp-opinion-correcciones">
          {/* Decía «Corregida 1 vez/veces»: el plural de máquina, con una sola. */}
          <summary>
            {o.correcciones.length === 1
              ? t('opinion.correcciones.una')
              : rellena(t('opinion.correcciones'), { n: o.correcciones.length })}
          </summary>
          <ul>
            {o.correcciones.map((k, i) => (
              <li key={i}>
                {fecha(k.fecha)} · {k.motivo}
                <div className="cp-opinion-meta">
                  {t('opinion.antes')} «{k.antes.titulo}»
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}

      <p className="cp-opinion-meta">
        {t('opinion.replicaVia')} <a href="/aviso-legal#opinion">{t('opinion.avisoLegal')}</a>
        {' · '}
        <a href="/metodologia#opinion-editor">{t('opinion.comoSeHace')}</a>
      </p>
    </article>
  )
}

/**
 * @param {{ opiniones: any, panel: 'coste-efectivo' | 'gestion', nombresOn: boolean, data: any }} props
 */
export function OpinionEditor({ opiniones, panel, nombresOn, data }) {
  const visibles = opinionesVisibles(opiniones, panel, nombresOn)
  if (visibles.length === 0) return null
  const etiquetas = new Map([
    ...(data?.indicadores ?? []).map((i) => [i.id, i.etiqueta]),
    ...(data?.resultados?.items ?? []).map((r) => [r.id, r.etiqueta]),
  ])
  const resultados = data?.resultados?.items ?? []
  return (
    <div className="cp-opiniones" data-opiniones="">
      {visibles.map((o) => (
        <Opinion key={o.id} o={o} etiquetas={etiquetas} resultados={resultados} />
      ))}
    </div>
  )
}
